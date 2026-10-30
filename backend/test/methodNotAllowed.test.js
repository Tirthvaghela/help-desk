import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import app from '../src/app.js';
import { methodNotAllowed, notFound, errorHandler } from '../src/middleware/errorHandler.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, authHeader } from './helpers/factories.js';

// Regression (QA L2): a wrong method on an existing path returned 404 NOT_FOUND. It is now
// 405 METHOD_NOT_ALLOWED with an Allow header built from the real routes; unknown paths stay 404.

const ID = '0123456789abcdef01234567';
function expect405(res, allow, label) {
  assert.equal(res.status, 405, `${label}: ${res.status} ${res.text}`);
  assert.equal(res.headers.allow, allow, `${label}: Allow`);
  assert.equal(res.body.error.code, 'METHOD_NOT_ALLOWED', label);
  assert.match(res.body.error.message, /is not supported/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff', `${label}: security headers kept`);
}

describe('405 Method Not Allowed', () => {
  let connected = false;
  before(async () => {
    connected = await connectTestDB();
    if (connected) await resetTestDB();
  });
  after(async () => {
    if (connected) await clearTestDB();
    await disconnectTestDB();
  });

  it('PUT /api/categories → 405, Allow: GET, HEAD, OPTIONS', async () => {
    expect405(await request(app).put('/api/categories'), 'GET, HEAD, OPTIONS', 'PUT /api/categories');
    expect405(await request(app).delete('/api/categories/'), 'GET, HEAD, OPTIONS', 'trailing slash');
    expect405(await request(app).put('/API/Categories'), 'GET, HEAD, OPTIONS', 'letter case');
  });

  it('other routes list exactly their own methods', async () => {
    const cases = [
      ['delete', '/api/health', 'GET, HEAD, OPTIONS'],
      ['get', '/api/auth/login', 'POST, OPTIONS'],
      ['put', '/api/auth/me', 'GET, HEAD, PATCH, OPTIONS'],
      ['put', '/api/auth/me/email', 'GET, HEAD, POST, DELETE, OPTIONS'],
      ['get', `/api/tickets/${ID}/assign`, 'PATCH, OPTIONS'],
      ['delete', `/api/tickets/${ID}`, 'GET, HEAD, OPTIONS'],
      ['put', `/api/tickets/${ID}/comments`, 'GET, HEAD, POST, OPTIONS'],
      ['delete', '/api/admin/stats', 'GET, HEAD, OPTIONS'],
      ['post', '/api/admin/analytics', 'GET, HEAD, OPTIONS'],
      ['post', '/api/notifications/unread-count', 'GET, HEAD, OPTIONS'],
    ];
    for (const [method, path, allow] of cases) {
      const req = request(app)[method](path);
      // Routers that authenticate every request (notifications) answer 401 first; sign in.
      const res = connected && path.startsWith('/api/notifications') ? await req.set(authHeader(await createUser())) : await req;
      if (!connected && path.startsWith('/api/notifications')) continue;
      expect405(res, allow, `${method.toUpperCase()} ${path}`);
    }
  });

  it('both routers on /api/tickets are combined (customer POST + agent GET)', async () => {
    expect405(await request(app).delete('/api/tickets'), 'GET, HEAD, POST, OPTIONS', 'DELETE /api/tickets');
    // /my matches the customer route and the agent /:id route; both are GET only.
    expect405(await request(app).put('/api/tickets/my'), 'GET, HEAD, OPTIONS', 'PUT /api/tickets/my');
  });

  it('unknown paths stay 404 without an Allow header', async () => {
    for (const [method, path] of [['put', '/api/nope'], ['get', '/api/tickets/a/b/c'], ['delete', '/api/categoriesx'], ['get', '/api'], ['put', '/']]) {
      const res = await request(app)[method](path);
      assert.equal(res.status, 404, `${method} ${path}: ${res.status}`);
      assert.equal(res.body.error.code, 'NOT_FOUND');
      assert.equal(res.headers.allow, undefined, `${method} ${path}`);
    }
  });

  it('supported methods are unchanged: authentication still runs (401/403), never 405', async () => {
    assert.equal((await request(app).get('/api/categories')).status, 401);
    assert.equal((await request(app).post('/api/admin/categories').send({ name: 'X' })).status, 401);
    assert.equal((await request(app).get('/api/tickets/my')).status, 401);
  });

  it('routers that authenticate everything still answer 401/403 before revealing methods', async (t) => {
    assert.equal((await request(app).put('/api/admin/categories')).status, 401);
    assert.equal((await request(app).put('/api/notifications')).status, 401);
    if (!connected) return t.skip('MongoDB is not reachable');
    const customer = await createUser({ role: 'customer' });
    assert.equal((await request(app).put('/api/admin/users').set(authHeader(customer))).status, 403);
    const admin = await createUser({ role: 'admin' });
    expect405(await request(app).put('/api/admin/categories').set(authHeader(admin)), 'GET, HEAD, POST, OPTIONS', 'admin PUT');
    expect405(await request(app).put(`/api/admin/categories/${ID}`).set(authHeader(admin)), 'PATCH, OPTIONS', 'admin PUT :id');
  });

  it('OPTIONS preflight is still answered by CORS (204), HEAD works where GET does', async () => {
    const preflight = await request(app).options('/api/categories')
      .set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal((await request(app).options('/api/does-not-exist')).status, 204, 'CORS answers OPTIONS everywhere');

    const head = await request(app).head('/api/health');
    assert.equal(head.status, 200);
    assert.equal((await request(app).head('/api/categories')).status, 401, 'HEAD runs the GET route, with auth');
    const headOnPostOnly = await request(app).head('/api/auth/login');
    assert.equal(headOnPostOnly.status, 405);
    assert.equal(headOnPostOnly.headers.allow, 'POST, OPTIONS');
  });
});

describe('methodNotAllowed setup', () => {
  it('refuses route syntax it cannot match exactly, at startup', () => {
    const router = express.Router();
    router.get('/*splat', (req, res) => res.end());
    assert.throws(() => methodNotAllowed([['/x', router]]), /unsupported route syntax/);
  });

  it('works on any mounted router list (escapes literal dots)', async () => {
    const router = express.Router();
    router.get('/file.json', (req, res) => res.json({ ok: true }));
    const mini = express();
    mini.use('/v1', router);
    mini.use(methodNotAllowed([['/v1', router]]));
    mini.use(notFound);
    mini.use(errorHandler);
    assert.equal((await request(mini).post('/v1/file.json')).status, 405);
    assert.equal((await request(mini).post('/v1/fileXjson')).status, 404, 'dot is literal');
  });
});
