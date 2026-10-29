import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { readEnv, MIN_PRODUCTION_JWT_SECRET_LENGTH } from '../src/config/envRules.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

// Security configuration: sign-in rate limiting, production JWT secret rules, and the
// profile update endpoint. The rate limit is switched on for this test process before the
// app is imported (each test file runs in its own process).
process.env.AUTH_RATE_LIMIT_MAX = '3';
process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
process.env.SENSITIVE_RATE_LIMIT_MAX = '2';
const { default: app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } = await import('./helpers/db.js');
const { createUser, authHeader } = await import('./helpers/factories.js');

const baseEnv = { MONGODB_URI: 'mongodb://127.0.0.1:27017/x_test', CLIENT_URL: 'http://localhost:5173' };

describe('readEnv (configuration rules)', () => {
  it('accepts any non-empty JWT secret outside production', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) {
      const { errors } = readEnv({ ...baseEnv, NODE_ENV, JWT_SECRET: 'dev' });
      assert.deepEqual(errors, []);
    }
  });

  it('refuses short or placeholder JWT secrets in production, without echoing them', () => {
    const short = readEnv({ ...baseEnv, NODE_ENV: 'production', JWT_SECRET: 'tooShortSecretValue', EMAIL_TRANSPORT: 'disabled' });
    assert.equal(short.errors.length, 1);
    assert.match(short.errors[0], new RegExp(`at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH}`));
    assert.ok(!short.errors[0].includes('tooShortSecretValue'));

    const placeholder = readEnv({ ...baseEnv, NODE_ENV: 'production', JWT_SECRET: 'replace-with-a-long-random-string', EMAIL_TRANSPORT: 'disabled' });
    assert.equal(placeholder.errors.length, 1);

    const strong = readEnv({ ...baseEnv, NODE_ENV: 'production', JWT_SECRET: 'k'.repeat(48), EMAIL_TRANSPORT: 'disabled' });
    assert.deepEqual(strong.errors, []);
  });

  it('email settings: per-environment defaults; production needs SMTP (or disabled) and refuses dev transports', () => {
    const base = { ...baseEnv, JWT_SECRET: 'k'.repeat(48) };
    assert.equal(readEnv({ ...base, NODE_ENV: 'test' }).env.email.transport, 'memory');
    assert.equal(readEnv({ ...base, NODE_ENV: 'development' }).env.email.transport, 'outbox');

    const prodDefault = readEnv({ ...base, NODE_ENV: 'production' });
    assert.equal(prodDefault.env.email.transport, 'smtp');
    assert.match(prodDefault.errors.join(' '), /SMTP_HOST, EMAIL_FROM/);

    const prodSmtp = readEnv({ ...base, NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com', SMTP_PASS: 'smtp-secret-pass', EMAIL_FROM: 'Help Desk <hd@example.com>' });
    assert.deepEqual(prodSmtp.errors, []);
    assert.ok(!JSON.stringify(prodSmtp.errors).includes('smtp-secret-pass'));

    assert.deepEqual(prodSmtp.env.email.smtp.pass, 'smtp-secret-pass');
    const aliases = readEnv({ ...base, EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'x@example.com', SMTP_USERNAME: 'alias-user', SMTP_PASSWORD: 'alias-pass' });
    assert.equal(aliases.env.email.smtp.user, 'alias-user', 'SMTP_USERNAME accepted');
    assert.equal(aliases.env.email.smtp.pass, 'alias-pass', 'SMTP_PASSWORD accepted');
    assert.equal(readEnv({ ...base, NODE_ENV: 'production', EMAIL_TRANSPORT: 'outbox' }).errors.length, 1);
    assert.equal(readEnv({ ...base, EMAIL_TRANSPORT: 'carrier-pigeon' }).errors.length, 1);
    assert.equal(readEnv({ ...base, CLIENT_URL: 'not a url' }).errors.length, 1);
    assert.equal(readEnv({ ...base, PASSWORD_RESET_TTL_MINUTES: '0' }).errors.length, 1);
  });

  it('reports missing required variables', () => {
    const { errors } = readEnv({ NODE_ENV: 'production' });
    assert.match(errors[0], /MONGODB_URI, JWT_SECRET, CLIENT_URL/);
  });

  it('rate limit settings: defaults per environment, explicit 0 disables, junk rejected', () => {
    assert.equal(readEnv({ ...baseEnv, JWT_SECRET: 'x' }).env.authRateLimit.max, 20);
    assert.equal(readEnv({ ...baseEnv, JWT_SECRET: 'x', NODE_ENV: 'test' }).env.authRateLimit.max, 0);
    assert.equal(readEnv({ ...baseEnv, JWT_SECRET: 'x', AUTH_RATE_LIMIT_MAX: '0' }).env.authRateLimit.max, 0);
    assert.equal(readEnv({ ...baseEnv, JWT_SECRET: 'x', AUTH_RATE_LIMIT_MAX: 'lots' }).errors.length, 1);
  });

  it('the real server refuses to start with a weak production secret', async () => {
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config/env.js')"], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, ...baseEnv, NODE_ENV: 'production', JWT_SECRET: 'weak-secret-value' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /JWT_SECRET must be at least/);
    assert.ok(!result.stderr.includes('weak-secret-value'));
  });
});

