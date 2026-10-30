import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import { Ticket } from '../src/models/Ticket.js';
import { TicketSubmission } from '../src/models/TicketSubmission.js';
import { clearSentEmails, sentEmails, waitForPendingEmails } from '../src/services/email.js';
import { requestFingerprint, submissionId } from '../src/utils/idempotency.js';
import { DEFAULT_SLA_HOURS } from '../src/utils/sla.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, createTicket, authHeader } from './helpers/factories.js';

// SLA due dates on tickets (API contract §3, §7, §8): set on creation (both paths), moved by a
// priority change from the original creation time in the same update, staff-only in responses.
// Default targets apply (test/setup.js sets no SLA_HOURS_*).

const HOUR = 60 * 60 * 1000;
const CREATED = new Date('2026-09-01T08:00:00.000Z');

let connected = false;
let u;
let c;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  clearSentEmails();
  if (!connected) return;
  await resetTestDB();
  u = {
    customer: await createUser({ role: 'customer' }),
    agent: await createUser({ role: 'agent' }),
    agent2: await createUser({ role: 'agent' }),
    admin: await createUser({ role: 'admin' }),
  };
  c = { billing: await createCategory({ name: 'Billing' }) };
});

after(async () => {
  if (connected) await clearTestDB();
  await disconnectTestDB();
});

