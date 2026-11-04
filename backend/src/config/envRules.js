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

// A frontend origin: http(s) scheme, host and port only. A trailing "/" is allowed and removed
// ("http://localhost:5173/" → "http://localhost:5173"); a path, query, fragment, credentials or
// "*" in the host is refused. Returns the origin, or null when invalid.
function parseOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const originOnly = (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash && !url.username && !url.password;
  if (!['http:', 'https:'].includes(url.protocol) || !originOnly || url.hostname.includes('*')) return null;
  return url.origin;
}

// CLIENT_URL: the frontend origin. Required; checked by readEnv.
function readClientOrigin(clientUrl, errors) {
  if (!clientUrl) return null;
  const origin = parseOrigin(clientUrl);
  if (!origin) {
    errors.push('CLIENT_URL must be the frontend origin only (http(s) scheme, host and port, no path), e.g. http://localhost:5173');
  }
  return origin;
}

// CORS_ORIGINS: optional comma-separated extra frontend origins (exact http(s) origins, no
// paths or wildcards), e.g. "http://localhost:5174,http://127.0.0.1:5173". CLIENT_URL's origin
// is always allowed, always first, and stays the only base for links in emails.
function readCorsOrigins(source, clientOrigin, errors) {
  const origins = clientOrigin ? [clientOrigin] : [];
  for (const value of String(source.CORS_ORIGINS ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    if (value === '*') {
      errors.push('CORS_ORIGINS cannot be "*": list each allowed frontend origin');
      continue;
    }
    const origin = parseOrigin(value);
    if (!origin) {
      errors.push(`CORS_ORIGINS must contain origins only (http(s) scheme, host and port, no path or wildcard), got "${value}"`);
      continue;
    }
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

// JWT_EXPIRES_IN: login token lifetime as a whole number and one unit, s, m, h or d ("30m", "12h",
// "1d"), from 5 minutes to 30 days. Default 1d. A bare number is refused because jsonwebtoken
// reads it as milliseconds ("3600" would be 3.6 seconds).
export const JWT_EXPIRY_LIMITS_SECONDS = Object.freeze({ min: 5 * 60, max: 30 * 24 * 60 * 60 });
const JWT_EXPIRY_UNIT_SECONDS = Object.freeze({ s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 });
const DEFAULT_JWT_EXPIRES_IN = '1d';

function readJwtExpiresIn(source, errors) {
  const raw = source.JWT_EXPIRES_IN;
  if (raw === undefined || raw === '') return DEFAULT_JWT_EXPIRES_IN;
  const match = /^([1-9]\d{0,6})([smhd])$/.exec(raw);
  const seconds = match ? Number(match[1]) * JWT_EXPIRY_UNIT_SECONDS[match[2]] : NaN;
  if (!(seconds >= JWT_EXPIRY_LIMITS_SECONDS.min && seconds <= JWT_EXPIRY_LIMITS_SECONDS.max)) {
    errors.push(`JWT_EXPIRES_IN must be a whole number with a unit s, m, h or d, from 5m to 30d (e.g. 12h or 1d), got "${raw}"`);
    return DEFAULT_JWT_EXPIRES_IN;
  }
  return raw;
}

// TRUST_PROXY: how many proxies in front of the API add the client's address to X-Forwarded-For
// (and set X-Forwarded-Proto). A whole number from 0 to 10; default 0 (no proxy: local
// development). Express then takes the client address from that many hops back, so req.ip is
// the real client (rate limits) and req.secure reflects HTTPS at the proxy (HSTS). Too high a
// number lets a client pick its own address; "true" and "*" trust every hop and are refused.
export const MAX_TRUST_PROXY = 10;

function readTrustProxy(source, errors) {
  const raw = source.TRUST_PROXY;
  if (raw === undefined || raw === '') return 0;
  if (!/^(?:[0-9]|10)$/.test(raw)) {
    errors.push(`TRUST_PROXY must be a whole number from 0 to ${MAX_TRUST_PROXY} (the number of proxies in front of the API), got "${raw}"`);
    return 0;
  }
  return Number(raw);
}

// Startup lines for the log: which database and email transport are in use. Never includes
// the connection string, credentials, SMTP passwords or the Resend API key.
export function describeConfig(env) {
  const { email } = env;
  const transport = {
    smtp: `smtp via ${email.smtp.host ?? '(no host)'}:${email.smtp.port} — real emails will be sent`,
    resend: 'resend (HTTP API) — real emails will be sent',
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
  // Vercel sets VERCEL. Without NODE_ENV=production the production checks would be skipped
  // silently (short secrets accepted, emails written to files instead of sent), so refuse.
  if (source.VERCEL && nodeEnv !== 'production') {
    errors.push('NODE_ENV must be "production" on Vercel (VERCEL is set): add NODE_ENV=production to the project\'s environment variables');
  }
  const jwtSecret = source.JWT_SECRET;
  if (nodeEnv === 'production' && jwtSecret) {
    if (jwtSecret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
      errors.push(`JWT_SECRET must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production`);
    } else if (PLACEHOLDER_SECRETS.includes(jwtSecret.toLowerCase())) {
      errors.push('JWT_SECRET is still the example placeholder; set a long random value in production');
    }
  }

  const clientUrl = source.CLIENT_URL;
  const clientOrigin = readClientOrigin(clientUrl, errors);

  // Without a database in the URI, MongoDB silently uses "test": easy to confuse with test data
  // and different from what teammates expect. Refused in production, warned about elsewhere.
  const mongodbDatabase = source.MONGODB_URI ? databaseNameOf(source.MONGODB_URI) : '';
  if (source.MONGODB_URI && !mongodbDatabase) {
    const message = 'MONGODB_URI names no database, so MongoDB uses its default "test". Add the name after the host, e.g. …mongodb.net/helpdesk?retryWrites=true';
    if (nodeEnv === 'production') errors.push(message);
    else warnings.push(message);
  }
  const corsOrigins = readCorsOrigins(source, clientOrigin, errors);

  const email = readEmailConfig(source, nodeEnv, errors);
  // Resolution targets per priority (SLA_HOURS_HIGH / _MEDIUM / _LOW); defaults 24 / 72 / 168.
  const sla = readSlaPolicy(source);
  errors.push(...sla.errors);
  const windowMs = readNonNegativeInteger(source, 'AUTH_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS, errors);
  const limitsOff = nodeEnv === 'test';

  const env = {
    port: Number(source.PORT) || 4000,
    // Express "trust proxy" hop count; see readTrustProxy.
    trustProxy: readTrustProxy(source, errors),
    mongodbUri: source.MONGODB_URI,
    mongodbDatabase: mongodbDatabase || 'test',
    mongodbDatabaseExplicit: Boolean(mongodbDatabase),
    jwtSecret,
    // Token lifetime (contract C-3, still open); see readJwtExpiresIn for the accepted format.
    jwtExpiresIn: readJwtExpiresIn(source, errors),
    // The frontend origin, without a trailing "/": the base for links in emails (never the
    // request's Host header).
    clientUrl: clientOrigin ?? clientUrl,
    // Origins allowed by CORS: CLIENT_URL's first, then any from CORS_ORIGINS.
    corsOrigins,
    nodeEnv,
    // Running on Vercel (it sets VERCEL): used to report background work that Vercel was not asked
    // to wait for (services/email.js).
    onVercel: Boolean(source.VERCEL),
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
export const EMAIL_TRANSPORTS = Object.freeze(['smtp', 'resend', 'outbox', 'memory', 'disabled']);

function readPositive(source, name, fallback, errors) {
  const value = readNonNegativeInteger(source, name, fallback, errors);
  if (value === 0) {
    errors.push(`${name} must be at least 1`);
    return fallback;
  }
  return value;
}

// EMAIL_TRANSPORT: smtp (real delivery through any SMTP server), resend (real delivery through the
// Resend HTTP API), outbox (development: writes emails to backend/.outbox), memory (tests),
// disabled (nothing is sent). Defaults: test → memory, production → smtp, otherwise outbox.
// Production must not use outbox or memory. Messages name settings, never their values.
const REQUIRED_EMAIL_SETTINGS = Object.freeze({ smtp: ['SMTP_HOST', 'EMAIL_FROM'], resend: ['RESEND_API_KEY', 'EMAIL_FROM'] });

function readEmailConfig(source, nodeEnv, errors) {
  const fallback = nodeEnv === 'test' ? 'memory' : nodeEnv === 'production' ? 'smtp' : 'outbox';
  const transport = source.EMAIL_TRANSPORT || fallback;
  if (!EMAIL_TRANSPORTS.includes(transport)) {
    errors.push(`EMAIL_TRANSPORT must be one of: ${EMAIL_TRANSPORTS.join(', ')}`);
  }
  if (nodeEnv === 'production' && ['outbox', 'memory'].includes(transport)) {
    errors.push(`EMAIL_TRANSPORT=${transport} is for development and tests only; use smtp or resend (or disabled) in production`);
  }

  const sendsRealEmail = Boolean(REQUIRED_EMAIL_SETTINGS[transport]);
  const from = source.EMAIL_FROM || (sendsRealEmail ? '' : 'Help Desk <no-reply@helpdesk.local>');
  if (sendsRealEmail) {
    const missing = REQUIRED_EMAIL_SETTINGS[transport].filter((key) => !source[key]);
    if (missing.length > 0) {
      errors.push(`EMAIL_TRANSPORT=${transport} needs: ${missing.join(', ')} (or set EMAIL_TRANSPORT=disabled)`);
    }
  }

  return {
    transport,
    from,
    // resend only. A secret: never logged or shown in messages.
    resend: { apiKey: source.RESEND_API_KEY || undefined },
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
