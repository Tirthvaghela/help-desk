import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createTicket, authHeader } from './helpers/factories.js';

// Admin user management (API contract §11, C-2 decided as CANNOT_MODIFY_SELF).

let connected = false;
let u;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  u = {
    customer: await createUser({ role: 'customer', name: 'Cara Customer', email: 'cara@example.test' }),
    customer2: await createUser({ role: 'customer', name: 'Dev Customer', email: 'dev@example.test', isActive: false }),
    agent: await createUser({ role: 'agent', name: 'Agent Ana', email: 'ana@example.test' }),
    admin: await createUser({ role: 'admin', name: 'Admin Ada', email: 'ada@example.test' }),
    admin2: await createUser({ role: 'admin', name: 'Admin Bo', email: 'bo@example.test' }),
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

describe('GET /api/admin/users', () => {
  it('is admin-only', async (t) => {
    if (!requireDB(t)) return;
    assertError(await request(app).get('/api/admin/users'), 401, 'UNAUTHORIZED');
    assertError(await as(u.customer, 'get', '/api/admin/users'), 403, 'FORBIDDEN');
    assertError(await as(u.agent, 'get', '/api/admin/users'), 403, 'FORBIDDEN');
  });

  it('lists users newest first with pagination metadata and no sensitive fields', async (t) => {
    if (!requireDB(t)) return;
    const res = await as(u.admin, 'get', '/api/admin/users?limit=2');

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 5);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.limit, 2);
    assert.equal(res.body.users.length, 2);
    for (const user of res.body.users) {
      assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'email', 'id', 'isActive', 'name', 'role', 'ticketCount']);
    }
    assert.ok(!JSON.stringify(res.body).includes('passwordHash'));
    const page3 = await as(u.admin, 'get', '/api/admin/users?limit=2&page=3');
    assert.equal(page3.body.users.length, 1);
  });

  it('filters by role, isActive and q (name or email, case-insensitive, literal)', async (t) => {
    if (!requireDB(t)) return;
    const names = async (query) => (await as(u.admin, 'get', `/api/admin/users?${query}`)).body.users.map((x) => x.name).sort();
    assert.deepEqual(await names('role=admin'), ['Admin Ada', 'Admin Bo']);
    assert.deepEqual(await names('isActive=false'), ['Dev Customer']);
    assert.deepEqual(await names('role=customer&isActive=true'), ['Cara Customer']);
    assert.deepEqual(await names('q=ANA'), ['Agent Ana']);
    assert.deepEqual(await names('q=dev%40example'), ['Dev Customer']);
    assert.deepEqual(await names('q=.*'), []);
  });

  it('rejects invalid filters (400)', async (t) => {
    if (!requireDB(t)) return;
    for (const query of ['role=owner', 'isActive=yes', 'limit=0', 'limit=101', 'page=-1', `q=${'x'.repeat(101)}`]) {
      assertError(await as(u.admin, 'get', `/api/admin/users?${query}`), 400, 'VALIDATION_ERROR');
    }
  });

  it('reports tickets created (customers) or assigned (staff)', async (t) => {
    if (!requireDB(t)) return;
    await createTicket({ createdBy: u.customer });
    await createTicket({ createdBy: u.customer, assignedTo: u.agent, status: 'in_progress' });
    const res = await as(u.admin, 'get', '/api/admin/users');
    const count = (name) => res.body.users.find((x) => x.name === name).ticketCount;
    assert.equal(count('Cara Customer'), 2);
    assert.equal(count('Agent Ana'), 1);
    assert.equal(count('Admin Ada'), 0);
  });
});