function requireDB(testContext) {
  if (!connected) testContext.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

const body = (overrides = {}) => ({
  subject: 'Invoice total is wrong',
  description: 'My October invoice charges me twice.',
  categoryId: String(c.billing._id),
  ...overrides,
});
const create = (data, key) => {
  const req = request(app).post('/api/tickets').set(authHeader(u.customer));
  if (key) req.set('Idempotency-Key', key);
  return req.send(data);
};
const assign = (user, id, data) => request(app).patch(`/api/tickets/${id}/assign`).set(authHeader(user)).send(data);
const setStatus = (user, id, status) => request(app).patch(`/api/tickets/${id}/status`).set(authHeader(user)).send({ status });
const getTicket = (user, id) => request(app).get(`/api/tickets/${id}`).set(authHeader(user));
const stored = (id) => Ticket.findById(id).lean();
const expectedDue = (createdAt, priority) => new Date(new Date(createdAt).getTime() + DEFAULT_SLA_HOURS[priority] * HOUR);

// A ticket created through the API, then moved to a fixed creation time with the matching due
// date, so the arithmetic in later checks uses known dates.
async function slaTicket(priority = 'medium', { assignedTo = u.agent } = {}) {
  const res = await create(body({ priority }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.ticket.id;
  await Ticket.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { createdAt: CREATED, dueAt: expectedDue(CREATED, priority), assignedTo: assignedTo?._id ?? null } },
  );
  return id;
}

describe('due date on ticket creation', () => {
  it('stores createdAt + the target for each priority (medium when omitted)', async (t) => {
    if (!requireDB(t)) return;
    for (const priority of ['high', 'medium', 'low', undefined]) {
      const res = await create(body(priority ? { priority } : {}));
      assert.equal(res.status, 201);
      const ticket = await stored(res.body.ticket.id);
      assert.equal(ticket.dueAt.getTime(), expectedDue(ticket.createdAt, priority ?? 'medium').getTime(), String(priority));
      assert.equal(new Date(res.body.ticket.createdAt).getTime(), ticket.createdAt.getTime(), 'computed from the stored createdAt');
    }
  });

  it('an idempotent creation stores the same rule; a replay returns the original ticket and never recomputes', async (t) => {
    if (!requireDB(t)) return;
    const first = await create(body({ priority: 'high' }), 'sla-key-00000001');
    assert.equal(first.status, 201);
    const ticket = await stored(first.body.ticket.id);
    assert.equal(ticket.dueAt.getTime(), expectedDue(ticket.createdAt, 'high').getTime());

    // Mark the stored due date: a replay must not write it again.
    const marker = new Date('2030-01-01T00:00:00.000Z');
    await Ticket.collection.updateOne({ _id: ticket._id }, { $set: { dueAt: marker } });
    const replay = await create(body({ priority: 'high' }), 'sla-key-00000001');
    assert.equal(replay.status, 200);
    assert.equal(replay.body.ticket.id, first.body.ticket.id);
    assert.equal((await stored(ticket._id)).dueAt.getTime(), marker.getTime(), 'unchanged by the replay');
    assert.equal(await Ticket.countDocuments(), 1);
  });

  it('taking over an abandoned claim also stores the due date', async (t) => {
    if (!requireDB(t)) return;
    const claimed = new mongoose.Types.ObjectId();
    await TicketSubmission.collection.insertOne({
      _id: submissionId(u.customer._id, 'sla-key-00000002'),
      ticket: claimed,
      fingerprint: requestFingerprint({ subject: 'Invoice total is wrong', description: 'My October invoice charges me twice.', category: String(c.billing._id), priority: 'low' }),
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const res = await create(body({ priority: 'low' }), 'sla-key-00000002');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.ticket.id, String(claimed));
    const ticket = await stored(claimed);
    assert.equal(ticket.dueAt.getTime(), expectedDue(ticket.createdAt, 'low').getTime());
  });
});

describe('due date when the priority changes', () => {
  it('moves to the original creation time + the new target, never from the time of the change', async (t) => {
    if (!requireDB(t)) return;
    const id = await slaTicket('medium');
    let res = await assign(u.agent, id, { priority: 'high' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ticket.dueAt, expectedDue(CREATED, 'high').toISOString());
    assert.equal((await stored(id)).dueAt.getTime(), expectedDue(CREATED, 'high').getTime());

    res = await assign(u.admin, id, { priority: 'low' });
    assert.equal(res.body.ticket.dueAt, expectedDue(CREATED, 'low').toISOString());
    assert.equal((await stored(id)).createdAt.getTime(), CREATED.getTime(), 'creation time untouched');
    await waitForPendingEmails(1000);
    assert.equal(sentEmails().length, 0, 'no email for a priority change');
  });

  it('the same priority again, or an assignment-only change, leaves the due date alone', async (t) => {
    if (!requireDB(t)) return;
    const id = await slaTicket('medium', { assignedTo: null });
    const marker = new Date('2026-09-20T00:00:00.000Z'); // deliberately not the policy value
    await Ticket.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { dueAt: marker } });

    assert.equal((await assign(u.agent, id, { assignedTo: String(u.agent._id) })).status, 200, 'claim');
    assert.equal((await assign(u.agent, id, { priority: 'medium' })).status, 200, 'same priority');
    assert.equal((await assign(u.admin, id, { assignedTo: String(u.agent2._id) })).status, 200, 'reassign');
    assert.equal((await assign(u.admin, id, { assignedTo: null })).status, 200, 'release (open)');
    assert.equal((await stored(id)).dueAt.getTime(), marker.getTime());
  });

  it('assignment and priority in one request: due date follows the new priority', async (t) => {
    if (!requireDB(t)) return;
    const id = await slaTicket('low', { assignedTo: null });
    const res = await assign(u.admin, id, { assignedTo: String(u.agent._id), priority: 'high' });
    assert.equal(res.status, 200);
    const ticket = await stored(id);
    assert.equal(String(ticket.assignedTo), String(u.agent._id));
    assert.equal(ticket.dueAt.getTime(), expectedDue(CREATED, 'high').getTime());
  });

  it('a priority changed by someone else in between makes the request fail (409) instead of mixing due dates', async (t) => {
    if (!requireDB(t)) return;
    const id = await slaTicket('medium');
    const realUpdate = Ticket.findOneAndUpdate;
    let interfered = false;
    t.mock.method(Ticket, 'findOneAndUpdate', async function findOneAndUpdate(...args) {
      if (!interfered) {
        interfered = true; // another request sets "low" just before this one writes
        await Ticket.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { priority: 'low', dueAt: expectedDue(CREATED, 'low') } });
      }
      return realUpdate.apply(this, args);
    });
    const res = await assign(u.agent, id, { priority: 'high' });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    const ticket = await stored(id);
    assert.deepEqual([ticket.priority, ticket.dueAt.getTime()], ['low', expectedDue(CREATED, 'low').getTime()], 'the other change stands, untouched');
  });

  it('simultaneous priority changes always leave priority and due date matching each other', async (t) => {
    if (!requireDB(t)) return;
    const id = await slaTicket('medium');
    const priorities = ['high', 'low', 'high', 'low', 'medium', 'high'];
    const responses = await Promise.all(priorities.map((priority, i) => assign(i % 2 ? u.admin : u.agent, id, { priority })));
    for (const [i, res] of responses.entries()) {
      assert.ok([200, 409].includes(res.status), JSON.stringify(res.body));
      if (res.status === 200) assert.equal(res.body.ticket.dueAt, expectedDue(CREATED, res.body.ticket.priority).toISOString(), `response ${i}`);
    }
    assert.ok(responses.some((res) => res.status === 200));
    const ticket = await stored(id);
    assert.equal(ticket.dueAt.getTime(), expectedDue(CREATED, ticket.priority).getTime());
  });

  it('resolved tickets stay final: priority change refused, due date unchanged', async (t) => {
    if (!requireDB(t)) return;
    const id = await slaTicket('medium');
    assert.equal((await setStatus(u.agent, id, 'in_progress')).status, 200);
    assert.equal((await setStatus(u.agent, id, 'resolved')).status, 200);
    const res = await assign(u.admin, id, { priority: 'high' });
    assert.deepEqual([res.status, res.body.error.code], [400, 'TICKET_RESOLVED']);
    const ticket = await stored(id);
    assert.deepEqual([ticket.priority, ticket.dueAt.getTime()], ['medium', expectedDue(CREATED, 'medium').getTime()]);
  });

  it('status changes never move the due date', async (t) => {
    if (!requireDB(t)) return;
    const id = await slaTicket('high');
    await setStatus(u.agent, id, 'in_progress');
    const res = await setStatus(u.agent, id, 'resolved');
    assert.equal(res.body.ticket.dueAt, expectedDue(CREATED, 'high').toISOString());
  });
});

