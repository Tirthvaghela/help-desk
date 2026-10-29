import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { Notification } from '../src/models/Notification.js';
import { Ticket } from '../src/models/Ticket.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, authHeader } from './helpers/factories.js';

// In-app notifications (contract §12a): which ticket events notify whom, and the
// per-user notification endpoints.

let connected = false;
let u;
let category;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  u = {
    cara: await createUser({ role: 'customer', name: 'Cara Customer' }),
    dev: await createUser({ role: 'customer', name: 'Dev Customer' }),
    ana: await createUser({ role: 'agent', name: 'Agent Ana' }),
    ben: await createUser({ role: 'agent', name: 'Agent Ben' }),
    off: await createUser({ role: 'agent', name: 'Agent Off', isActive: false }),
    ada: await createUser({ role: 'admin', name: 'Admin Ada' }),
  };
  category = await createCategory({ name: 'Billing' });
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
// { name: [types…] } of all notifications, for compact assertions.
async function inbox() {
  const all = await Notification.find().sort({ createdAt: 1, _id: 1 }).populate('recipient', 'name');
  const byName = {};
  for (const n of all) (byName[n.recipient.name] ??= []).push(n.type);
  return byName;
}
async function raiseTicket(customer = u.cara) {
  const res = await as(customer, 'post', '/api/tickets').send({
    subject: 'Invoice total is wrong',
    description: 'My October invoice charges me twice.',
    categoryId: String(category._id),
  });
  assert.equal(res.status, 201);
  return res.body.ticket;
}

