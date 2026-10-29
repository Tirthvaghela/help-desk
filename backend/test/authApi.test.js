import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { verifyToken } from '../src/utils/token.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';

// Integration tests for POST /api/auth/register, POST /api/auth/login and GET /api/auth/me
// (API contract §6), through the real app and the isolated test database.

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

// A user with a real bcrypt hash. Cost 4 keeps tests fast; compare() reads the cost from the hash.
async function createUserWithPassword(password, { role = 'customer', isActive = true, email = 'asha@example.test' } = {}) {
  return User.create({ name: 'Asha Customer', email, passwordHash: await bcrypt.hash(password, 4), role, isActive });
}

const register = (body) => request(app).post('/api/auth/register').send(body);
const login = (body) => request(app).post('/api/auth/login').send(body);
const validRegistration = { name: 'Asha Customer', email: 'asha@example.test', password: 'correct-horse-1' };

function assertError(res, status, code) {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.error?.code, code, JSON.stringify(res.body));
}

function assertUserShape(user) {
  assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'email', 'id', 'isActive', 'name', 'role']);
}

describe('POST /api/auth/register', () => {
  it('creates a customer and returns { user, token }', async (t) => {
    if (!requireDB(t)) return;
    const res = await register(validRegistration);

    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.body).sort(), ['token', 'user']);
    assertUserShape(res.body.user);
    assert.equal(res.body.user.role, 'customer');
    assert.equal(res.body.user.email, 'asha@example.test');
    assert.equal(verifyToken(res.body.token).sub, res.body.user.id);

    const stored = await User.findById(res.body.user.id).select('+passwordHash');
    assert.ok(await bcrypt.compare('correct-horse-1', stored.passwordHash));
    assert.ok(!JSON.stringify(res.body).includes(stored.passwordHash));
  });

  it('ignores a privileged role or account state sent by the client', async (t) => {
    if (!requireDB(t)) return;
    const res = await register({ ...validRegistration, role: 'admin', isActive: false, passwordHash: 'x' });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'customer');
    assert.equal(res.body.user.isActive, true);
    assert.equal((await User.findById(res.body.user.id)).role, 'customer');
  });

  it('returns 409 EMAIL_TAKEN for an email already registered, in any letter case', async (t) => {
    if (!requireDB(t)) return;
    await register(validRegistration);
    const res = await register({ ...validRegistration, email: 'ASHA@Example.test' });

    assertError(res, 409, 'EMAIL_TAKEN');
    assert.equal(await User.countDocuments(), 1);
  });

  it('returns 400 for missing or invalid fields', async (t) => {
    if (!requireDB(t)) return;
    const cases = [
      [{ ...validRegistration, name: undefined }, 'name is required'],
      [{ ...validRegistration, name: 'A' }, 'name must be at least 2 characters'],
      [{ ...validRegistration, email: 'not-an-email' }, 'email must be a valid email address'],
      [{ ...validRegistration, email: 42 }, 'email is required'],
      [{ ...validRegistration, password: undefined }, 'password is required'],
      [{ ...validRegistration, password: 'short7!' }, 'password must be at least 8 characters'],
      [{ ...validRegistration, password: '          ' }, 'password is required'],
      [{ ...validRegistration, password: 12345678 }, 'password is required'],
    ];
    for (const [body, message] of cases) {
      const res = await register(body);
      assertError(res, 400, 'VALIDATION_ERROR');
      assert.equal(res.body.error.message, message);
    }
    assert.equal(await User.countDocuments(), 0);
  });

  it('accepts a 72-byte password and rejects longer ones, counting bytes rather than characters', async (t) => {
    if (!requireDB(t)) return;
    const ok = await register({ ...validRegistration, password: 'a'.repeat(72) });
    assert.equal(ok.status, 201);

    const tooLong = 'password must be at most 72 bytes (some characters use more than one byte)';
    for (const [email, password] of [['b@example.test', 'a'.repeat(73)], ['c@example.test', '€'.repeat(25)]]) {
      const res = await register({ ...validRegistration, email, password });
      assertError(res, 400, 'VALIDATION_ERROR');
      assert.equal(res.body.error.message, tooLong);
    }
    assert.equal(await User.countDocuments(), 1);
  });
});