describe('PATCH /api/admin/users/:id/role and /status', () => {
  it('is admin-only; a customer cannot promote themselves', async (t) => {
    if (!requireDB(t)) return;
    assertError(await as(u.customer, 'patch', `/api/admin/users/${u.customer._id}/role`).send({ role: 'admin' }), 403, 'FORBIDDEN');
    assertError(await as(u.agent, 'patch', `/api/admin/users/${u.customer._id}/status`).send({ isActive: false }), 403, 'FORBIDDEN');
    assert.equal((await User.findById(u.customer._id)).role, 'customer');
  });

  it('promotes a customer to agent; the new role applies on their next request', async (t) => {
    if (!requireDB(t)) return;
    assertError(await as(u.customer, 'get', '/api/tickets'), 403, 'FORBIDDEN');
    const res = await as(u.admin, 'patch', `/api/admin/users/${u.customer._id}/role`).send({ role: 'agent', isActive: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'agent');
    assert.equal(res.body.user.isActive, true, 'other fields ignored');
    assert.equal((await as(u.customer, 'get', '/api/tickets')).status, 200);
  });

  it('deactivates a user: existing token gets 403 ACCOUNT_DISABLED; reactivation restores access', async (t) => {
    if (!requireDB(t)) return;
    const res = await as(u.admin, 'patch', `/api/admin/users/${u.agent._id}/status`).send({ isActive: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.isActive, false);
    assertError(await as(u.agent, 'get', '/api/tickets'), 403, 'ACCOUNT_DISABLED');
    await as(u.admin, 'patch', `/api/admin/users/${u.agent._id}/status`).send({ isActive: true });
    assert.equal((await as(u.agent, 'get', '/api/tickets')).status, 200);
  });

  it('an admin cannot change their own role or status (400 CANNOT_MODIFY_SELF), but can change another admin', async (t) => {
    if (!requireDB(t)) return;
    assertError(await as(u.admin, 'patch', `/api/admin/users/${u.admin._id}/role`).send({ role: 'customer' }), 400, 'CANNOT_MODIFY_SELF');
    assertError(await as(u.admin, 'patch', `/api/admin/users/${u.admin._id}/status`).send({ isActive: false }), 400, 'CANNOT_MODIFY_SELF');
    assert.equal((await User.findById(u.admin._id)).role, 'admin');

    const other = await as(u.admin, 'patch', `/api/admin/users/${u.admin2._id}/role`).send({ role: 'agent' });
    assert.equal(other.status, 200);
  });

  // Regression: each request passed the self-check, so both succeeded and no admin was left.
  for (const [label, path, body] of [
    ['demote', 'role', { role: 'agent' }],
    ['deactivate', 'status', { isActive: false }],
  ]) {
    it(`two admins who ${label} each other at the same moment never leave zero active admins`, async (t) => {
      if (!requireDB(t)) return;
      const responses = await Promise.all([
        as(u.admin, 'patch', `/api/admin/users/${u.admin2._id}/${path}`).send(body),
        as(u.admin2, 'patch', `/api/admin/users/${u.admin._id}/${path}`).send(body),
      ]);

      for (const res of responses) {
        if (res.status !== 200) assertError(res, 409, 'LAST_ACTIVE_ADMIN');
      }
      assert.ok(responses.some((res) => res.status === 409), 'at least one change is refused');
      assert.ok((await User.countDocuments({ role: 'admin', isActive: true })) >= 1);
    });
  }

  it('changing an inactive admin or a non-admin is never blocked by the last-admin rule', async (t) => {
    if (!requireDB(t)) return;
    await User.updateOne({ _id: u.admin2._id }, { isActive: false });
    assert.equal((await as(u.admin, 'patch', `/api/admin/users/${u.admin2._id}/role`).send({ role: 'agent' })).status, 200);
    assert.equal((await as(u.admin, 'patch', `/api/admin/users/${u.agent._id}/status`).send({ isActive: false })).status, 200);
  });

  it('validates input and ids: bad role / non-boolean status / missing body 400, bad id 400, unknown 404', async (t) => {
    if (!requireDB(t)) return;
    const target = `/api/admin/users/${u.customer._id}`;
    assertError(await as(u.admin, 'patch', `${target}/role`).send({ role: 'owner' }), 400, 'VALIDATION_ERROR');
    assertError(await as(u.admin, 'patch', `${target}/role`), 400, 'VALIDATION_ERROR');
    assertError(await as(u.admin, 'patch', `${target}/status`).send({ isActive: 'false' }), 400, 'VALIDATION_ERROR');
    assertError(await as(u.admin, 'patch', `${target}/status`).send({}), 400, 'VALIDATION_ERROR');
    assertError(await as(u.admin, 'patch', '/api/admin/users/not-an-id/role').send({ role: 'agent' }), 400, 'INVALID_ID');
    assertError(await as(u.admin, 'patch', '/api/admin/users/0123456789abcdef01234567/role').send({ role: 'agent' }), 404, 'NOT_FOUND');
  });
});
