import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { Category } from '../src/models/Category.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, authHeader } from './helpers/factories.js';

// Category endpoints (API contract §10): the public list and admin management.

let connected = false;
let u;
let c;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  u = {
    customer: await createUser({ role: 'customer' }),
    agent: await createUser({ role: 'agent' }),
    admin: await createUser({ role: 'admin' }),
    disabled: await createUser({ role: 'customer', isActive: false }),
  };
  c = {
    billing: await createCategory({ name: 'billing' }),
    account: await createCategory({ name: 'Account & Login' }),
    legacy: await createCategory({ name: 'Legacy', isActive: false }),
  };
});

after(async () => {
  if (connected) await clearTestDB();
  await disconnectTestDB();
});

function requireDB(testContext) {
  if (!connected) testContext.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

const as = (user, method, path) => request(app)[method](path).set(authHeader(user));
const assertError = (res, status, code) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  if (code) assert.equal(res.body.error?.code, code, JSON.stringify(res.body));
};

describe('GET /api/categories', () => {
  it('returns active categories only, sorted by name ignoring case, in the contract shape', async (t) => {
    if (!requireDB(t)) return;
    const res = await as(u.customer, 'get', '/api/categories');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.categories.map((cat) => cat.name), ['Account & Login', 'billing']);
    for (const category of res.body.categories) {
      assert.deepEqual(Object.keys(category).sort(), ['description', 'id', 'isActive', 'name']);
      assert.match(category.id, /^[0-9a-f]{24}$/);
      assert.equal(category.isActive, true);
    }
  });

  it('is available to agents and admins too', async (t) => {
    if (!requireDB(t)) return;
    for (const user of [u.agent, u.admin]) {
      const res = await as(user, 'get', '/api/categories');
      assert.equal(res.status, 200);
      assert.equal(res.body.categories.length, 2);
    }
  });

  it('returns an empty list when there are no active categories', async (t) => {
    if (!requireDB(t)) return;
    await Category.updateMany({}, { isActive: false });
    const res = await as(u.customer, 'get', '/api/categories');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { categories: [] });
  });

  it('requires a valid token (401) and an active account (403)', async (t) => {
    if (!requireDB(t)) return;
    assertError(await request(app).get('/api/categories'), 401, 'UNAUTHORIZED');
    assertError(await as(u.disabled, 'get', '/api/categories'), 403, 'ACCOUNT_DISABLED');
  });
});