describe('POST /api/auth/login', () => {
  it('returns { user, token } for valid credentials, with the email in any letter case', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUserWithPassword('correct-horse-1');
    const res = await login({ email: 'ASHA@example.test', password: 'correct-horse-1' });

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['token', 'user']);
    assertUserShape(res.body.user);
    assert.equal(res.body.user.id, String(user._id));
    assert.equal(verifyToken(res.body.token).sub, String(user._id));
  });

  it('gives the same response for a wrong password and an unknown email', async (t) => {
    if (!requireDB(t)) return;
    await createUserWithPassword('correct-horse-1');
    const wrongPassword = await login({ email: 'asha@example.test', password: 'wrong-password' });
    const unknownEmail = await login({ email: 'nobody@example.test', password: 'wrong-password' });

    assertError(wrongPassword, 401, 'INVALID_CREDENTIALS');
    assert.equal(unknownEmail.status, wrongPassword.status);
    assert.deepEqual(unknownEmail.body, wrongPassword.body);
    assert.deepEqual(wrongPassword.body, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
  });

  it('still runs a password comparison for an unknown email, so timing does not reveal it', async (t) => {
    if (!requireDB(t)) return;
    const compare = t.mock.method(bcrypt, 'compare');
    await login({ email: 'nobody@example.test', password: 'wrong-password' });
    assert.equal(compare.mock.callCount(), 1);
  });

  it('does not reveal a deactivated account unless the password is correct', async (t) => {
    if (!requireDB(t)) return;
    await createUserWithPassword('correct-horse-1', { isActive: false });
    const unknown = await login({ email: 'nobody@example.test', password: 'wrong-password' });
    const wrongPassword = await login({ email: 'asha@example.test', password: 'wrong-password' });

    assertError(wrongPassword, 401, 'INVALID_CREDENTIALS');
    assert.deepEqual(wrongPassword.body, unknown.body);

    const rightPassword = await login({ email: 'asha@example.test', password: 'correct-horse-1' });
    assertError(rightPassword, 403, 'ACCOUNT_DISABLED');
    assert.equal(rightPassword.body.token, undefined);
  });

  it('returns 400 for invalid input', async (t) => {
    if (!requireDB(t)) return;
    assertError(await login({ email: 'not-an-email', password: 'whatever-123' }), 400, 'VALIDATION_ERROR');
    assertError(await login({ email: 'asha@example.test' }), 400, 'VALIDATION_ERROR');
    assertError(await login({ email: 'asha@example.test', password: '' }), 400, 'VALIDATION_ERROR');
    assertError(await login({ email: 'asha@example.test', password: 'x'.repeat(129) }), 400, 'VALIDATION_ERROR');
  });

  it('still lets an account created before the 72-byte check log in with its full password', async (t) => {
    if (!requireDB(t)) return;
    const legacyPassword = `${'a'.repeat(72)}-older-account-tail`;
    await createUserWithPassword(legacyPassword);

    assert.equal((await login({ email: 'asha@example.test', password: legacyPassword })).status, 200);
  });

  it('issues a token that carries only the user id; the role comes from the database', async (t) => {
    if (!requireDB(t)) return;
    const admin = await createUserWithPassword('correct-horse-1', { role: 'admin' });
    const res = await login({ email: 'asha@example.test', password: 'correct-horse-1' });

    assert.equal(res.body.user.role, 'admin');
    const payload = verifyToken(res.body.token);
    // User id and token version only; never the role.
    assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub', 'ver']);
    assert.equal(payload.sub, String(admin._id));

    const stats = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${res.body.token}`);
    assert.equal(stats.status, 200);
    await User.updateOne({ _id: admin._id }, { role: 'agent' });
    const demoted = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${res.body.token}`);
    assertError(demoted, 403, 'FORBIDDEN');
  });
});

describe('Missing and malformed request bodies', () => {
  for (const path of ['/api/auth/register', '/api/auth/login']) {
    it(`${path} returns 400, never 500`, async (t) => {
      if (!requireDB(t)) return;
      assertError(await request(app).post(path), 400, 'VALIDATION_ERROR');
      assertError(await request(app).post(path).set('Content-Type', 'text/plain').send('email=a@b.c'), 400, 'VALIDATION_ERROR');
      assertError(await request(app).post(path).send([{ email: 'a@example.test' }]), 400, 'VALIDATION_ERROR');
      assertError(await request(app).post(path).set('Content-Type', 'application/json').send('{"email":'), 400, 'INVALID_JSON');
    });
  }
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in user for a token from login', async (t) => {
    if (!requireDB(t)) return;
    await createUserWithPassword('correct-horse-1', { role: 'agent' });
    const { body } = await login({ email: 'asha@example.test', password: 'correct-horse-1' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { user: body.user });
  });

  it('returns 401 without a valid token', async (t) => {
    if (!requireDB(t)) return;
    assertError(await request(app).get('/api/auth/me'), 401, 'UNAUTHORIZED');
    assertError(await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-token'), 401, 'UNAUTHORIZED');
  });

  it('returns 403 ACCOUNT_DISABLED after the account is deactivated', async (t) => {
    if (!requireDB(t)) return;
    const user = await createUserWithPassword('correct-horse-1');
    const { body } = await login({ email: 'asha@example.test', password: 'correct-horse-1' });
    await User.updateOne({ _id: user._id }, { isActive: false });

    assertError(await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`), 403, 'ACCOUNT_DISABLED');
  });
});