describe('tickets created before SLAs (no dueAt)', () => {
  it('still work everywhere: dueAt is null for staff, priority changes do not add one', async (t) => {
    if (!requireDB(t)) return;
    const legacy = await createTicket({ createdBy: u.customer, category: c.billing, assignedTo: u.agent });
    await Ticket.collection.updateOne({ _id: legacy._id }, { $unset: { dueAt: '' } }); // field absent, as in old data

    const detail = await getTicket(u.agent, legacy._id);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.ticket.dueAt, null);
    const list = await request(app).get('/api/tickets').set(authHeader(u.admin));
    assert.equal(list.body.tickets.find((ticket) => ticket.id === String(legacy._id)).dueAt, null);

    const changed = await assign(u.agent, legacy._id, { priority: 'high' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.ticket.priority, 'high');
    assert.equal(changed.body.ticket.dueAt, null, 'no due date invented');
    assert.equal((await setStatus(u.agent, legacy._id, 'in_progress')).status, 200);
    assert.equal((await setStatus(u.agent, legacy._id, 'resolved')).status, 200);
    assert.equal((await stored(legacy._id)).dueAt ?? null, null);
  });
});

describe('who sees dueAt', () => {
  it('staff responses include it: queue, detail, assignment and status', async (t) => {
    if (!requireDB(t)) return;
    const id = await slaTicket('high');
    const due = expectedDue(CREATED, 'high').toISOString();
    const list = await request(app).get('/api/tickets').set(authHeader(u.agent));
    assert.equal(list.body.tickets.find((ticket) => ticket.id === id).dueAt, due);
    assert.equal((await getTicket(u.agent, id)).body.ticket.dueAt, due);
    assert.equal((await getTicket(u.admin, id)).body.ticket.dueAt, due);
    assert.equal((await assign(u.agent, id, { assignedTo: String(u.agent._id) })).body.ticket.dueAt, due);
    assert.equal((await setStatus(u.agent, id, 'in_progress')).body.ticket.dueAt, due);
  });

  it('customer responses never include it: creation, replay, history list and detail', async (t) => {
    if (!requireDB(t)) return;
    const created = await create(body({ priority: 'high' }), 'sla-key-00000003');
    const replay = await create(body({ priority: 'high' }), 'sla-key-00000003');
    const plain = await create(body({ priority: 'low' }));
    const mine = await request(app).get('/api/tickets/my').set(authHeader(u.customer));
    const detail = await getTicket(u.customer, created.body.ticket.id);
    assert.equal(detail.status, 200);
    for (const ticket of [created.body.ticket, replay.body.ticket, plain.body.ticket, ...mine.body.tickets, detail.body.ticket]) {
      assert.ok(!('dueAt' in ticket), JSON.stringify(Object.keys(ticket)));
    }
    assert.ok((await stored(created.body.ticket.id)).dueAt instanceof Date, 'stored, just not shown');
  });
});