describe('Admin category management', () => {
  it('is admin-only: customers and agents get 403, anonymous 401, on every route', async (t) => {
    if (!requireDB(t)) return;
    const routes = [
      ['get', '/api/admin/categories'],
      ['post', '/api/admin/categories'],
      ['patch', `/api/admin/categories/${c.billing._id}`],
    ];
    for (const [method, path] of routes) {
      assertError(await request(app)[method](path).send({ name: 'Hacked' }), 401, 'UNAUTHORIZED');
      assertError(await as(u.customer, method, path).send({ name: 'Hacked' }), 403, 'FORBIDDEN');
      assertError(await as(u.agent, method, path).send({ name: 'Hacked' }), 403, 'FORBIDDEN');
    }
    assert.equal(await Category.countDocuments({ name: 'Hacked' }), 0);
  });

  it('GET lists every category, including inactive ones', async (t) => {
    if (!requireDB(t)) return;
    const res = await as(u.admin, 'get', '/api/admin/categories');

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.categories.map((cat) => [cat.name, cat.isActive]),
      [['Account & Login', true], ['billing', true], ['Legacy', false]],
    );
  });

  it('POST creates a trimmed, active category with an optional description', async (t) => {
    if (!requireDB(t)) return;
    const res = await as(u.admin, 'post', '/api/admin/categories').send({
      name: '  Data & Privacy  ',
      description: '  Exports and deletion requests ',
      isActive: false, // ignored: new categories start active
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.category.name, 'Data & Privacy');
    assert.equal(res.body.category.description, 'Exports and deletion requests');
    assert.equal(res.body.category.isActive, true);
    assert.ok(await Category.exists({ name: 'Data & Privacy', isActive: true }));

    const publicList = await as(u.customer, 'get', '/api/categories');
    assert.ok(publicList.body.categories.some((cat) => cat.name === 'Data & Privacy'));
  });

  it('POST rejects duplicates ignoring case (409 CATEGORY_EXISTS), including inactive ones', async (t) => {
    if (!requireDB(t)) return;
    assertError(await as(u.admin, 'post', '/api/admin/categories').send({ name: 'BILLING' }), 409, 'CATEGORY_EXISTS');
    assertError(await as(u.admin, 'post', '/api/admin/categories').send({ name: 'legacy' }), 409, 'CATEGORY_EXISTS');
  });

  it('simultaneous creates/renames to the same name (any case): exactly one wins, the rest get 409', async (t) => {
    if (!requireDB(t)) return;
    // Both pass the pre-check at once; the case-insensitive unique index must decide.
    const results = await Promise.all([
      as(u.admin, 'post', '/api/admin/categories').send({ name: 'Refunds' }),
      as(u.admin, 'post', '/api/admin/categories').send({ name: 'REFUNDS' }),
      as(u.admin, 'patch', `/api/admin/categories/${c.account._id}`).send({ name: 'refunds' }),
    ]);
    assert.equal(results.filter((res) => res.status === 200 || res.status === 201).length, 1);
    for (const res of results.filter((r) => r.status >= 400)) assertError(res, 409, 'CATEGORY_EXISTS');
    assert.equal(await Category.countDocuments({ name: /^refunds$/i }), 1);
  });

  it('POST validates input (400)', async (t) => {
    if (!requireDB(t)) return;
    for (const body of [{}, { name: '' }, { name: 'x' }, { name: 'x'.repeat(51) }, { name: 42 }, { name: 'Valid name', description: 'x'.repeat(201) }, { name: 'Valid name', description: 5 }]) {
      assertError(await as(u.admin, 'post', '/api/admin/categories').send(body), 400, 'VALIDATION_ERROR');
    }
    assertError(await as(u.admin, 'post', '/api/admin/categories'), 400, 'VALIDATION_ERROR');
  });

  it('PATCH renames, describes and deactivates; deactivated categories leave the public list', async (t) => {
    if (!requireDB(t)) return;
    const res = await as(u.admin, 'patch', `/api/admin/categories/${c.billing._id}`).send({ name: 'Billing & Payments', description: 'Invoices', isActive: false });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.category, { id: String(c.billing._id), name: 'Billing & Payments', description: 'Invoices', isActive: false });
    const publicList = await as(u.customer, 'get', '/api/categories');
    assert.deepEqual(publicList.body.categories.map((cat) => cat.name), ['Account & Login']);

    const reactivated = await as(u.admin, 'patch', `/api/admin/categories/${c.billing._id}`).send({ isActive: true });
    assert.equal(reactivated.body.category.isActive, true);
  });

  it('PATCH allows changing only the case of its own name, but not taking another name', async (t) => {
    if (!requireDB(t)) return;
    const own = await as(u.admin, 'patch', `/api/admin/categories/${c.billing._id}`).send({ name: 'Billing' });
    assert.equal(own.status, 200);
    assert.equal(own.body.category.name, 'Billing');
    assertError(await as(u.admin, 'patch', `/api/admin/categories/${c.billing._id}`).send({ name: 'account & login' }), 409, 'CATEGORY_EXISTS');
  });

  it('PATCH errors: invalid id 400, unknown id 404, no fields / bad values 400', async (t) => {
    if (!requireDB(t)) return;
    assertError(await as(u.admin, 'patch', '/api/admin/categories/not-an-id').send({ name: 'Billing' }), 400, 'INVALID_ID');
    assertError(await as(u.admin, 'patch', `/api/admin/categories/${u.agent._id}`).send({ name: 'Ghost' }), 404, 'NOT_FOUND');
    assertError(await as(u.admin, 'patch', `/api/admin/categories/${c.billing._id}`).send({}), 400, 'VALIDATION_ERROR');
    assertError(await as(u.admin, 'patch', `/api/admin/categories/${c.billing._id}`).send({ isActive: 'false' }), 400, 'VALIDATION_ERROR');
    assertError(await as(u.admin, 'patch', `/api/admin/categories/${c.billing._id}`).send({ name: 'y' }), 400, 'VALIDATION_ERROR');
  });
});
