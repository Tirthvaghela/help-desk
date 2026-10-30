import dotenv from 'dotenv';

// Shared safety checks for the setup scripts. They read MONGODB_URI (environment first,
// then backend/.env) and refuse to touch a remote or production database unless the
// matching flag is passed explicitly. Connection strings are never printed.

dotenv.config({ quiet: true });

export function describeTarget(uri) {
  let url;
  try {
    url = new URL(uri);
  } catch {
    throw new Error('MONGODB_URI is not a valid connection string');
  }
  const host = url.hostname;
  const local = url.protocol === 'mongodb:' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  const database = url.pathname.replace(/^\//, '') || '(default database)';
  return { local, database, label: `${local ? 'local MongoDB' : 'REMOTE MongoDB'} · database "${database}"` };
}

// Returns the URI to connect to, or exits with a clear message. `readOnly` scripts may read
// any database (that is how a production check works); writing ones need the flags below.
export function requireSafeTarget(argv, { readOnly = false } = {}) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set (environment or backend/.env).');
    process.exit(1);
  }
  const target = describeTarget(uri);
  console.log(`Target: ${target.label}${readOnly ? ' (read-only)' : ''}`);
  if (readOnly) return uri;

  if (!target.local && !argv.includes('--allow-remote')) {
    console.error('Refusing to write to a remote database. Re-run with --allow-remote if this is intended.');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && !argv.includes('--allow-production')) {
    console.error('Refusing to run with NODE_ENV=production. Re-run with --allow-production if this is intended.');
    process.exit(1);
  }
  return uri;
}

// Demo data is stricter than the setup scripts and has no override flags: only a local
// database whose name marks it for development or testing, and never in production.
const DEMO_DATABASE_PATTERN = /_(demo|dev|test)$/;

// { ok: true, label } or { ok: false, label, reason }. Never includes the connection string.
export function checkDemoTarget(uri, nodeEnv) {
  if (!uri) return { ok: false, label: '(none)', reason: 'MONGODB_URI is not set (environment or backend/.env).' };
  let target;
  try {
    target = describeTarget(uri);
  } catch {
    return { ok: false, label: '(invalid)', reason: 'MONGODB_URI is not a valid single-host connection string.' };
  }
  if (!target.local) {
    return { ok: false, label: target.label, reason: 'Demo data is only written to a local MongoDB (localhost, 127.0.0.1 or ::1).' };
  }
  if (!DEMO_DATABASE_PATTERN.test(target.database)) {
    return {
      ok: false,
      label: target.label,
      reason: 'The database name must end in _demo, _dev or _test, e.g. mongodb://127.0.0.1:27017/helpdesk_demo.',
    };
  }
  if (nodeEnv === 'production') {
    return { ok: false, label: target.label, reason: 'Demo data is never written with NODE_ENV=production.' };
  }
  return { ok: true, label: target.label };
}

// Returns the URI to connect to, or exits with the reason.
export function requireDemoTarget() {
  const check = checkDemoTarget(process.env.MONGODB_URI, process.env.NODE_ENV);
  console.log(`Target: ${check.label}`);
  if (!check.ok) {
    console.error(`Refusing to seed demo data. ${check.reason}`);
    process.exit(1);
  }
  return process.env.MONGODB_URI;
}
