import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import agentTicketRoutes from '../src/routes/agentTicket.routes.js';
import { errorHandler, notFound } from '../src/middleware/errorHandler.js';
import { Ticket } from '../src/models/Ticket.js';
import { TicketComment } from '../src/models/TicketComment.js';
import { Counter } from '../src/models/Counter.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, createTicket, authHeader } from './helpers/factories.js';

// Integration tests for the Agent Workflow & Conversations endpoints, through the real app,
// real JWTs and a real test database. Scenario (oldest → newest):
//   t1  customerA  unassigned        open         high    Account & Login
//   t2  customerA  agentX            in_progress  medium  Billing
//   t3  customerB  agentY            open         low     Account & Login
//   t4  customerB  unassigned        open         low     Billing
//   t5  customerA  agentX            resolved     medium  Legacy (inactive category)

let connected = false;
let u; // users
let c; // categories
let t; // tickets

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  u = {
    customerA: await createUser({ role: 'customer', name: 'Asha Customer' }),
    customerB: await createUser({ role: 'customer', name: 'Bilal Customer' }),
    agentX: await createUser({ role: 'agent', name: 'Xena Agent' }),
    agentY: await createUser({ role: 'agent', name: 'Yusuf Agent' }),
    admin: await createUser({ role: 'admin', name: 'Ada Admin' }),
    disabledAgent: await createUser({ role: 'agent', name: 'Dormant Agent', isActive: false }),
  };
  c = {
    account: await createCategory({ name: 'Account & Login' }),
    billing: await createCategory({ name: 'Billing' }),
    legacy: await createCategory({ name: 'Legacy', isActive: false }),
  };
  t = {
    t1: await createTicket({ createdBy: u.customerA, category: c.account, priority: 'high', subject: 'Unable to reset password', createdAt: new Date('2026-10-01') }),
    t2: await createTicket({ createdBy: u.customerA, category: c.billing, assignedTo: u.agentX, status: 'in_progress', subject: 'Invoice shows wrong amount', createdAt: new Date('2026-10-02') }),
    t3: await createTicket({ createdBy: u.customerB, category: c.account, assignedTo: u.agentY, priority: 'low', subject: 'Password reset email never arrives', createdAt: new Date('2026-10-03') }),
    t4: await createTicket({ createdBy: u.customerB, category: c.billing, priority: 'low', subject: 'Refund (50% off) not applied', createdAt: new Date('2026-10-04') }),
    t5: await createTicket({ createdBy: u.customerA, category: c.legacy, assignedTo: u.agentX, status: 'resolved', subject: 'Login works again', createdAt: new Date('2026-10-05') }),
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

// Authenticated request helper: api('get', '/api/tickets', u.agentX)
function api(method, path, user) {
  const req = request(app)[method](path);
  return user ? req.set(authHeader(user)) : req;
}

const id = (doc) => String(doc._id);
const numbersOf = (res) => res.body.tickets.map((ticket) => ticket.subject);
const subjects = (...names) => names.map((name) => t[name].subject);

function assertError(res, status, code) {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.error?.code, code, JSON.stringify(res.body));
}

// No password hashes, emails or Mongo internals anywhere in a response.
function assertNoPrivateFields(body) {
  const text = JSON.stringify(body);
  assert.ok(!text.includes('passwordHash'), 'passwordHash leaked');
  assert.ok(!text.includes('placeholder-hash'), 'password hash value leaked');
  assert.ok(!text.includes('@example.test'), 'email leaked');
  assert.ok(!text.includes('"_id"'), '_id leaked');
  assert.ok(!text.includes('"__v"'), '__v leaked');
}

