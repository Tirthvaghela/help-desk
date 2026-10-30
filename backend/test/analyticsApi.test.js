import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { Ticket } from '../src/models/Ticket.js';
import { TicketComment } from '../src/models/TicketComment.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { authHeader, createCategory, createTicket, createUser } from './helpers/factories.js';

// GET /api/admin/analytics through the real app. The metrics themselves are in analytics.test.js.

let connected = false;
let u;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  u = {
    customer: await createUser({ role: 'customer', name: 'Private Customer', email: 'private.customer@example.test' }),
    agent: await createUser({ role: 'agent', name: 'Agent Ana', email: 'agent.ana@example.test' }),
    admin: await createUser({ role: 'admin' }),
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

const analytics = (query = '') => request(app).get(`/api/admin/analytics${query}`).set(authHeader(u.admin));

describe('GET /api/admin/analytics — access', () => {
  it('admins get the report', async (t) => {
    if (!requireDB(t)) return;
    const res = await analytics();
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body), ['filters', 'asOf', 'overview', 'byStatus', 'byPriority', 'byCategory', 'resolutionTime', 'sla', 'byAssignee']);
  });

  it('refuses a signed-out request (401), a customer and an agent (403)', async (t) => {
    if (!requireDB(t)) return;
    assert.equal((await request(app).get('/api/admin/analytics')).status, 401);
    for (const user of [u.customer, u.agent]) {
      const res = await request(app).get('/api/admin/analytics').set(authHeader(user));
      assert.equal(res.status, 403, user.role);
      assert.equal(res.body.error.code, 'FORBIDDEN');
      assert.equal(res.body.sla, undefined);
    }
  });

  it('checks access before validating dates', async (t) => {
    if (!requireDB(t)) return;
    const res = await request(app).get('/api/admin/analytics?from=not-a-date').set(authHeader(u.agent));
    assert.equal(res.status, 403);
  });

  it('is read-only: only GET and HEAD are routed', async (t) => {
    if (!requireDB(t)) return;
    for (const method of ['post', 'put', 'patch', 'delete']) {
      const res = await request(app)[method]('/api/admin/analytics').set(authHeader(u.admin));
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.allow, 'GET, HEAD, OPTIONS');
    }
  });
});

