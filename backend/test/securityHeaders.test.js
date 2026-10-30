import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import app, { securityHeaders } from '../src/app.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, authHeader } from './helpers/factories.js';

// Regression (QA L1): API responses had no security headers. Every response, including 404s,
// errors and CORS preflights, now carries them; HSTS only in production over HTTPS.

const EXPECTED = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
};
function assertSecurityHeaders(res, label) {
  for (const [name, value] of Object.entries(EXPECTED)) {
    assert.equal(res.headers[name], value, `${label}: ${name}`);
  }
}

describe('security headers on the real app (not production)', () => {
  let connected = false;
  before(async () => {
    connected = await connectTestDB();
    if (connected) await resetTestDB();
  });
  after(async () => {
    if (connected) await clearTestDB();
    await disconnectTestDB();
  });

  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assertSecurityHeaders(res, 'health');
  });

  it('an authenticated response', async (t) => {
    if (!connected) return t.skip('MongoDB is not reachable at MONGODB_URI_TEST');
    const res = await request(app).get('/api/auth/me').set(authHeader(await createUser()));
    assert.equal(res.status, 200);
    assertSecurityHeaders(res, 'auth/me');
  });

  it('an unknown route (404)', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assertSecurityHeaders(res, '404');
  });

  it('error responses: malformed JSON (400), oversized body (413), rejected token (401)', async () => {
    const malformed = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'INVALID_JSON');
    assertSecurityHeaders(malformed, '400 INVALID_JSON');

    const big = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a@b.cd', password: 'x'.repeat(110 * 1024) }));
    assert.equal(big.status, 413);
    assertSecurityHeaders(big, '413');

    const rejected = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt');
    assert.equal(rejected.status, 401);
    assertSecurityHeaders(rejected, '401');
  });

  it('CORS and preflight behaviour are unchanged', async () => {
    const preflight = await request(app).options('/api/auth/login')
      .set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], 'http://localhost:5173');
    assertSecurityHeaders(preflight, 'preflight');
    const other = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    assert.equal(other.headers['access-control-allow-origin'], 'http://localhost:5173');
  });

  it('no HSTS outside production, even if the request claims HTTPS', async () => {
    const res = await request(app).get('/api/health').set('X-Forwarded-Proto', 'https');
    assert.equal(res.headers['strict-transport-security'], undefined);
  });
});

describe('HSTS (securityHeaders factory)', () => {
  function mini({ hsts, trustProxy }) {
    const mini = express();
    if (trustProxy) mini.set('trust proxy', trustProxy);
    mini.use(securityHeaders({ hsts }));
    mini.get('/x', (req, res) => res.json({ ok: true }));
    return mini;
  }

  it('production behind a trusted HTTPS proxy: present', async () => {
    const res = await request(mini({ hsts: true, trustProxy: 1 })).get('/x').set('X-Forwarded-Proto', 'https');
    assert.equal(res.headers['strict-transport-security'], 'max-age=15552000');
  });

  it('production over plain HTTP, or a spoofed X-Forwarded-Proto without trust proxy: absent', async () => {
    assert.equal((await request(mini({ hsts: true })).get('/x')).headers['strict-transport-security'], undefined);
    const spoofed = await request(mini({ hsts: true })).get('/x').set('X-Forwarded-Proto', 'https');
    assert.equal(spoofed.headers['strict-transport-security'], undefined);
    const httpViaProxy = await request(mini({ hsts: true, trustProxy: 1 })).get('/x').set('X-Forwarded-Proto', 'http');
    assert.equal(httpViaProxy.headers['strict-transport-security'], undefined);
  });

  it('development: absent even behind a trusted HTTPS proxy', async () => {
    const res = await request(mini({ hsts: false, trustProxy: 1 })).get('/x').set('X-Forwarded-Proto', 'https');
    assert.equal(res.headers['strict-transport-security'], undefined);
    assertSecurityHeaders(res, 'dev');
  });

  it('the real app turns HSTS on with NODE_ENV=production (checked in a child process)', () => {
    // A trusted proxy is simulated by setting "trust proxy" on the imported app; no database
    // is contacted (/api/health only reads the connection state).
    const script = [
      "const { default: request } = await import('supertest');",
      "const { default: app } = await import('./src/app.js');",
      "app.set('trust proxy', 1);",
      "const https = await request(app).get('/api/health').set('X-Forwarded-Proto', 'https');",
      "const http = await request(app).get('/api/health');",
      "console.log(JSON.stringify({ https: https.headers['strict-transport-security'] ?? null, http: http.headers['strict-transport-security'] ?? null }));",
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
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const line = result.stdout.trim().split('\n').pop();
    assert.deepEqual(JSON.parse(line), { https: 'max-age=15552000', http: null });
  });
});