describe('Ticket events create notifications', () => {
  it('a new ticket notifies every active agent and admin, not the customer or inactive staff', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await raiseTicket();

    assert.deepEqual(await inbox(), {
      'Agent Ana': ['ticket_created'],
      'Agent Ben': ['ticket_created'],
      'Admin Ada': ['ticket_created'],
    });
    const [note] = (await as(u.ana, 'get', '/api/notifications')).body.notifications;
    assert.equal(note.title, `New ticket ${ticket.ticketNumber}`);
    assert.match(note.message, /Cara Customer raised .*Invoice total is wrong/);
    assert.deepEqual(note.ticket, { id: ticket.id, ticketNumber: ticket.ticketNumber });
  });

  it('claiming notifies the customer only (never the agent who acted)', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await raiseTicket();
    await Notification.deleteMany({});
    await as(u.ana, 'patch', `/api/tickets/${ticket.id}/assign`).send({ assignedTo: String(u.ana._id) });

    assert.deepEqual(await inbox(), { 'Cara Customer': ['ticket_assigned'] });
    const note = await Notification.findOne();
    assert.match(note.message, /Agent Ana is now handling/);
  });

  it('an admin assignment that also changes priority gives each person exactly one notification', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await raiseTicket();
    await Notification.deleteMany({});
    await as(u.ada, 'patch', `/api/tickets/${ticket.id}/assign`).send({ assignedTo: String(u.ben._id), priority: 'high' });

    assert.deepEqual(await inbox(), { 'Cara Customer': ['ticket_assigned'], 'Agent Ben': ['ticket_assigned'] });
    const forBen = await Notification.findOne({ recipient: u.ben._id });
    assert.match(forBen.message, /assigned .* to you\. Priority is now High\./);
  });

  it('a priority change notifies the customer and assignee, except the actor', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await raiseTicket();
    await as(u.ana, 'patch', `/api/tickets/${ticket.id}/assign`).send({ assignedTo: String(u.ana._id) });
    await Notification.deleteMany({});

    await as(u.ana, 'patch', `/api/tickets/${ticket.id}/assign`).send({ priority: 'low' });
    assert.deepEqual(await inbox(), { 'Cara Customer': ['priority_changed'] });
    await as(u.ada, 'patch', `/api/tickets/${ticket.id}/assign`).send({ priority: 'high' });
    assert.deepEqual(await inbox(), { 'Cara Customer': ['priority_changed', 'priority_changed'], 'Agent Ana': ['priority_changed'] });
    // No-op updates notify nobody.
    await as(u.ada, 'patch', `/api/tickets/${ticket.id}/assign`).send({ priority: 'high' });
    assert.equal(await Notification.countDocuments(), 3);
  });

  it('status changes notify participants; resolving has its own type', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await raiseTicket();
    await as(u.ana, 'patch', `/api/tickets/${ticket.id}/assign`).send({ assignedTo: String(u.ana._id) });
    await Notification.deleteMany({});

    await as(u.ana, 'patch', `/api/tickets/${ticket.id}/status`).send({ status: 'in_progress' });
    await as(u.ada, 'patch', `/api/tickets/${ticket.id}/status`).send({ status: 'resolved' });
    assert.deepEqual(await inbox(), {
      'Cara Customer': ['status_changed', 'ticket_resolved'],
      'Agent Ana': ['ticket_resolved'],
    });
  });

  it('replies notify the other participants only; failed actions notify nobody', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await raiseTicket();
    await as(u.ana, 'patch', `/api/tickets/${ticket.id}/assign`).send({ assignedTo: String(u.ana._id) });
    await Notification.deleteMany({});

    await as(u.cara, 'post', `/api/tickets/${ticket.id}/comments`).send({ message: 'Any update?' });
    await as(u.ana, 'post', `/api/tickets/${ticket.id}/comments`).send({ message: 'Working on it.' });
    assert.deepEqual(await inbox(), { 'Agent Ana': ['comment_added'], 'Cara Customer': ['comment_added'] });
    assert.match((await Notification.findOne({ recipient: u.cara._id })).message, /^Agent Ana: Working on it\.$/);

    // Not allowed or invalid → no notification.
    await as(u.dev, 'post', `/api/tickets/${ticket.id}/comments`).send({ message: 'Let me in' });
    await as(u.ben, 'patch', `/api/tickets/${ticket.id}/status`).send({ status: 'in_progress' });
    await as(u.ana, 'patch', `/api/tickets/${ticket.id}/status`).send({ status: 'resolved' });
    assert.equal(await Notification.countDocuments(), 2);
  });

  it('a failure to store notifications never breaks the ticket action', async (t) => {
    if (!requireDB(t)) return;
    const original = Notification.insertMany;
    Notification.insertMany = async () => {
      throw new Error('simulated database failure');
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      const ticket = await raiseTicket();
      assert.ok(await Ticket.exists({ _id: ticket.id }));
    } finally {
      Notification.insertMany = original;
      console.error = quiet;
    }
  });
});

