// Preloaded before every test file (see the "test" script in package.json).
// These values are set before src/config/env.js runs, and dotenv never overrides
// variables that already exist, so tests always use the test database even when
// a developer's backend/.env points at real data.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/helpdesk_test';
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.CLIENT_URL = 'http://localhost:5173';
