import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { connectTestDB, disconnectTestDB } from './helpers/db.js';

describe('GET /api/health without a database connection', () => {
  it('returns 503 with database "disconnected"', async () => {
    const res = await request(app).get('/api/health');

    assert.equal(res.status, 503);
    assert.equal(res.body.status, 'degraded');
    assert.equal(res.body.database, 'disconnected');
    assert.equal(typeof res.body.uptimeSeconds, 'number');
    assert.ok(!Number.isNaN(Date.parse(res.body.timestamp)));
  });

  it('allows the configured frontend origin via CORS', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
  });

  it('does not advertise the server framework (no X-Powered-By)', async () => {
    const res = await request(app).get('/api/health');

    assert.equal(res.headers['x-powered-by'], undefined);
  });
});

describe('GET /api/health with the test database', () => {
  let connected = false;

  before(async () => {
    connected = await connectTestDB();
  });

  after(async () => {
    await disconnectTestDB();
  });

  it('returns 200 with database "connected"', async (t) => {
    if (!connected) {
      t.skip('MongoDB is not reachable at MONGODB_URI_TEST (default mongodb://127.0.0.1:27017/helpdesk_test)');
      return;
    }
    const res = await request(app).get('/api/health');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database, 'connected');
  });
});

describe('Unknown routes', () => {
  it('return 404 in the standard error format', async () => {
    const res = await request(app).get('/api/does-not-exist');

    assert.equal(res.status, 404);
    assert.deepEqual(res.body, {
      error: { code: 'NOT_FOUND', message: 'Route not found: GET /api/does-not-exist' },
    });
  });
});
