// Preloaded before every test file (see the "test" script in package.json).
// These values are set before src/config/env.js runs, and dotenv never overrides
// variables that already exist, so tests always use the test database even when
// a developer's backend/.env points at real data.
import { assertLocalTestUri } from './helpers/localTestUri.js';

const testDatabaseUri = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/helpdesk_test';
// Stops every test file before anything can connect, if MONGODB_URI_TEST is not local.
assertLocalTestUri(testDatabaseUri);
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = testDatabaseUri;
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.CLIENT_URL = 'http://localhost:5173';
// Email goes to memory and rate limits are off, whatever backend/.env says. A test file
// that needs a limit sets it itself before importing the app.
process.env.EMAIL_TRANSPORT = 'memory';
process.env.EMAIL_FROM = 'Help Desk Tests <tests@example.test>';
process.env.AUTH_RATE_LIMIT_MAX = '0';
process.env.SENSITIVE_RATE_LIMIT_MAX = '0';
process.env.PASSWORD_RESET_TTL_MINUTES = '30';
process.env.EMAIL_CHANGE_TTL_HOURS = '24';
// Single-origin CORS (CLIENT_URL) in tests, even if backend/.env lists CORS_ORIGINS.
process.env.CORS_ORIGINS = '';
delete process.env.EMAIL_OUTBOX_DIR;
