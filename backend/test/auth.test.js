import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { errorHandler, notFound } from '../src/middleware/errorHandler.js';
import { User } from '../src/models/User.js';
import { signToken, verifyToken } from '../src/utils/token.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, authHeader } from './helpers/factories.js';

const SECRET = process.env.JWT_SECRET;

const app = express();
app.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
app.get('/admin-only', requireAuth, requireRole('admin'), (req, res) => res.json({ ok: true }));
app.get('/staff', requireAuth, requireRole('agent', 'admin'), (req, res) => res.json({ ok: true }));
app.get('/role-without-auth', requireRole('admin'), (req, res) => res.json({ ok: true }));
app.use(notFound);
app.use(errorHandler);

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

let connected = false;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (connected) await resetTestDB();
});

after(async () => {
  if (connected) await clearTestDB();
  await disconnectTestDB();
});

function requireDB(t) {
  if (!connected) t.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

async function expectError(req, status, code) {
  const res = await req;
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.error?.code, code);
  return res;
}

describe('signToken / verifyToken', () => {
  it('puts only the user id and token version in the token and sets an expiry', () => {
    const id = new mongoose.Types.ObjectId();
    const payload = verifyToken(signToken({ _id: id }));

    assert.equal(payload.sub, String(id));
    assert.equal(payload.ver, 0, 'users without a tokenVersion count as version 0');
    assert.ok(payload.exp > payload.iat);
    // No role, email or name: those are always read from the database.
    assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub', 'ver']);
    assert.equal(verifyToken(signToken({ _id: id, tokenVersion: 3 })).ver, 3);
  });

  it('refuses to sign without a user id', () => {
    assert.throws(() => signToken({}), /requires a user with an id/);
    assert.throws(() => signToken(undefined), /requires a user with an id/);
  });
});

describe('requireAuth: missing and malformed credentials', () => {
  it('returns 401 without an Authorization header', async () => {
    await expectError(request(app).get('/me'), 401, 'UNAUTHORIZED');
  });

  it('returns 401 for other schemes or a missing token', async () => {
    for (const header of ['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer ', 'Token abc.def.ghi', 'abc.def.ghi']) {
      await expectError(request(app).get('/me').set('Authorization', header), 401, 'UNAUTHORIZED');
    }
  });

  it('returns 401 for a malformed token', async () => {
    await expectError(request(app).get('/me').set('Authorization', 'Bearer not-a-jwt'), 401, 'UNAUTHORIZED');
  });
});

// Regression (QA L3): authenticated JSON had no Cache-Control, so browsers could cache it.
describe('requireAuth: caching', () => {
  it('marks rejected requests no-store', async () => {
    for (const header of [undefined, 'Bearer not-a-jwt']) {
      const req = request(app).get('/me');
      const res = await (header ? req.set('Authorization', header) : req);
      assert.equal(res.status, 401);
      assert.equal(res.headers['cache-control'], 'no-store');
    }
  });

  it('marks successful authenticated responses no-store, on the real app routes too', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser();
    const res = await request(app).get('/me').set(authHeader(user));
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');

    const { default: realApp } = await import('../src/app.js');
    for (const path of ['/api/auth/me', '/api/tickets/my', '/api/notifications/unread-count', '/api/categories']) {
      const real = await request(realApp).get(path).set(authHeader(user));
      assert.equal(real.status, 200, path);
      assert.equal(real.headers['cache-control'], 'no-store', path);
    }
  });
});