// ---------------------------------------------------------------------------
describe('GET /api/tickets (agent queue)', () => {
  it('returns 401 without a token', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await api('get', '/api/tickets'), 401, 'UNAUTHORIZED');
  });

  it('returns 403 for customers', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await api('get', '/api/tickets', u.customerA), 403, 'FORBIDDEN');
  });

  it('returns 403 ACCOUNT_DISABLED for a deactivated agent', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await api('get', '/api/tickets', u.disabledAgent), 403, 'ACCOUNT_DISABLED');
  });

  it('agent sees unassigned tickets and tickets assigned to them, never another agent’s', async (tc) => {
    if (!requireDB(tc)) return;
    const x = await api('get', '/api/tickets', u.agentX);
    const y = await api('get', '/api/tickets', u.agentY);

    assert.equal(x.status, 200);
    assert.deepEqual(numbersOf(x), subjects('t5', 't4', 't2', 't1'));
    assert.deepEqual(numbersOf(y), subjects('t4', 't3', 't1'));
  });

  it('admin sees all tickets', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await api('get', '/api/tickets', u.admin);
    assert.deepEqual(numbersOf(res), subjects('t5', 't4', 't3', 't2', 't1'));
    assert.equal(res.body.total, 5);
  });

  it('total counts only tickets the agent may see', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await api('get', '/api/tickets?limit=1', u.agentX);
    assert.equal(res.body.total, 4);
    assert.equal(res.body.tickets.length, 1);
  });

  it('filters by status, priority, category and assignee (id, me, unassigned)', async (tc) => {
    if (!requireDB(tc)) return;
    const cases = [
      ['status=open', subjects('t4', 't1')],
      ['status=resolved', subjects('t5')],
      ['priority=high', subjects('t1')],
      [`category=${id(c.billing)}`, subjects('t4', 't2')],
      [`category=${id(c.legacy)}`, subjects('t5')], // inactive categories still filter (D-6)
      ['assignee=me', subjects('t5', 't2')],
      ['assignee=unassigned', subjects('t4', 't1')],
      [`assignee=${id(u.agentY)}`, []], // another agent's tickets stay hidden
      [`status=open&category=${id(c.account)}`, subjects('t1')],
    ];
    for (const [query, expected] of cases) {
      const res = await api('get', `/api/tickets?${query}`, u.agentX);
      assert.equal(res.status, 200, query);
      assert.deepEqual(numbersOf(res), expected, query);
      assert.equal(res.body.total, expected.length, query);
    }
  });

  it('searches ticketNumber and subject case-insensitively, matching special characters literally', async (tc) => {
    if (!requireDB(tc)) return;
    const cases = [
      ['q=PASSWORD', subjects('t1')], // t3 also matches but belongs to agentY
      [`q=${t.t2.ticketNumber.toLowerCase()}`, subjects('t2')],
      [`q=${encodeURIComponent('(50% off)')}`, subjects('t4')],
      [`q=${encodeURIComponent('.*')}`, []],
    ];
    for (const [query, expected] of cases) {
      const res = await api('get', `/api/tickets?${query}`, u.agentX);
      assert.deepEqual(numbersOf(res), expected, query);
    }
    const admin = await api('get', '/api/tickets?q=password', u.admin);
    assert.deepEqual(numbersOf(admin), subjects('t3', 't1'));
  });

  it('sorts newest first and paginates with page and limit', async (tc) => {
    if (!requireDB(tc)) return;
    const page1 = await api('get', '/api/tickets?limit=2&page=1', u.agentX);
    const page2 = await api('get', '/api/tickets?limit=2&page=2', u.agentX);
    const page3 = await api('get', '/api/tickets?limit=2&page=3', u.agentX);

    assert.deepEqual(numbersOf(page1), subjects('t5', 't4'));
    assert.deepEqual(numbersOf(page2), subjects('t2', 't1'));
    assert.deepEqual(page3.body.tickets, []);
    assert.deepEqual(
      [page1.body.page, page1.body.limit, page1.body.total, page3.body.page, page3.body.total],
      [1, 2, 4, 3, 4],
    );
    const defaults = await api('get', '/api/tickets', u.agentX);
    assert.deepEqual([defaults.body.page, defaults.body.limit], [1, 20]);
  });

  it('returns an empty page, not an error, when there are no tickets', async (tc) => {
    if (!requireDB(tc)) return;
    await Ticket.deleteMany({});
    const res = await api('get', '/api/tickets', u.admin);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { tickets: [], page: 1, limit: 20, total: 0 });
  });

  it('returns 400 for invalid or repeated filter values', async (tc) => {
    if (!requireDB(tc)) return;
    for (const query of ['status=closed', 'status=open&status=resolved', 'priority=urgent', 'category=billing', 'assignee=nobody', 'page=0', 'limit=101', `q=${'x'.repeat(101)}`]) {
      assertError(await api('get', `/api/tickets?${query}`, u.agentX), 400, 'VALIDATION_ERROR');
    }
  });

  it('cannot widen access with operator syntax in the query string', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await api('get', '/api/tickets?assignee[$ne]=x&status[$exists]=true', u.agentY);
    assert.equal(res.status, 200);
    assert.deepEqual(numbersOf(res), subjects('t4', 't3', 't1'));
  });

  it('list items omit description and statusHistory and contain no private fields', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await api('get', '/api/tickets', u.admin);
    const item = res.body.tickets.find((ticket) => ticket.id === id(t.t2));

    assert.deepEqual(Object.keys(item).sort(), ['assignedTo', 'category', 'createdAt', 'createdBy', 'id', 'priority', 'resolvedAt', 'status', 'subject', 'ticketNumber', 'updatedAt']);
    assert.deepEqual(item.createdBy, { id: id(u.customerA), name: 'Asha Customer', role: 'customer' });
    assert.deepEqual(item.assignedTo, { id: id(u.agentX), name: 'Xena Agent', role: 'agent' });
    assert.deepEqual(item.category, { id: id(c.billing), name: 'Billing' });
    assert.equal(res.body.tickets.find((ticket) => ticket.id === id(t.t1)).assignedTo, null);
    assertNoPrivateFields(res.body);
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/tickets/:id (ticket detail, D-7)', () => {
  it('returns the full ticket to its owner', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await api('get', `/api/tickets/${id(t.t2)}`, u.customerA);

    assert.equal(res.status, 200);
    const { ticket } = res.body;
    assert.equal(ticket.id, id(t.t2));
    assert.equal(ticket.ticketNumber, t.t2.ticketNumber);
    assert.equal(ticket.description, t.t2.description);
    assert.deepEqual(ticket.statusHistory.map((entry) => entry.status), ['open', 'in_progress']);
    assert.deepEqual(ticket.statusHistory[0].changedBy, { id: id(u.customerA), name: 'Asha Customer', role: 'customer' });
    assert.deepEqual(ticket.statusHistory[1].changedBy, { id: id(u.agentX), name: 'Xena Agent', role: 'agent' });
    assertNoPrivateFields(res.body);
  });

  it('applies the access rule for customers, agents and admins', async (tc) => {
    if (!requireDB(tc)) return;
    const cases = [
      [u.customerA, 't3', 403],
      [u.customerB, 't3', 200],
      [u.agentX, 't3', 403],
      [u.agentY, 't3', 200],
      [u.agentX, 't4', 200], // unassigned
      [u.admin, 't3', 200],
    ];
    for (const [user, ticket, status] of cases) {
      const res = await api('get', `/api/tickets/${id(t[ticket])}`, user);
      assert.equal(res.status, status, `${user.name} → ${ticket}`);
    }
  });

  it('returns 401 without a token, 400 INVALID_ID for a bad id and 404 for a missing ticket', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await api('get', `/api/tickets/${id(t.t1)}`), 401, 'UNAUTHORIZED');
    assertError(await api('get', '/api/tickets/not-an-id', u.admin), 400, 'INVALID_ID');
    assertError(await api('get', `/api/tickets/${new mongoose.Types.ObjectId()}`, u.customerB), 404, 'NOT_FOUND');
  });

  it('lets a router mounted first serve GET /my, as required for Swati’s router (D-7)', async (tc) => {
    if (!requireDB(tc)) return;
    const customerRouter = express.Router();
    customerRouter.get('/my', (req, res) => res.json({ served: 'my' }));

    const correctOrder = express().use(express.json()).use('/api/tickets', customerRouter, agentTicketRoutes).use(notFound, errorHandler);
    const wrongOrder = express().use(express.json()).use('/api/tickets', agentTicketRoutes, customerRouter).use(notFound, errorHandler);

    const ok = await request(correctOrder).get('/api/tickets/my').set(authHeader(u.customerA));
    assert.deepEqual(ok.body, { served: 'my' });
    const broken = await request(wrongOrder).get('/api/tickets/my').set(authHeader(u.customerA));
    assertError(broken, 400, 'INVALID_ID');
  });
});

