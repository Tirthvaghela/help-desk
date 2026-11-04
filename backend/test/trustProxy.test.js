import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import { securityHeaders } from '../src/app.js';
import { readEnv } from '../src/config/envRules.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

// TRUST_PROXY and Express "trust proxy" (src/app.js), with the real rate limiter and security
// headers. supertest connects from 127.0.0.1, which plays the proxy; X-Forwarded-For is what that
// proxy passes on. A proxy appends the address it saw to the right of anything the client sent,
// so a client can only add entries on the left. No database is used.

const HSTS = 'max-age=15552000';

// The configured value goes through readEnv, as in the real app.
function trustProxyFrom(TRUST_PROXY) {
  const { env, errors } = readEnv({
    MONGODB_URI: 'mongodb://127.0.0.1/helpdesk',
    JWT_SECRET: 'k'.repeat(48),
    CLIENT_URL: 'http://localhost:5173',
    EMAIL_TRANSPORT: 'disabled',
    TRUST_PROXY,
  });
  assert.deepEqual(errors, []);
  return env.trustProxy;
}

// A small app with one rate-limited route (1 request per window) that reports req.ip.
function limitedApp(TRUST_PROXY, { hsts = true } = {}) {
  const app = express();
  app.set('trust proxy', trustProxyFrom(TRUST_PROXY));
  app.use(securityHeaders({ hsts }));
  app.get('/limited', createRateLimiter({ max: 1, windowMs: 60_000, name: 'tries' }), (req, res) =>
    res.json({ ip: req.ip, secure: req.secure }),
  );
  app.use(errorHandler);
  return app;
}

const call = (app, headers = {}) => request(app).get('/limited').set(headers);

describe('client address behind a trusted proxy (TRUST_PROXY=1)', () => {
  it('req.ip is the client address the proxy passed on', async () => {
    const res = await call(limitedApp('1'), { 'X-Forwarded-For': '203.0.113.10' });
    assert.equal(res.body.ip, '203.0.113.10');
  });

  it('two different clients get separate rate-limit counts', async () => {
    const app = limitedApp('1');
    assert.equal((await call(app, { 'X-Forwarded-For': '203.0.113.10' })).status, 200);
    assert.equal((await call(app, { 'X-Forwarded-For': '198.51.100.20' })).status, 200, 'another client has its own count');
    assert.equal((await call(app, { 'X-Forwarded-For': '203.0.113.10' })).status, 429, 'the first client is over its limit');
  });

  it('a client cannot escape its limit by sending its own X-Forwarded-For entries', async () => {
    const app = limitedApp('1');
    const real = '203.0.113.10';
    assert.equal((await call(app, { 'X-Forwarded-For': real })).status, 200);
    for (const spoofed of ['198.51.100.1', '10.0.0.1, 192.0.2.7', 'unknown', '127.0.0.1']) {
      const res = await call(app, { 'X-Forwarded-For': `${spoofed}, ${real}` });
      assert.equal(res.status, 429, `spoofed "${spoofed}" was ignored`);
      assert.equal(res.body.error.code, 'RATE_LIMITED');
    }
  });

  it('HSTS only when the trusted proxy says the request was HTTPS', async () => {
    const app = limitedApp('1');
    const https = await call(app, { 'X-Forwarded-For': '203.0.113.11', 'X-Forwarded-Proto': 'https' });
    assert.equal(https.headers['strict-transport-security'], HSTS);
    assert.equal(https.body.secure, true);
    const http = await call(app, { 'X-Forwarded-For': '203.0.113.12', 'X-Forwarded-Proto': 'http' });
    assert.equal(http.headers['strict-transport-security'], undefined);
    const none = await call(app, { 'X-Forwarded-For': '203.0.113.13' });
    assert.equal(none.headers['strict-transport-security'], undefined, 'plain HTTP to the proxy');
  });
});

describe('no trusted proxy (default TRUST_PROXY=0)', () => {
  it('forwarded headers are ignored: req.ip is the connecting address', async () => {
    const res = await call(limitedApp(undefined), { 'X-Forwarded-For': '203.0.113.10' });
    assert.match(res.body.ip, /127\.0\.0\.1|::1/);
  });

  it('a made-up X-Forwarded-For cannot give a client a fresh rate-limit count', async () => {
    const app = limitedApp('0');
    assert.equal((await call(app, { 'X-Forwarded-For': '203.0.113.10' })).status, 200);
    assert.equal((await call(app, { 'X-Forwarded-For': '198.51.100.20' })).status, 429);
    assert.equal((await call(app)).status, 429);
  });

  it('a spoofed X-Forwarded-Proto does not turn on HSTS', async () => {
    const res = await call(limitedApp(undefined), { 'X-Forwarded-Proto': 'https' });
    assert.equal(res.headers['strict-transport-security'], undefined);
    assert.equal(res.body.secure, false);
  });

  it('outside production there is never HSTS, trusted proxy or not', async () => {
    for (const TRUST_PROXY of [undefined, '1']) {
      const res = await call(limitedApp(TRUST_PROXY, { hsts: false }), { 'X-Forwarded-For': '203.0.113.14', 'X-Forwarded-Proto': 'https' });
      assert.equal(res.headers['strict-transport-security'], undefined, `TRUST_PROXY=${TRUST_PROXY}`);
    }
  });
});

// The real app reads TRUST_PROXY through env.js and applies it before its middleware. Unknown paths
// answer 404 without touching the database.
describe('the real app applies TRUST_PROXY (child process)', () => {
  function run(extraEnv) {
    const script = [
      "const { default: request } = await import('supertest');",
      "const { default: app } = await import('./src/app.js');",
      "const https = await request(app).get('/api/does-not-exist').set('X-Forwarded-Proto', 'https');",
      "const http = await request(app).get('/api/does-not-exist');",
      "console.log(JSON.stringify({ trustProxy: app.get('trust proxy'), https: https.headers['strict-transport-security'] ?? null, http: http.headers['strict-transport-security'] ?? null, status: https.status }));",
      'process.exit(0);',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: 'p'.repeat(48),
        EMAIL_TRANSPORT: 'disabled',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/helpdesk_test',
        CLIENT_URL: 'http://localhost:5173',
        CORS_ORIGINS: '',
        JWT_EXPIRES_IN: '',
        ...extraEnv,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim().split('\n').pop());
  }

  it('TRUST_PROXY=1 in production: HSTS for HTTPS through the proxy only', () => {
    assert.deepEqual(run({ TRUST_PROXY: '1' }), { trustProxy: 1, https: HSTS, http: null, status: 404 });
  });

  it('TRUST_PROXY unset: a claimed HTTPS is not believed', () => {
    assert.deepEqual(run({ TRUST_PROXY: '' }), { trustProxy: 0, https: null, http: null, status: 404 });
  });

  it('an invalid TRUST_PROXY stops startup with a clear message', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config/env.js')"], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, NODE_ENV: 'development', MONGODB_URI: 'mongodb://127.0.0.1:27017/helpdesk_test', JWT_SECRET: 'x', CLIENT_URL: 'http://localhost:5173', CORS_ORIGINS: '', JWT_EXPIRES_IN: '', TRUST_PROXY: 'true' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /TRUST_PROXY must be a whole number from 0 to 10/);
  });
});