describe('requireAuth: invalid tokens', () => {
  it('returns 401 for a token signed with another secret', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser();
    const forged = jwt.sign({}, 'some-other-secret', { subject: String(user._id), expiresIn: '1h' });
    await expectError(request(app).get('/me').set('Authorization', `Bearer ${forged}`), 401, 'UNAUTHORIZED');
  });

  it('returns 401 for an expired token', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser();
    const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, SECRET, { subject: String(user._id) });
    await expectError(request(app).get('/me').set('Authorization', `Bearer ${expired}`), 401, 'UNAUTHORIZED');
  });

  it('returns 401 for an unsigned ("alg: none") token', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser();
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: String(user._id) })}.`;
    await expectError(request(app).get('/me').set('Authorization', `Bearer ${unsigned}`), 401, 'UNAUTHORIZED');
  });

  it('returns 401 for a token signed with a different algorithm', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser();
    const hs512 = jwt.sign({}, SECRET, { subject: String(user._id), algorithm: 'HS512', expiresIn: '1h' });
    await expectError(request(app).get('/me').set('Authorization', `Bearer ${hs512}`), 401, 'UNAUTHORIZED');
  });

  it('returns 401 when the subject is missing or not a user id', async () => {
    const noSubject = jwt.sign({}, SECRET, { expiresIn: '1h' });
    const badSubject = jwt.sign({}, SECRET, { subject: 'admin', expiresIn: '1h' });
    await expectError(request(app).get('/me').set('Authorization', `Bearer ${noSubject}`), 401, 'UNAUTHORIZED');
    await expectError(request(app).get('/me').set('Authorization', `Bearer ${badSubject}`), 401, 'UNAUTHORIZED');
  });
});

describe('requireAuth: account state', () => {
  it('returns 401 for a deleted user', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser();
    const headers = authHeader(user);
    await User.deleteOne({ _id: user._id });

    await expectError(request(app).get('/me').set(headers), 401, 'UNAUTHORIZED');
  });

  it('returns 403 ACCOUNT_DISABLED for a deactivated user, immediately', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser();
    const headers = authHeader(user);
    assert.equal((await request(app).get('/me').set(headers)).status, 200);

    await User.updateOne({ _id: user._id }, { isActive: false });
    await expectError(request(app).get('/me').set(headers), 403, 'ACCOUNT_DISABLED');
  });

  it('sets req.user from the database, without passwordHash', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser({ role: 'agent' });
    const res = await request(app).get('/me').set(authHeader(user));

    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, String(user._id));
    assert.equal(res.body.user.role, 'agent');
    assert.equal(res.body.user.passwordHash, undefined);
  });

  it('accepts the scheme in any letter case', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser();
    const res = await request(app).get('/me').set('Authorization', `bearer ${signToken(user)}`);
    assert.equal(res.status, 200);
  });
});

describe('requireRole', () => {
  it('allows the listed roles and returns 403 FORBIDDEN for others', async (t) => {
    if (!requireDB(t)) return;
    const customer = await createUser({ role: 'customer' });
    const agent = await createUser({ role: 'agent' });
    const admin = await createUser({ role: 'admin' });

    await expectError(request(app).get('/admin-only').set(authHeader(customer)), 403, 'FORBIDDEN');
    await expectError(request(app).get('/admin-only').set(authHeader(agent)), 403, 'FORBIDDEN');
    assert.equal((await request(app).get('/admin-only').set(authHeader(admin))).status, 200);

    await expectError(request(app).get('/staff').set(authHeader(customer)), 403, 'FORBIDDEN');
    assert.equal((await request(app).get('/staff').set(authHeader(agent))).status, 200);
    assert.equal((await request(app).get('/staff').set(authHeader(admin))).status, 200);
  });

  it('ignores any role claimed inside the token', async (t) => {
    if (!requireDB(t)) return;
    const customer = await createUser({ role: 'customer' });
    const claimsAdmin = jwt.sign({ role: 'admin' }, SECRET, { subject: String(customer._id), expiresIn: '1h' });

    await expectError(request(app).get('/admin-only').set('Authorization', `Bearer ${claimsAdmin}`), 403, 'FORBIDDEN');
  });

  it('uses the current role from the database, so role changes apply immediately', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUser({ role: 'customer' });
    const headers = authHeader(user);
    await expectError(request(app).get('/admin-only').set(headers), 403, 'FORBIDDEN');

    await User.updateOne({ _id: user._id }, { role: 'admin' });
    assert.equal((await request(app).get('/admin-only').set(headers)).status, 200);
  });

  it('returns 401 if used without requireAuth', async () => {
    await expectError(request(app).get('/role-without-auth'), 401, 'UNAUTHORIZED');
  });

  it('rejects unknown or missing roles when the route is defined', () => {
    assert.throws(() => requireRole(), /requireRole needs known roles/);
    assert.throws(() => requireRole('superuser'), /requireRole needs known roles/);
    assert.throws(() => requireRole('admin', 'Admin'), /requireRole needs known roles/);
  });
});