// ---------------------------------------------------------------------------
describe('PATCH /api/tickets/:id/assign', () => {
  const assign = (ticket, user, body) => api('patch', `/api/tickets/${ticket}/assign`, user).send(body);

  it('returns 400 when neither assignedTo nor priority is given', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await assign(id(t.t1), u.agentX, {}), 400, 'VALIDATION_ERROR');
    assertError(await assign(id(t.t1), u.agentX, { status: 'resolved' }), 400, 'VALIDATION_ERROR');
  });

  it('returns 400 INVALID_ID for an invalid ticket id or assignee id', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await assign('not-an-id', u.admin, { priority: 'high' }), 400, 'INVALID_ID');
    assertError(await assign(id(t.t1), u.admin, { assignedTo: 'nobody' }), 400, 'INVALID_ID');
  });

  it('returns 404 for a ticket that does not exist', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await assign(String(new mongoose.Types.ObjectId()), u.admin, { priority: 'high' }), 404, 'NOT_FOUND');
  });

  it('returns 403 for customers and for agents outside the access rule', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await assign(id(t.t1), u.customerA, { priority: 'low' }), 403, 'FORBIDDEN');
    assertError(await assign(id(t.t3), u.agentX, { priority: 'low' }), 403, 'FORBIDDEN');
    assert.equal((await Ticket.findById(t.t3._id)).priority, 'low');
  });

  it('sets priority', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await assign(id(t.t2), u.agentX, { priority: 'high' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ticket.priority, 'high');
    assert.equal(res.body.ticket.assignedTo.id, id(u.agentX)); // assignee unchanged
    assertNoPrivateFields(res.body);
  });

  it('assigns and unassigns (null)', async (tc) => {
    if (!requireDB(tc)) return;
    const claimed = await assign(id(t.t1), u.agentX, { assignedTo: id(u.agentX) });
    assert.equal(claimed.status, 200);
    assert.deepEqual(claimed.body.ticket.assignedTo, { id: id(u.agentX), name: 'Xena Agent', role: 'agent' });

    const released = await assign(id(t.t1), u.agentX, { assignedTo: null });
    assert.equal(released.status, 200);
    assert.equal(released.body.ticket.assignedTo, null);
    assert.equal((await Ticket.findById(t.t1._id)).assignedTo, null);
  });

  it('rejects an assignee who is not an eligible active user (D-2)', async (tc) => {
    if (!requireDB(tc)) return;
    for (const assignee of [u.customerA, u.disabledAgent, { _id: new mongoose.Types.ObjectId() }]) {
      assertError(await assign(id(t.t1), u.admin, { assignedTo: id(assignee) }), 400, 'VALIDATION_ERROR');
    }
    assert.equal((await Ticket.findById(t.t1._id)).assignedTo, null);
    assert.equal((await assign(id(t.t1), u.admin, { assignedTo: id(u.admin) })).status, 200);
  });

  it('enforces who an agent may assign the ticket to (D-1)', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await assign(id(t.t1), u.agentX, { assignedTo: id(u.agentY) });
    assertError(res, 403, 'FORBIDDEN');
    assert.equal(res.body.error.message, 'Agents can only assign tickets to themselves');
    assert.equal((await Ticket.findById(t.t1._id)).assignedTo, null);

    const byAdmin = await assign(id(t.t1), u.admin, { assignedTo: id(u.agentY) });
    assert.equal(byAdmin.status, 200);
    assert.equal(byAdmin.body.ticket.assignedTo.id, id(u.agentY));
  });

  it('previous agent loses access after reassignment', async (tc) => {
    if (!requireDB(tc)) return;
    assert.equal((await assign(id(t.t2), u.admin, { assignedTo: id(u.agentY) })).status, 200);

    assertError(await api('get', `/api/tickets/${id(t.t2)}`, u.agentX), 403, 'FORBIDDEN');
    assertError(await assign(id(t.t2), u.agentX, { assignedTo: id(u.agentX) }), 403, 'FORBIDDEN');
    assert.equal((await api('get', `/api/tickets/${id(t.t2)}`, u.agentY)).status, 200);
  });

  it('ignores fields outside assignedTo and priority', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await assign(id(t.t1), u.admin, {
      priority: 'low',
      status: 'resolved',
      createdBy: id(u.customerB),
      ticketNumber: 'HD-999',
      resolvedAt: '2020-01-01T00:00:00.000Z',
    });
    assert.equal(res.status, 200);
    const stored = await Ticket.findById(t.t1._id);
    assert.equal(stored.priority, 'low');
    assert.equal(stored.status, 'open');
    assert.ok(stored.createdBy.equals(u.customerA._id));
    assert.equal(stored.ticketNumber, t.t1.ticketNumber);
    assert.equal(stored.resolvedAt, null);
  });

  it('lets only one of two agents claim the same unassigned ticket at once', async (tc) => {
    if (!requireDB(tc)) return;
    const results = await Promise.all([
      assign(id(t.t4), u.agentX, { assignedTo: id(u.agentX) }),
      assign(id(t.t4), u.agentY, { assignedTo: id(u.agentY) }),
    ]);
    const statuses = results.map((res) => res.status).sort();
    assert.deepEqual(statuses, [200, 403]);

    const winner = results.find((res) => res.status === 200).body.ticket.assignedTo.id;
    assert.equal(String((await Ticket.findById(t.t4._id)).assignedTo), winner);
  });
});