describe('Notification endpoints', () => {
  async function seed(recipient, count) {
    const base = Date.now() - count * 1000;
    const docs = Array.from({ length: count }, (_, i) => ({
      recipient: recipient._id,
      type: 'comment_added',
      title: `Note ${i + 1}`,
      message: `Message ${i + 1}`,
      createdAt: new Date(base + i * 1000),
    }));
    return Notification.insertMany(docs);
  }

  it('lists only my notifications, newest first, with stable pages and the unread count', async (t) => {
    if (!requireDB(t)) return;
    await seed(u.cara, 5);
    await seed(u.dev, 3);

    const page1 = await as(u.cara, 'get', '/api/notifications?limit=2');
    const page3 = await as(u.cara, 'get', '/api/notifications?limit=2&page=3');
    assert.equal(page1.status, 200);
    assert.deepEqual(page1.body.notifications.map((n) => n.title), ['Note 5', 'Note 4']);
    assert.deepEqual(page3.body.notifications.map((n) => n.title), ['Note 1']);
    assert.equal(page1.body.total, 5);
    assert.equal(page1.body.unreadCount, 5);
    assert.deepEqual(Object.keys(page1.body.notifications[0]).sort(), ['createdAt', 'id', 'message', 'readAt', 'ticket', 'title', 'type']);
    assert.equal((await as(u.cara, 'get', '/api/notifications/unread-count')).body.unreadCount, 5);
  });

  it('marks one or all as read; unread filter; marking twice keeps the first read time', async (t) => {
    if (!requireDB(t)) return;
    const [first] = await seed(u.cara, 3);
    const one = await as(u.cara, 'patch', `/api/notifications/${first._id}/read`);
    assert.equal(one.status, 200);
    assert.ok(one.body.notification.readAt);
    assert.equal(one.body.unreadCount, 2);
    const again = await as(u.cara, 'patch', `/api/notifications/${first._id}/read`);
    assert.equal(again.body.notification.readAt, one.body.notification.readAt);

    const unreadOnly = await as(u.cara, 'get', '/api/notifications?unread=true');
    assert.equal(unreadOnly.body.total, 2);
    const all = await as(u.cara, 'post', '/api/notifications/read-all');
    assert.deepEqual(all.body, { updated: 2, unreadCount: 0 });
    assert.equal((await as(u.cara, 'get', '/api/notifications/unread-count')).body.unreadCount, 0);
  });

  it("cannot read or mark someone else's notifications (404), and read-all only touches mine", async (t) => {
    if (!requireDB(t)) return;
    const [devNote] = await seed(u.dev, 2);
    await seed(u.cara, 1);
    assertError(await as(u.cara, 'patch', `/api/notifications/${devNote._id}/read`), 404, 'NOT_FOUND');
    await as(u.cara, 'post', '/api/notifications/read-all');
    assert.equal(await Notification.countDocuments({ recipient: u.dev._id, readAt: null }), 2);
    // A recipient supplied by the client is ignored.
    const list = await as(u.cara, 'get', `/api/notifications?recipient=${u.dev._id}`);
    assert.ok(list.body.notifications.every((n) => !n.title.includes('dev')));
    assert.equal(list.body.total, 1);
  });

  it('validates parameters and requires sign-in', async (t) => {
    if (!requireDB(t)) return;
    for (const query of ['limit=0', 'limit=51', 'page=0', 'unread=maybe']) {
      assertError(await as(u.cara, 'get', `/api/notifications?${query}`), 400, 'VALIDATION_ERROR');
    }
    assertError(await as(u.cara, 'patch', '/api/notifications/not-an-id/read'), 400, 'INVALID_ID');
    assertError(await as(u.cara, 'patch', `/api/notifications/${new mongoose.Types.ObjectId()}/read`), 404, 'NOT_FOUND');
    assertError(await request(app).get('/api/notifications'), 401, 'UNAUTHORIZED');
    assertError(await request(app).post('/api/notifications/read-all'), 401, 'UNAUTHORIZED');
  });

  it('the ticket link disappears once the reader loses access or the ticket is gone', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await raiseTicket();
    await as(u.ada, 'patch', `/api/tickets/${ticket.id}/assign`).send({ assignedTo: String(u.ana._id) });
    const linkFor = async (user) => (await as(user, 'get', '/api/notifications')).body.notifications.map((n) => n.ticket?.id ?? null);

    assert.deepEqual(await linkFor(u.ben), [null], 'Ben saw the new ticket, but it is now assigned to Ana');
    assert.deepEqual(await linkFor(u.ana), [ticket.id, ticket.id]);

    await Ticket.deleteOne({ _id: ticket.id });
    assert.deepEqual(await linkFor(u.ana), [null, null]);
  });

  it('notifications persist across sessions (a new sign-in sees the same list)', async (t) => {
    if (!requireDB(t)) return;
    await raiseTicket();
    const first = await as(u.ana, 'get', '/api/notifications');
    const second = await request(app).get('/api/notifications').set(authHeader(u.ana));
    assert.equal(first.body.total, 1);
    assert.deepEqual(second.body.notifications, first.body.notifications);
  });
});