describe('GET /api/admin/analytics — date parameters', () => {
  it('refuses blank, malformed, impossible, repeated and operator values with one error format', async (t) => {
    if (!requireDB(t)) return;
    const queries = [
      '?from=',
      '?to=',
      '?from=%20%20',
      '?from=not-a-date',
      '?to=2026-02-31',
      '?from=1',
      '?from=2026-10-01T24:00:00Z',
      '?from=2026-10-01&from=2026-10-02',
      '?to=2026-10-01&to=2026-10-02',
      '?from[$gt]=2026-10-01',
      '?to[$ne]=2026-10-01',
      '?from=2026-10-02&to=2026-10-01',
    ];
    for (const query of queries) {
      const res = await analytics(query);
      assert.equal(res.status, 400, `${query}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR', query);
      assert.equal(res.body.overview, undefined, query);
    }
  });

  it('accepts ISO dates and offsets, and returns normalized UTC instants', async (t) => {
    if (!requireDB(t)) return;
    const res = await analytics(`?from=${encodeURIComponent('2026-10-01T00:00:00+05:30')}&to=2026-10-31`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.filters, { from: '2026-09-30T18:30:00.000Z', to: '2026-10-31T23:59:59.999Z', basis: 'createdAt' });
  });

  it('ignores unknown parameters, as the rest of the API does', async (t) => {
    if (!requireDB(t)) return;
    assert.equal((await analytics('?sort[$where]=1&fields=passwordHash')).status, 200);
  });

  it('a range limits the tickets, through the real route', async (t) => {
    if (!requireDB(t)) return;
    const category = await createCategory();
    await createTicket({ createdBy: u.customer, category, createdAt: new Date('2026-01-10T12:00:00Z') });
    await createTicket({ createdBy: u.customer, category, createdAt: new Date('2026-03-10T12:00:00Z') });
    assert.equal((await analytics()).body.overview.total, 2);
    assert.equal((await analytics('?from=2026-01-10&to=2026-01-10')).body.overview.total, 1);
    assert.equal((await analytics('?from=2026-01-11&to=2026-03-09')).body.overview.total, 0);
    assert.equal((await analytics('?from=2026-03-11')).body.overview.total, 0);
  });
});

describe('GET /api/admin/analytics — what is returned', () => {
  it('contains no customer details, ticket text, comments, emails or tokens', async (t) => {
    if (!requireDB(t)) return;
    const category = await createCategory({ name: 'Billing' });
    const ticket = await createTicket({
      createdBy: u.customer,
      category,
      assignedTo: u.agent,
      status: 'in_progress',
      subject: 'PRIVATE-SUBJECT text',
      description: 'PRIVATE-DESCRIPTION text',
    });
    await TicketComment.create({ ticket: ticket._id, author: u.customer._id, message: 'PRIVATE-COMMENT text' });

    const res = await analytics();
    assert.equal(res.status, 200);
    const body = JSON.stringify(res.body);
    for (const secret of ['PRIVATE-', 'Private Customer', '@example.test', String(u.customer._id), 'passwordHash', 'ticketNumber', 'HD-']) {
      assert.ok(!body.includes(secret), `leaked ${secret}: ${body}`);
    }
    assert.deepEqual(res.body.byAssignee[0].assignee, { id: String(u.agent._id), name: 'Agent Ana' });
  });

  it('does not change anything it reads', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await createTicket({ createdBy: u.customer, assignedTo: u.agent, status: 'in_progress' });
    const before = await Ticket.collection.findOne({ _id: ticket._id });
    await analytics();
    assert.deepEqual(await Ticket.collection.findOne({ _id: ticket._id }), before);
  });

  it('a ticket created through the API is counted in an SLA state and its first status', async (t) => {
    if (!requireDB(t)) return;
    const category = await createCategory();
    const created = await request(app)
      .post('/api/tickets')
      .set(authHeader(u.customer))
      .send({ subject: 'Cannot sign in', description: 'The sign-in page shows an error.', categoryId: String(category._id), priority: 'high' });
    assert.equal(created.status, 201);
    const { body } = await analytics();
    assert.equal(body.overview.total, 1);
    assert.equal(body.byStatus.open, 1);
    assert.equal(body.byPriority.high, 1);
    assert.equal(body.sla.due, 1);
    assert.equal(body.overview.unassigned, 1);
  });

  it('a real ticket taken to resolved on time counts as met, once, with a resolution time', async (t) => {
    if (!requireDB(t)) return;
    const category = await createCategory();
    const created = await request(app)
      .post('/api/tickets')
      .set(authHeader(u.customer))
      .send({ subject: 'Cannot sign in', description: 'The sign-in page shows an error.', categoryId: String(category._id), priority: 'high' });
    const { id } = created.body.ticket;
    const agent = authHeader(u.agent);
    assert.equal((await request(app).patch(`/api/tickets/${id}/assign`).set(agent).send({ assignedTo: String(u.agent._id) })).status, 200);
    assert.equal((await request(app).patch(`/api/tickets/${id}/status`).set(agent).send({ status: 'in_progress' })).status, 200);
    assert.equal((await request(app).patch(`/api/tickets/${id}/status`).set(agent).send({ status: 'resolved' })).status, 200);

    const { body } = await analytics();
    assert.equal(body.sla.met, 1);
    assert.equal(body.sla.compliancePercent, 100);
    assert.equal(body.sla.eligibleResolvedCount, 1);
    assert.equal(body.resolutionTime.eligibleCount, 1);
    assert.equal(typeof body.resolutionTime.averageMilliseconds, 'number');
  });

  // Resolved is final (D-3, D-10), so there is no reopened state for the metrics to handle.
  it('reopening a resolved ticket is refused, and the figures do not change', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await createTicket({ createdBy: u.customer, assignedTo: u.agent, status: 'resolved' });
    const beforeReport = (await analytics()).body;
    for (const [user, status] of [[u.agent, 'open'], [u.agent, 'in_progress'], [u.admin, 'open'], [u.admin, 'in_progress']]) {
      const res = await request(app).patch(`/api/tickets/${ticket._id}/status`).set(authHeader(user)).send({ status });
      assert.equal(res.status, 400, `${user.role} → ${status}`);
      assert.equal(res.body.error.code, 'TICKET_RESOLVED');
    }
    const afterReport = (await analytics()).body;
    assert.deepEqual(afterReport.byStatus, beforeReport.byStatus);
    assert.deepEqual(afterReport.resolutionTime, beforeReport.resolutionTime);
  });

  it('keeps /api/admin/stats unchanged alongside it', async (t) => {
    if (!requireDB(t)) return;
    const res = await request(app).get('/api/admin/stats').set(authHeader(u.admin));
    assert.deepEqual(res.body, {
      total: 0,
      byStatus: { open: 0, in_progress: 0, resolved: 0 },
      byCategory: [],
      byPriority: { low: 0, medium: 0, high: 0 },
      unresolvedByPriority: { low: 0, medium: 0, high: 0 },
      unassigned: 0,
      byAssignee: [],
    });
  });
});