// ---------------------------------------------------------------------------
describe('PATCH /api/tickets/:id/status', () => {
  const setStatus = (ticket, user, body) => api('patch', `/api/tickets/${ticket}/status`, user).send(body);

  it('moves open → in_progress and in_progress → resolved', async (tc) => {
    if (!requireDB(tc)) return;
    const started = await setStatus(id(t.t1), u.agentX, { status: 'in_progress' });
    assert.equal(started.status, 200);
    assert.equal(started.body.ticket.status, 'in_progress');
    assert.equal(started.body.ticket.resolvedAt, null);

    const resolved = await setStatus(id(t.t1), u.agentX, { status: 'resolved' });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.ticket.status, 'resolved');
    assertNoPrivateFields(resolved.body);
  });

  it('returns 400 INVALID_STATUS_TRANSITION for skipped, backwards or same-status moves', async (tc) => {
    if (!requireDB(tc)) return;
    const cases = [
      [t.t1, 'resolved', 'Cannot change status from open to resolved'],
      [t.t1, 'open', 'Cannot change status from open to open'],
      [t.t5, 'open', 'Cannot change status from resolved to open'],
      [t.t2, 'open', 'Cannot change status from in_progress to open'],
    ];
    for (const [ticket, status, message] of cases) {
      const res = await setStatus(id(ticket), u.admin, { status });
      assertError(res, 400, 'INVALID_STATUS_TRANSITION');
      assert.equal(res.body.error.message, message);
    }
    assert.equal((await Ticket.findById(t.t5._id)).status, 'resolved');
  });

  it('returns 400 VALIDATION_ERROR for a missing or unknown status, before looking up the ticket', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await setStatus(id(t.t1), u.agentX, {}), 400, 'VALIDATION_ERROR');
    assertError(await setStatus(id(t.t1), u.agentX, { status: 'closed' }), 400, 'VALIDATION_ERROR');
    assertError(await setStatus(String(new mongoose.Types.ObjectId()), u.agentX, {}), 400, 'VALIDATION_ERROR');
  });

  it('appends { status, changedBy, changedAt } to statusHistory, with changedBy from the token', async (tc) => {
    if (!requireDB(tc)) return;
    const before = Date.now();
    const res = await setStatus(id(t.t1), u.agentX, { status: 'in_progress', changedBy: id(u.admin) });
    const history = res.body.ticket.statusHistory;

    assert.deepEqual(history.map((entry) => entry.status), ['open', 'in_progress']);
    assert.deepEqual(history[1].changedBy, { id: id(u.agentX), name: 'Xena Agent', role: 'agent' });
    assert.ok(Date.parse(history[1].changedAt) >= before - 1000);
  });

  it('sets resolvedAt when resolved, and ignores a resolvedAt sent by the client', async (tc) => {
    if (!requireDB(tc)) return;
    const before = Date.now();
    const res = await setStatus(id(t.t2), u.agentX, { status: 'resolved', resolvedAt: '2020-01-01T00:00:00.000Z' });

    assert.equal(res.status, 200);
    const resolvedAt = Date.parse(res.body.ticket.resolvedAt);
    assert.ok(resolvedAt >= before - 1000 && resolvedAt <= Date.now() + 1000);
    assert.equal(res.body.ticket.statusHistory.at(-1).changedAt, res.body.ticket.resolvedAt);
  });

  it('only one of two simultaneous identical status changes succeeds', async (tc) => {
    if (!requireDB(tc)) return;
    const results = await Promise.all([
      setStatus(id(t.t1), u.agentX, { status: 'in_progress' }),
      setStatus(id(t.t1), u.admin, { status: 'in_progress' }),
    ]);
    const statuses = results.map((res) => res.status).sort();
    assert.deepEqual(statuses, [200, 400]);
    assert.equal(results.find((res) => res.status === 400).body.error.code, 'INVALID_STATUS_TRANSITION');

    const stored = await Ticket.findById(t.t1._id);
    assert.deepEqual(stored.statusHistory.map((entry) => entry.status), ['open', 'in_progress']);
  });

  it('returns 403 for customers and agents outside the access rule; admin may update any ticket', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await setStatus(id(t.t1), u.customerA, { status: 'in_progress' }), 403, 'FORBIDDEN');
    assertError(await setStatus(id(t.t3), u.agentX, { status: 'in_progress' }), 403, 'FORBIDDEN');
    assert.equal((await Ticket.findById(t.t3._id)).status, 'open');
    assert.equal((await setStatus(id(t.t3), u.admin, { status: 'in_progress' })).status, 200);
  });

  it('returns 404 for a missing ticket and 400 INVALID_ID for an invalid id', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await setStatus(String(new mongoose.Types.ObjectId()), u.admin, { status: 'in_progress' }), 404, 'NOT_FOUND');
    assertError(await setStatus('not-an-id', u.admin, { status: 'in_progress' }), 400, 'INVALID_ID');
  });
});

