// Pure validation of environment variables, kept separate from env.js so it can be tested
// without exiting the process. Messages never include secret values.
import { readSlaPolicy } from '../utils/sla.js';

export const REQUIRED_ENV = Object.freeze(['MONGODB_URI', 'JWT_SECRET', 'CLIENT_URL']);

// Production refuses short JWT secrets and the placeholder from .env.example. Development
// and test keep accepting any non-empty value so local setup stays simple.
export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRETS = Object.freeze(['replace-with-a-long-random-string', 'changeme', 'secret']);

// Sign-in/sign-up rate limit per client IP. AUTH_RATE_LIMIT_MAX=0 turns it off.
// Off by default in tests (many logins come from one address); 20 per 15 minutes otherwise.
const DEFAULT_RATE_LIMIT_MAX = 20;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function readNonNegativeInteger(source, name, fallback, errors) {
  const raw = source[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    errors.push(`${name} must be a whole number (0 or more)`);
    return fallback;
  }
  return Number(raw);
}

// The database named in a MongoDB connection string, or '' when there is none
// ("mongodb+srv://user:pass@cluster.example/?retryWrites=true" names none; MongoDB then
// uses "test"). Works for multi-host and +srv strings, which new URL() cannot parse.
export function databaseNameOf(uri) {
  const rest = String(uri ?? '').replace(/^mongodb(\+srv)?:\/\//, '');
  const afterHosts = rest.slice(rest.lastIndexOf('@') + 1);
  const slash = afterHosts.indexOf('/');
  if (slash === -1) return '';
  const name = afterHosts.slice(slash + 1).split('?')[0];
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

// CORS_ORIGINS: optional comma-separated extra frontend origins (exact http(s) origins, no
// paths or wildcards), e.g. "http://localhost:5174,http://127.0.0.1:5173". CLIENT_URL's origin
// is always allowed and stays the only base for links in emails.
function readCorsOrigins(source, clientUrl, errors) {
  const origins = [];
  const add = (value, name) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      errors.push(`${name} must contain full http(s) origins, e.g. http://localhost:5174 (got "${value}")`);
      return;
    }
    if (!['http:', 'https:'].includes(url.protocol) || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username) {
      errors.push(`${name} must contain origins only (scheme, host and port, no path), got "${value}"`);
      return;
    }
    if (!origins.includes(url.origin)) origins.push(url.origin);
  };
  if (clientUrl) {
    try {
      origins.push(new URL(clientUrl).origin);
    } catch {
      // Reported by the CLIENT_URL check.
    }
  }
  for (const value of String(source.CORS_ORIGINS ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    if (value === '*') {
      errors.push('CORS_ORIGINS cannot be "*": list each allowed frontend origin');
      continue;
    }
    add(value, 'CORS_ORIGINS');
  }
  return origins;
}

// Startup lines for the log: which database and email transport are in use. Never includes
// the connection string, credentials or SMTP passwords.
export function describeConfig(env) {
  const { email } = env;
  const transport = {
    smtp: `smtp via ${email.smtp.host ?? '(no host)'}:${email.smtp.port} — real emails will be sent`,
    outbox: `outbox → ${email.outboxDir ?? 'backend/.outbox'} (nothing is sent)`,
    memory: 'memory (tests; nothing is sent)',
    disabled: 'disabled (no emails; password reset cannot work)',
  }[email.transport] ?? email.transport;
  return [
    `Database: "${env.mongodbDatabase}"${env.mongodbDatabaseExplicit ? '' : ' (MongoDB default; MONGODB_URI names no database)'}`,
    `Email: ${transport}`,
    `CORS origins: ${env.corsOrigins.join(', ') || '(none)'}`,
    `SLA resolution targets: high ${env.sla.high} h, medium ${env.sla.medium} h, low ${env.sla.low} h (calendar hours)`,
  ];
}

// Returns { env, errors, warnings }. `errors` is empty when the configuration is usable;
// `warnings` are printed but do not stop the server.
export function readEnv(source) {
  const errors = [];
  const warnings = [];
  const missing = REQUIRED_ENV.filter((key) => !source[key]);
  if (missing.length > 0) {
    errors.push(`Missing environment variables: ${missing.join(', ')}`);
  }

  const nodeEnv = source.NODE_ENV || 'development';
  const jwtSecret = source.JWT_SECRET;
  if (nodeEnv === 'production' && jwtSecret) {
    if (jwtSecret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
      errors.push(`JWT_SECRET must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production`);
    } else if (PLACEHOLDER_SECRETS.includes(jwtSecret.toLowerCase())) {
      errors.push('JWT_SECRET is still the example placeholder; set a long random value in production');
    }
  }

  const clientUrl = source.CLIENT_URL;
  if (clientUrl) {
    try {
      const url = new URL(clientUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch {
      errors.push('CLIENT_URL must be a full http(s) URL, e.g. http://localhost:5173');
    }
  }

  // Without a database in the URI, MongoDB silently uses "test": easy to confuse with test data
  // and different from what teammates expect. Refused in production, warned about elsewhere.
  const mongodbDatabase = source.MONGODB_URI ? databaseNameOf(source.MONGODB_URI) : '';
  if (source.MONGODB_URI && !mongodbDatabase) {
    const message = 'MONGODB_URI names no database, so MongoDB uses its default "test". Add the name after the host, e.g. …mongodb.net/helpdesk?retryWrites=true';
    if (nodeEnv === 'production') errors.push(message);
    else warnings.push(message);
  }
  const corsOrigins = readCorsOrigins(source, clientUrl, errors);

  const email = readEmailConfig(source, nodeEnv, errors);
  // Resolution targets per priority (SLA_HOURS_HIGH / _MEDIUM / _LOW); defaults 24 / 72 / 168.
  const sla = readSlaPolicy(source);
  errors.push(...sla.errors);
  const windowMs = readNonNegativeInteger(source, 'AUTH_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS, errors);
  const limitsOff = nodeEnv === 'test';

  const env = {
    port: Number(source.PORT) || 4000,
    mongodbUri: source.MONGODB_URI,
    mongodbDatabase: mongodbDatabase || 'test',
    mongodbDatabaseExplicit: Boolean(mongodbDatabase),
    jwtSecret,
    // Token lifetime (contract C-3, still open); any value jsonwebtoken accepts, e.g. "1d", "12h".
    jwtExpiresIn: source.JWT_EXPIRES_IN || '1d',
    // The origin used to build links in emails (never the request's Host header).
    clientUrl,
    // Origins allowed by CORS: CLIENT_URL's, then any from CORS_ORIGINS.
    corsOrigins,
    nodeEnv,
    authRateLimit: {
      max: readNonNegativeInteger(source, 'AUTH_RATE_LIMIT_MAX', limitsOff ? 0 : DEFAULT_RATE_LIMIT_MAX, errors),
      windowMs,
    },
    // Password-reset requests, reset-link checks and account-security changes.
    sensitiveRateLimit: {
      max: readNonNegativeInteger(source, 'SENSITIVE_RATE_LIMIT_MAX', limitsOff ? 0 : DEFAULT_SENSITIVE_RATE_LIMIT_MAX, errors),
      windowMs,
    },
    passwordResetTtlMinutes: readPositive(source, 'PASSWORD_RESET_TTL_MINUTES', 30, errors),
    emailChangeTtlHours: readPositive(source, 'EMAIL_CHANGE_TTL_HOURS', 24, errors),
    email,
    sla: sla.policy,
  };
  return { env, errors, warnings };
}

const DEFAULT_SENSITIVE_RATE_LIMIT_MAX = 5;
export const EMAIL_TRANSPORTS = Object.freeze(['smtp', 'outbox', 'memory', 'disabled']);

function readPositive(source, name, fallback, errors) {
  const value = readNonNegativeInteger(source, name, fallback, errors);
  if (value === 0) {
    errors.push(`${name} must be at least 1`);
    return fallback;
  }
  return value;
}

// EMAIL_TRANSPORT: smtp (real delivery), outbox (development: writes emails to
// backend/.outbox), memory (tests), disabled (nothing is sent). Defaults: test → memory,
// production → smtp, otherwise outbox. Production must not use outbox or memory.
function readEmailConfig(source, nodeEnv, errors) {
  const fallback = nodeEnv === 'test' ? 'memory' : nodeEnv === 'production' ? 'smtp' : 'outbox';
  const transport = source.EMAIL_TRANSPORT || fallback;
  if (!EMAIL_TRANSPORTS.includes(transport)) {
    errors.push(`EMAIL_TRANSPORT must be one of: ${EMAIL_TRANSPORTS.join(', ')}`);
  }
  if (nodeEnv === 'production' && ['outbox', 'memory'].includes(transport)) {
    errors.push(`EMAIL_TRANSPORT=${transport} is for development and tests only; use smtp (or disabled) in production`);
  }

  const from = source.EMAIL_FROM || (transport === 'smtp' ? '' : 'Help Desk <no-reply@helpdesk.local>');
  if (transport === 'smtp') {
    const missing = ['SMTP_HOST', 'EMAIL_FROM'].filter((key) => !source[key]);
    if (missing.length > 0) {
      errors.push(`EMAIL_TRANSPORT=smtp needs: ${missing.join(', ')} (or set EMAIL_TRANSPORT=disabled)`);
    }
  }

  return {
    transport,
    from,
    // outbox only; default backend/.outbox (git-ignored)
    outboxDir: source.EMAIL_OUTBOX_DIR || null,
    smtp: {
      host: source.SMTP_HOST,
      port: Number(source.SMTP_PORT) || 587,
      secure: source.SMTP_SECURE === 'true',
      // SMTP_USERNAME / SMTP_PASSWORD are accepted as alternative names.
      user: source.SMTP_USER || source.SMTP_USERNAME || undefined,
      pass: source.SMTP_PASS || source.SMTP_PASSWORD || undefined,
    },
  };
}
