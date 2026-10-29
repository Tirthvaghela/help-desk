import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { Ticket } from '../src/models/Ticket.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, createTicket, authHeader } from './helpers/factories.js';

// Customer ticket endpoints (API contract §7): POST /api/tickets and GET /api/tickets/my.

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
    customerA: await createUser({ role: 'customer' }),
    customerB: await createUser({ role: 'customer' }),
    agent: await createUser({ role: 'agent' }),
    admin: await createUser({ role: 'admin' }),
  };
  c = {
    billing: await createCategory({ name: 'Billing' }),
    retired: await createCategory({ name: 'Retired', isActive: false }),
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

const validBody = () => ({
  subject: 'Invoice total is wrong',
  description: 'My October invoice charges me twice.',
  categoryId: String(c.billing._id),
  priority: 'high',
});
const create = (user, body) => {
  const req = request(app).post('/api/tickets').set(authHeader(user));
  return body === undefined ? req : req.send(body);
};
const my = (user, query = '') => request(app).get(`/api/tickets/my${query}`).set(authHeader(user));
const assertError = (res, status, code) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.error?.code, code, JSON.stringify(res.body));
};

describe('POST /api/tickets', () => {
  it('creates a ticket owned by the caller and returns { ticket } in the contract shape', async (t) => {
    if (!requireDB(t)) return;
    const res = await create(u.customerA, {
      ...validBody(),
      status: 'resolved',
      createdBy: String(u.customerB._id),
      assignedTo: String(u.agent._id),
      ticketNumber: 'HD-999',
    });

    assert.equal(res.status, 201);
    const { ticket } = res.body;
    assert.match(ticket.ticketNumber, /^HD-[1-9]\d*$/);
    assert.notEqual(ticket.ticketNumber, 'HD-999');
    assert.equal(ticket.status, 'open');
    assert.equal(ticket.priority, 'high');
    assert.equal(ticket.assignedTo, null);
    assert.deepEqual(ticket.category, { id: String(c.billing._id), name: 'Billing' });
    assert.deepEqual(Object.keys(ticket.createdBy).sort(), ['id', 'name', 'role']);
    assert.equal(ticket.createdBy.id, String(u.customerA._id));
    assert.equal(ticket.description, 'My October invoice charges me twice.');
    assert.deepEqual(ticket.statusHistory.map((h) => h.status), ['open']);
  });

  it('accepts the legacy field name `category` as an alias of `categoryId`', async (t) => {
    if (!requireDB(t)) return;
    const { categoryId, ...rest } = validBody();
    const res = await create(u.customerA, { ...rest, category: categoryId });
    assert.equal(res.status, 201);
  });

  it('defaults priority to medium when it is omitted', async (t) => {
    if (!requireDB(t)) return;
    const { priority, ...rest } = validBody(); // eslint-disable-line no-unused-vars
    const res = await create(u.customerA, rest);
    assert.equal(res.body.ticket.priority, 'medium');
  });

  it('returns 400 VALIDATION_ERROR, not 500, when no body is sent', async (t) => {
    if (!requireDB(t)) return;
    assertError(await create(u.customerA), 400, 'VALIDATION_ERROR');
    assert.equal(await Ticket.countDocuments(), 0);
  });

  it('rejects invalid input with the contract error codes', async (t) => {
    if (!requireDB(t)) return;
    const cases = [
      ['empty object', {}, 'VALIDATION_ERROR'],
      ['short subject', { ...validBody(), subject: 'abc' }, 'VALIDATION_ERROR'],
      ['long subject', { ...validBody(), subject: 'x'.repeat(121) }, 'VALIDATION_ERROR'],
      ['short description', { ...validBody(), description: 'short' }, 'VALIDATION_ERROR'],
      ['non-string subject', { ...validBody(), subject: { $gt: '' } }, 'VALIDATION_ERROR'],
      ['missing category', { ...validBody(), categoryId: undefined }, 'VALIDATION_ERROR'],
      ['malformed category id', { ...validBody(), categoryId: 'nope' }, 'INVALID_ID'],
      ['object category id', { ...validBody(), categoryId: { $ne: null } }, 'INVALID_ID'],
      ['inactive category', { ...validBody(), categoryId: String(c.retired._id) }, 'VALIDATION_ERROR'],
      ['unknown category', { ...validBody(), categoryId: String(u.agent._id) }, 'VALIDATION_ERROR'],
      ['unsupported priority', { ...validBody(), priority: 'urgent' }, 'VALIDATION_ERROR'],
      ['non-string priority', { ...validBody(), priority: { $ne: 'x' } }, 'VALIDATION_ERROR'],
    ];
    for (const [label, body, code] of cases) {
      const res = await create(u.customerA, body);
      assert.equal(res.status, 400, `${label}: ${res.status} ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error?.code, code, `${label}: ${JSON.stringify(res.body)}`);
    }
    assert.equal(await Ticket.countDocuments(), 0);
  });

  it('is customer-only: agents and admins get 403, anonymous requests 401', async (t) => {
    if (!requireDB(t)) return;
    assertError(await create(u.agent, validBody()), 403, 'FORBIDDEN');
    assertError(await create(u.admin, validBody()), 403, 'FORBIDDEN');
    assertError(await request(app).post('/api/tickets').send(validBody()), 401, 'UNAUTHORIZED');
    assert.equal(await Ticket.countDocuments(), 0);
  });
});

describe('GET /api/tickets/my', () => {
  it("returns only the caller's tickets, newest first, as list items with pagination metadata", async (t) => {
    if (!requireDB(t)) return;
    await createTicket({ createdBy: u.customerA, category: c.billing, subject: 'First ticket of A', createdAt: new Date('2026-10-01') });
    await createTicket({ createdBy: u.customerB, category: c.billing, subject: 'Ticket of customer B', createdAt: new Date('2026-10-02') });
    await createTicket({ createdBy: u.customerA, category: c.billing, subject: 'Second ticket of A', createdAt: new Date('2026-10-03') });

    const res = await my(u.customerA);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.tickets.map((ticket) => ticket.subject), ['Second ticket of A', 'First ticket of A']);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.limit, 20);
    assert.equal(res.body.total, 2);
    for (const ticket of res.body.tickets) {
      assert.equal(ticket.description, undefined, 'list items omit description');
      assert.equal(ticket.statusHistory, undefined, 'list items omit statusHistory');
      assert.deepEqual(ticket.category, { id: String(c.billing._id), name: 'Billing' });
    }
  });

  it('paginates with page and limit; total counts all matching tickets', async (t) => {
    if (!requireDB(t)) return;
    for (let i = 1; i <= 5; i += 1) {
      await createTicket({ createdBy: u.customerA, category: c.billing, subject: `Ticket number ${i}`, createdAt: new Date(`2026-10-0${i}`) });
    }
    const page1 = await my(u.customerA, '?limit=2');
    const page3 = await my(u.customerA, '?limit=2&page=3');

    assert.deepEqual(page1.body.tickets.map((x) => x.subject), ['Ticket number 5', 'Ticket number 4']);
    assert.equal(page1.body.total, 5);
    assert.deepEqual(page3.body.tickets.map((x) => x.subject), ['Ticket number 1']);
    assert.equal(page3.body.page, 3);
  });

  it('filters by status; ignores the staff-only assignee filter', async (t) => {
    if (!requireDB(t)) return;
    await createTicket({ createdBy: u.customerA, category: c.billing, subject: 'Still open ticket' });
    await createTicket({ createdBy: u.customerA, category: c.billing, assignedTo: u.agent, status: 'resolved', subject: 'Resolved ticket' });

    const resolved = await my(u.customerA, '?status=resolved');
    assert.deepEqual(resolved.body.tickets.map((x) => x.subject), ['Resolved ticket']);
    assert.equal(resolved.body.total, 1);
    const withAssignee = await my(u.customerA, `?assignee=${u.agent._id}`);
    assert.equal(withAssignee.body.total, 2);
  });

  it('rejects invalid query values (400)', async (t) => {
    if (!requireDB(t)) return;
    for (const query of ['?status=bogus', '?priority=urgent', '?limit=0', '?limit=101', '?page=abc', '?category=nope']) {
      assertError(await my(u.customerA, query), 400, 'VALIDATION_ERROR');
    }
  });

  it('returns an empty list for a customer without tickets', async (t) => {
    if (!requireDB(t)) return;
    const res = await my(u.customerB);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { tickets: [], page: 1, limit: 20, total: 0 });
  });

  it('is customer-only: agents and admins get 403, anonymous requests 401', async (t) => {
    if (!requireDB(t)) return;
    assertError(await my(u.agent), 403, 'FORBIDDEN');
    assertError(await my(u.admin), 403, 'FORBIDDEN');
    assertError(await request(app).get('/api/tickets/my'), 401, 'UNAUTHORIZED');
  });
});