// ---------------------------------------------------------------------------
describe('GET and POST /api/tickets/:id/comments', () => {
  const post = (ticket, user, body) => api('post', `/api/tickets/${ticket}/comments`, user).send(body);
  const list = (ticket, user) => api('get', `/api/tickets/${ticket}/comments`, user);

  it('owner, agent inside the access rule and admin can read and post', async (tc) => {
    if (!requireDB(tc)) return;
    for (const [user, ticket] of [[u.customerA, 't1'], [u.agentX, 't1'], [u.agentY, 't1'], [u.agentX, 't2'], [u.admin, 't3']]) {
      const created = await post(id(t[ticket]), user, { message: `Hello from ${user.name}` });
      assert.equal(created.status, 201, `${user.name} → ${ticket}`);
      assert.equal((await list(id(t[ticket]), user)).status, 200);
    }
  });

  it('another customer and an agent outside the access rule get 403, and nothing is stored', async (tc) => {
    if (!requireDB(tc)) return;
    for (const [user, ticket] of [[u.customerB, 't1'], [u.agentY, 't2'], [u.customerA, 't3']]) {
      assertError(await post(id(t[ticket]), user, { message: 'Let me in' }), 403, 'FORBIDDEN');
      assertError(await list(id(t[ticket]), user), 403, 'FORBIDDEN');
    }
    assert.equal(await TicketComment.countDocuments(), 0);
  });

  it('returns comments oldest first with author and createdAt', async (tc) => {
    if (!requireDB(tc)) return;
    await post(id(t.t2), u.customerA, { message: 'First' });
    await post(id(t.t2), u.agentX, { message: 'Second' });
    await post(id(t.t2), u.customerA, { message: 'Third' });
    const res = await list(id(t.t2), u.admin);

    assert.deepEqual(res.body.comments.map((comment) => comment.message), ['First', 'Second', 'Third']);
    const second = res.body.comments[1];
    assert.deepEqual(Object.keys(second).sort(), ['author', 'createdAt', 'id', 'message', 'ticket']);
    assert.deepEqual(second.author, { id: id(u.agentX), name: 'Xena Agent', role: 'agent' });
    assert.equal(second.ticket, id(t.t2));
    assert.ok(!Number.isNaN(Date.parse(second.createdAt)));
    assertNoPrivateFields(res.body);
  });

  it('sets author from the token, ignoring any author or ticket in the body', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await post(id(t.t1), u.customerA, { message: 'Mine', author: id(u.admin), ticket: id(t.t3) });

    assert.equal(res.status, 201);
    assert.equal(res.body.comment.author.id, id(u.customerA));
    assert.equal(res.body.comment.ticket, id(t.t1));
    assert.equal(await TicketComment.countDocuments({ ticket: t.t3._id }), 0);
  });

  it('returns 400 for an empty or over-2000-character message, before looking up the ticket', async (tc) => {
    if (!requireDB(tc)) return;
    for (const body of [{}, { message: '' }, { message: '   ' }, { message: 'x'.repeat(2001) }, { message: 42 }]) {
      assertError(await post(id(t.t1), u.customerA, body), 400, 'VALIDATION_ERROR');
    }
    assertError(await post(String(new mongoose.Types.ObjectId()), u.customerA, {}), 400, 'VALIDATION_ERROR');
    assert.equal((await post(id(t.t1), u.customerA, { message: 'x'.repeat(2000) })).status, 201);
  });

  it('returns 404 for a missing ticket and 400 INVALID_ID for an invalid id', async (tc) => {
    if (!requireDB(tc)) return;
    const missing = String(new mongoose.Types.ObjectId());
    assertError(await post(missing, u.admin, { message: 'Hello' }), 404, 'NOT_FOUND');
    assertError(await list(missing, u.admin), 404, 'NOT_FOUND');
    assertError(await post('not-an-id', u.admin, { message: 'Hello' }), 400, 'INVALID_ID');
    assertError(await list('not-an-id', u.admin), 400, 'INVALID_ID');
  });

  it('allows replies on resolved tickets without changing their status (D-3)', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await post(id(t.t5), u.customerA, { message: 'Confirmed, it works now.' });

    assert.equal(res.status, 201);
    const stored = await Ticket.findById(t.t5._id);
    assert.equal(stored.status, 'resolved');
    assert.equal(stored.statusHistory.length, 3);
  });

  it('returns 401 without a token', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await list(id(t.t1)), 401, 'UNAUTHORIZED');
    assertError(await post(id(t.t1), undefined, { message: 'Hi' }), 401, 'UNAUTHORIZED');
  });

  it('returns an empty list for a ticket with no comments', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await list(id(t.t1), u.customerA);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { comments: [] });
  });

  it('does not keep a comment if access is revoked between the check and the insert', async (tc) => {
    if (!requireDB(tc)) return;
    // Reassign the ticket to another agent at the exact moment the comment is inserted.
    const originalCreate = TicketComment.create.bind(TicketComment);
    tc.mock.method(TicketComment, 'create', async (...args) => {
      await Ticket.updateOne({ _id: t.t2._id }, { assignedTo: u.agentY._id });
      return originalCreate(...args);
    });

    const res = await post(id(t.t2), u.agentX, { message: 'Posted while losing access' });

    assertError(res, 403, 'FORBIDDEN');
    assert.equal(TicketComment.create.mock.callCount(), 1);
    assert.equal(await TicketComment.countDocuments({ ticket: t.t2._id }), 0);
  });
});