describe('createRateLimiter', () => {
  function appWith(limiter) {
    const mini = express();
    mini.get('/x', limiter, (req, res) => res.json({ ok: true }));
    mini.use(errorHandler);
    return mini;
  }

  it('allows max requests per window, then 429 RATE_LIMITED with Retry-After; resets after the window', async () => {
    let now = 1_000_000;
    const mini = appWith(createRateLimiter({ max: 2, windowMs: 10_000, name: 'tries', now: () => now }));
    assert.equal((await request(mini).get('/x')).status, 200);
    assert.equal((await request(mini).get('/x')).status, 200);
    const blocked = await request(mini).get('/x');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');
    assert.equal(blocked.headers['retry-after'], '10');
    now += 10_000;
    assert.equal((await request(mini).get('/x')).status, 200);
  });

  it('max 0 turns limiting off', async () => {
    const mini = appWith(createRateLimiter({ max: 0, windowMs: 1000 }));
    for (let i = 0; i < 10; i += 1) assert.equal((await request(mini).get('/x')).status, 200);
  });
});

describe('Auth endpoints with the database', () => {
  let connected = false;
  let customer;

  before(async () => {
    connected = await connectTestDB();
  });
  beforeEach(async () => {
    if (!connected) return;
    await resetTestDB();
    customer = await createUser({ role: 'customer', name: 'Cara Customer', email: 'cara@example.test' });
  });
  after(async () => {
    if (connected) await clearTestDB();
    await disconnectTestDB();
  });
  const requireDB = (tc) => {
    if (!connected) tc.skip('MongoDB is not reachable at MONGODB_URI_TEST');
    return connected;
  };

  it('POST /api/auth/login is rate limited per client (3 per window here): 4th attempt → 429', async (tc) => {
    if (!requireDB(tc)) return;
    await User.updateOne({ _id: customer._id }, { passwordHash: await bcrypt.hash('right-password-1', 4) });
    const attempt = (password) => request(app).post('/api/auth/login').send({ email: 'cara@example.test', password });
    assert.equal((await attempt('wrong-password-1')).status, 401);
    assert.equal((await attempt('wrong-password-2')).status, 401);
    assert.equal((await attempt('right-password-1')).status, 200);
    const blocked = await attempt('right-password-1');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
  });

  it('password-reset requests and reset-link attempts have their own stricter limit (2 here)', async (tc) => {
    if (!requireDB(tc)) return;
    const forgot = () => request(app).post('/api/auth/forgot-password').send({ email: 'cara@example.test' });
    assert.equal((await forgot()).status, 200);
    assert.equal((await forgot()).status, 200);
    const blocked = await forgot();
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');
    assert.match(blocked.body.error.message, /password reset requests/);

    // Guessing reset links is limited too (check and reset share one budget).
    const guess = (path) => request(app).post(path).send({ token: 'x'.repeat(43), newPassword: 'guessing-pass-1' });
    assert.equal((await guess('/api/auth/reset-password/check')).status, 400);
    assert.equal((await guess('/api/auth/reset-password')).status, 400);
    assert.equal((await guess('/api/auth/reset-password')).status, 429);
  });

  it('PATCH /api/auth/me updates only the caller\'s name; role/email/isActive are ignored', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await request(app).patch('/api/auth/me').set(authHeader(customer)).send({
      name: '  Cara C. Customer ',
      role: 'admin',
      email: 'hijack@example.test',
      isActive: false,
      passwordHash: 'x',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, 'Cara C. Customer');
    assert.equal(res.body.user.role, 'customer');
    assert.equal(res.body.user.email, 'cara@example.test');
    assert.equal(res.body.user.isActive, true);
    assert.ok(!JSON.stringify(res.body).includes('passwordHash'));
    const stored = await User.findById(customer._id).select('+passwordHash');
    assert.equal(stored.role, 'customer');
    assert.notEqual(stored.passwordHash, 'x');
  });

  it('PATCH /api/auth/me validates the name and requires authentication', async (tc) => {
    if (!requireDB(tc)) return;
    const patch = (body) => request(app).patch('/api/auth/me').set(authHeader(customer)).send(body);
    for (const body of [{}, { name: '' }, { name: 'x' }, { name: 'x'.repeat(81) }, { name: 42 }]) {
      const res = await patch(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal((await request(app).patch('/api/auth/me').send({ name: 'Nobody Here' })).status, 401);
  });
});
