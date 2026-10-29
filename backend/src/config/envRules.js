// Pure validation of environment variables, kept separate from env.js so it can be tested
// without exiting the process. Messages never include secret values.

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

// Returns { env, errors }. `errors` is empty when the configuration is usable.
export function readEnv(source) {
  const errors = [];
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

  const email = readEmailConfig(source, nodeEnv, errors);
  const windowMs = readNonNegativeInteger(source, 'AUTH_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS, errors);
  const limitsOff = nodeEnv === 'test';

  const env = {
    port: Number(source.PORT) || 4000,
    mongodbUri: source.MONGODB_URI,
    jwtSecret,
    // Token lifetime (contract C-3, still open); any value jsonwebtoken accepts, e.g. "1d", "12h".
    jwtExpiresIn: source.JWT_EXPIRES_IN || '1d',
    // Also the origin used to build links in emails (never the request's Host header).
    clientUrl,
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
  };
  return { env, errors };
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