// ---------------------------------------------------------------------------
describe('GET /api/admin/stats', () => {
  it('returns 401 without a token and 403 for customers and agents', async (tc) => {
    if (!requireDB(tc)) return;
    assertError(await api('get', '/api/admin/stats'), 401, 'UNAUTHORIZED');
    assertError(await api('get', '/api/admin/stats', u.customerA), 403, 'FORBIDDEN');
    assertError(await api('get', '/api/admin/stats', u.agentX), 403, 'FORBIDDEN');
  });

  it('returns total and byStatus with all three statuses, including zeros', async (tc) => {
    if (!requireDB(tc)) return;
    await Ticket.deleteMany({});
    const empty = await api('get', '/api/admin/stats', u.admin);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, { total: 0, byStatus: { open: 0, in_progress: 0, resolved: 0 }, byCategory: [] });

    await createTicket({ createdBy: u.customerA, category: c.account });
    const one = await api('get', '/api/admin/stats', u.admin);
    assert.deepEqual(one.body.byStatus, { open: 1, in_progress: 0, resolved: 0 });
    assert.equal(one.body.total, 1);
  });

  it('returns byCategory counts, including inactive categories (D-6)', async (tc) => {
    if (!requireDB(tc)) return;
    const res = await api('get', '/api/admin/stats', u.admin);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.byCategory, [
      { category: { id: id(c.account), name: 'Account & Login' }, count: 2 },
      { category: { id: id(c.billing), name: 'Billing' }, count: 2 },
      { category: { id: id(c.legacy), name: 'Legacy' }, count: 1 },
    ]);
  });

  it('counts match the tickets in the database', async (tc) => {
    if (!requireDB(tc)) return;
    await api('patch', `/api/tickets/${id(t.t1)}/status`, u.agentX).send({ status: 'in_progress' });
    const res = await api('get', '/api/admin/stats', u.admin);

    const expected = {};
    for (const status of ['open', 'in_progress', 'resolved']) {
      expected[status] = await Ticket.countDocuments({ status });
    }
    assert.deepEqual(res.body.byStatus, expected);
    assert.deepEqual(res.body.byStatus, { open: 2, in_progress: 2, resolved: 1 });
    assert.equal(res.body.total, await Ticket.countDocuments());
    assert.equal(res.body.byCategory.reduce((sum, row) => sum + row.count, 0), res.body.total);
  });
});

// ---------------------------------------------------------------------------
describe('HD-104 end-to-end scenario (project brief)', () => {
  // Step 1 (customer submits the ticket through POST /api/tickets and sees it in GET /my)
  // needs Swati's customer ticket endpoints and remains a TODO in agentWorkflow.todo.test.js.
  // Here the customer's ticket is created directly in the database as HD-104.
  it('agent triages, replies and resolves HD-104; the customer follows along; others are blocked', async (tc) => {
    if (!requireDB(tc)) return;
    await Counter.findOneAndUpdate({ _id: 'ticket' }, { seq: 103 }, { upsert: true });
    const hd104 = await createTicket({
      createdBy: u.customerA,
      category: c.account,
      priority: 'medium',
      subject: 'Unable to reset password',
      description: 'The reset link in the email says it has expired.',
    });
    assert.equal(hd104.ticketNumber, 'HD-104');

    // Customer sees it as Open.
    const seen = await api('get', `/api/tickets/${id(hd104)}`, u.customerA);
    assert.equal(seen.body.ticket.status, 'open');

    // 2. Agent filters the queue, opens the ticket, sets priority, assigns it and starts work.
    const queue = await api('get', '/api/tickets?status=open&q=HD-104', u.agentX);
    assert.deepEqual(queue.body.tickets.map((ticket) => ticket.ticketNumber), ['HD-104']);
    assert.equal((await api('get', `/api/tickets/${id(hd104)}`, u.agentX)).status, 200);
    const triaged = await api('patch', `/api/tickets/${id(hd104)}/assign`, u.agentX).send({ priority: 'high', assignedTo: id(u.agentX) });
    assert.equal(triaged.status, 200);
    assert.equal(triaged.body.ticket.priority, 'high');
    const started = await api('patch', `/api/tickets/${id(hd104)}/status`, u.agentX).send({ status: 'in_progress' });
    assert.equal(started.body.ticket.status, 'in_progress');

    // 3. Agent replies; the customer sees the timestamped reply and responds.
    await api('post', `/api/tickets/${id(hd104)}/comments`, u.agentX).send({ message: 'I have sent a new reset link.' });
    const thread = await api('get', `/api/tickets/${id(hd104)}/comments`, u.customerA);
    assert.equal(thread.body.comments.length, 1);
    assert.equal(thread.body.comments[0].author.role, 'agent');
    assert.ok(!Number.isNaN(Date.parse(thread.body.comments[0].createdAt)));
    assert.equal((await api('post', `/api/tickets/${id(hd104)}/comments`, u.customerA).send({ message: 'Thanks, that worked.' })).status, 201);

    // 4. Agent resolves; the customer sees the final status and history.
    assert.equal((await api('patch', `/api/tickets/${id(hd104)}/status`, u.agentX).send({ status: 'resolved' })).status, 200);
    const final = await api('get', `/api/tickets/${id(hd104)}`, u.customerA);
    assert.equal(final.body.ticket.status, 'resolved');
    assert.ok(final.body.ticket.resolvedAt);
    assert.deepEqual(final.body.ticket.statusHistory.map((entry) => entry.status), ['open', 'in_progress', 'resolved']);
    assert.deepEqual((await api('get', `/api/tickets/${id(hd104)}/comments`, u.customerA)).body.comments.map((cm) => cm.message), ['I have sent a new reset link.', 'Thanks, that worked.']);

    // 5. Another customer and another agent are blocked.
    assertError(await api('get', `/api/tickets/${id(hd104)}`, u.customerB), 403, 'FORBIDDEN');
    assertError(await api('get', `/api/tickets/${id(hd104)}`, u.agentY), 403, 'FORBIDDEN');

    // The admin summary reflects it.
    const stats = await api('get', '/api/admin/stats', u.admin);
    assert.equal(stats.body.byStatus.resolved, 2);
    assertNoPrivateFields(final.body);
    assertNoPrivateFields(thread.body);
  });
});
