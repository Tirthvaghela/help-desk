import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { Ticket } from '../src/models/Ticket.js';
import { Notification } from '../src/models/Notification.js';
import { TicketComment } from '../src/models/TicketComment.js';
import { assertStatusChangeAllowed } from '../src/utils/ticketStatus.js';
import { assertAssignmentStateAllowed, assignmentUpdateConditions } from '../src/utils/ticketAssign.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, createTicket, authHeader } from './helpers/factories.js';

// D-10 ticket ownership: in-progress and resolved tickets always have an assignee, a resolved
// ticket is final, and the former assignee hears about releases/reassignments by others.
// D-11 replies: agents reply only to tickets assigned to them; admins and owners as before.

const codeOf = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err.code;
  }
};

describe('D-10 rules (pure)', () => {
  it('status changes: resolved first, then the transition, then the assignee', () => {
    const agent = '0123456789abcdef01234567';
    assert.equal(codeOf(() => assertStatusChangeAllowed({ status: 'resolved', assignedTo: agent }, 'open')), 'TICKET_RESOLVED');
    assert.equal(codeOf(() => assertStatusChangeAllowed({ status: 'resolved', assignedTo: null }, 'resolved')), 'TICKET_RESOLVED');
    assert.equal(codeOf(() => assertStatusChangeAllowed({ status: 'open', assignedTo: null }, 'resolved')), 'INVALID_STATUS_TRANSITION');
    assert.equal(codeOf(() => assertStatusChangeAllowed({ status: 'open', assignedTo: null }, 'in_progress')), 'ASSIGNEE_REQUIRED');
    assert.equal(codeOf(() => assertStatusChangeAllowed({ status: 'in_progress', assignedTo: null }, 'resolved')), 'ASSIGNEE_REQUIRED');
    assert.equal(codeOf(() => assertStatusChangeAllowed({ status: 'open', assignedTo: agent }, 'in_progress')), null);
    assert.equal(codeOf(() => assertStatusChangeAllowed({ status: 'in_progress', assignedTo: agent }, 'resolved')), null);
  });

  it('assignment changes: resolved is final; in-progress tickets cannot be released', () => {
    for (const update of [{ assignedTo: null }, { assignedTo: 'x' }, { priority: 'high' }]) {
      assert.equal(codeOf(() => assertAssignmentStateAllowed({ status: 'resolved' }, update)), 'TICKET_RESOLVED', JSON.stringify(update));
    }
    assert.equal(codeOf(() => assertAssignmentStateAllowed({ status: 'in_progress' }, { assignedTo: null })), 'ASSIGNEE_REQUIRED');
    for (const update of [{ assignedTo: 'x' }, { priority: 'low' }]) assert.equal(codeOf(() => assertAssignmentStateAllowed({ status: 'in_progress' }, update)), null);
    for (const update of [{ assignedTo: null }, { assignedTo: 'x' }, { priority: 'low' }]) assert.equal(codeOf(() => assertAssignmentStateAllowed({ status: 'open' }, update)), null);
    assert.deepEqual(assignmentUpdateConditions({ assignedTo: null }), { status: 'open' });
    assert.deepEqual(assignmentUpdateConditions({ priority: 'low' }), { status: { $ne: 'resolved' } });
  });
});

describe('D-10 / D-11 over the API', () => {
  let connected = false;
  let u;
  let cat;
  before(async () => {
    connected = await connectTestDB();
  });
  beforeEach(async () => {
    if (!connected) return;
    await resetTestDB();
    u = {
      cara: await createUser({ role: 'customer', name: 'Cara Customer' }),
      ana: await createUser({ role: 'agent', name: 'Agent Ana' }),
      ben: await createUser({ role: 'agent', name: 'Agent Ben' }),
      ada: await createUser({ role: 'admin', name: 'Admin Ada' }),
    };
    cat = await createCategory({ name: 'Billing' });
  });
  after(async () => {
    if (connected) await clearTestDB();
    await disconnectTestDB();
  });
  const requireDB = (t) => {
    if (!connected) t.skip('MongoDB is not reachable at MONGODB_URI_TEST');
    return connected;
  };

  const as = (user, method, path) => request(app)[method](path).set(authHeader(user));
  const status = (ticket, user, next) => as(user, 'patch', `/api/tickets/${ticket._id}/status`).send({ status: next });
  const assign = (ticket, user, body) => as(user, 'patch', `/api/tickets/${ticket._id}/assign`).send(body);
  const reply = (ticket, user) => as(user, 'post', `/api/tickets/${ticket._id}/comments`).send({ message: `Hi from ${user.name}` });
  const expectError = (res, code, httpStatus = 400) => {
    assert.equal(res.status, httpStatus, res.text);
    assert.equal(res.body.error.code, code, res.text);
  };
  const ticket = (over = {}) => createTicket({ createdBy: u.cara, category: cat, ...over });
  const stored = (t) => Ticket.findById(t._id);

  it('starting an unassigned ticket → 400 ASSIGNEE_REQUIRED for agents and admins; nothing changes', async (t) => {
    if (!requireDB(t)) return;
    const open = await ticket();
    for (const user of [u.ana, u.ada]) {
      const res = await status(open, user, 'in_progress');
      expectError(res, 'ASSIGNEE_REQUIRED');
      assert.equal(res.body.error.message, 'Assign the ticket before starting work');
    }
    const after = await stored(open);
    assert.equal(after.status, 'open');
    assert.equal(after.statusHistory.length, 1);
    assert.equal(await Notification.countDocuments(), 0);
  });

  it('assigned tickets: the assignee or an admin starts and resolves; other agents 403', async (t) => {
    if (!requireDB(t)) return;
    const mine = await ticket({ assignedTo: u.ana });
    expectError(await status(mine, u.ben, 'in_progress'), 'FORBIDDEN', 403);
    assert.equal((await status(mine, u.ana, 'in_progress')).status, 200);
    expectError(await status(mine, u.ben, 'resolved'), 'FORBIDDEN', 403);
    const byAdmin = await status(mine, u.ada, 'resolved');
    assert.equal(byAdmin.status, 200, 'admin override');
    assert.equal(byAdmin.body.ticket.assignedTo.id, String(u.ana._id), 'assignee unchanged');
    assert.equal(byAdmin.body.ticket.statusHistory.at(-1).changedBy.id, String(u.ada._id), 'history records the admin');
  });

  it('in-progress tickets cannot be released (agent or admin) but admins can reassign them', async (t) => {
    if (!requireDB(t)) return;
    const working = await ticket({ assignedTo: u.ana, status: 'in_progress' });
    for (const user of [u.ana, u.ada]) {
      const res = await assign(working, user, { assignedTo: null });
      expectError(res, 'ASSIGNEE_REQUIRED');
      assert.equal(res.body.error.message, 'An in-progress ticket must keep an assignee; reassign it instead');
    }
    assert.equal(String((await stored(working)).assignedTo), String(u.ana._id));
    const moved = await assign(working, u.ada, { assignedTo: String(u.ben._id) });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.ticket.assignedTo.id, String(u.ben._id));
    assert.equal(moved.body.ticket.status, 'in_progress');
    assert.equal((await assign(working, u.ben, { priority: 'high' })).status, 200, 'priority still changeable in progress');
  });

  it('open tickets: claim, release and admin assignment work as before (D-1, D-2)', async (t) => {
    if (!requireDB(t)) return;
    const open = await ticket();
    assert.equal((await assign(open, u.ana, { assignedTo: String(u.ana._id) })).status, 200);
    assert.equal((await assign(open, u.ana, { assignedTo: null })).status, 200, 'release while open');
    expectError(await assign(open, u.ana, { assignedTo: String(u.ben._id) }), 'FORBIDDEN', 403);
    assert.equal((await assign(open, u.ada, { assignedTo: String(u.ben._id) })).status, 200);
    expectError(await assign(open, u.ada, { assignedTo: String(u.cara._id) }), 'VALIDATION_ERROR');
  });

  it('resolved tickets are final: status, assignee and priority changes → 400 TICKET_RESOLVED', async (t) => {
    if (!requireDB(t)) return;
    const done = await ticket({ assignedTo: u.ana, status: 'resolved', priority: 'low' });
    for (const next of ['open', 'in_progress', 'resolved']) expectError(await status(done, u.ada, next), 'TICKET_RESOLVED');
    for (const body of [{ assignedTo: null }, { assignedTo: String(u.ben._id) }, { priority: 'high' }, { assignedTo: String(u.ana._id), priority: 'high' }]) {
      expectError(await assign(done, u.ada, body), 'TICKET_RESOLVED');
      expectError(await assign(done, u.ana, body.assignedTo === String(u.ben._id) ? { priority: 'high' } : body), 'TICKET_RESOLVED');
    }
    const after = await stored(done);
    assert.deepEqual([after.status, String(after.assignedTo), after.priority], ['resolved', String(u.ana._id), 'low']);
    assert.equal(await Notification.countDocuments(), 0);
  });

  it('order of checks is unchanged before the new rules: validation, id, 404, 403 come first', async (t) => {
    if (!requireDB(t)) return;
    const done = await ticket({ assignedTo: u.ben, status: 'resolved' });
    expectError(await assign(done, u.ada, {}), 'VALIDATION_ERROR');
    expectError(await assign(done, u.ada, { priority: 'urgent' }), 'VALIDATION_ERROR');
    expectError(await as(u.ada, 'patch', '/api/tickets/not-an-id/assign').send({ priority: 'low' }), 'INVALID_ID');
    expectError(await as(u.ada, 'patch', '/api/tickets/0123456789abcdef01234567/assign').send({ priority: 'low' }), 'NOT_FOUND', 404);
    expectError(await assign(done, u.ana, { priority: 'low' }), 'FORBIDDEN', 403, 'outside access rule before TICKET_RESOLVED');
    expectError(await status(done, u.cara, 'open'), 'FORBIDDEN', 403);
    expectError(await assign(done, u.ada, { assignedTo: String(u.cara._id) }), 'VALIDATION_ERROR', 400, 'ineligible assignee before TICKET_RESOLVED');
    expectError(await status(done, u.ada, 'closed'), 'VALIDATION_ERROR');
  });

  it('a release racing a start never leaves an in-progress ticket without an owner', async (t) => {
    if (!requireDB(t)) return;
    for (let i = 0; i < 5; i += 1) {
      const raced = await ticket({ assignedTo: u.ana });
      const [released, started] = await Promise.all([assign(raced, u.ana, { assignedTo: null }), status(raced, u.ana, 'in_progress')]);
      const after = await stored(raced);
      assert.ok(!(after.status !== 'open' && after.assignedTo == null), `run ${i}: ${after.status}/${after.assignedTo} (${released.status}, ${started.status})`);
      assert.equal([released.status, started.status].filter((s) => s === 200).length, 1, `run ${i}: exactly one wins`);
      for (const res of [released, started].filter((r) => r.status !== 200)) {
        assert.ok(['ASSIGNEE_REQUIRED', 'CONFLICT'].includes(res.body.error.code), res.text);
      }
    }
  });

  it('ticket_unassigned: the former assignee is told when someone else releases or reassigns; not for self-release', async (t) => {
    if (!requireDB(t)) return;
    const a = await ticket({ assignedTo: u.ana });
    await assign(a, u.ada, { assignedTo: String(u.ben._id) });
    const reassigned = await Notification.findOne({ recipient: u.ana._id, type: 'ticket_unassigned' });
    assert.ok(reassigned, 'former assignee notified on reassignment');
    assert.match(reassigned.message, /^Admin Ada reassigned HD-\d+ ".*" to Agent Ben\.$/);
    assert.equal(await Notification.countDocuments({ recipient: u.ben._id, type: 'ticket_assigned' }), 1);

    const listed = await as(u.ana, 'get', '/api/notifications');
    const item = listed.body.notifications.find((n) => n.type === 'ticket_unassigned');
    assert.equal(item.ticket, null, 'no link: the former agent lost access');

    await Notification.deleteMany({});
    const b = await ticket({ assignedTo: u.ben });
    await assign(b, u.ada, { assignedTo: null });
    const released = await Notification.find({ type: 'ticket_unassigned' });
    assert.equal(released.length, 1);
    assert.equal(String(released[0].recipient), String(u.ben._id));
    assert.match(released[0].message, /^Admin Ada unassigned HD-\d+ ".*" from you\.$/);

    await Notification.deleteMany({});
    const c = await ticket({ assignedTo: u.ana });
    await assign(c, u.ana, { assignedTo: null });
    assert.equal(await Notification.countDocuments({ type: 'ticket_unassigned' }), 0, 'no notice for releasing your own ticket');
  });

  it('replies (D-11): owner, assigned agent and admin may reply; other agents may read but not reply', async (t) => {
    if (!requireDB(t)) return;
    const open = await ticket();
    const mine = await ticket({ assignedTo: u.ana });
    assert.equal((await reply(open, u.cara)).status, 201, 'owner');
    assert.equal((await reply(open, u.ada)).status, 201, 'admin on unassigned');
    assert.equal((await reply(mine, u.ana)).status, 201, 'assigned agent');
    for (const agent of [u.ana, u.ben]) {
      assert.equal((await as(agent, 'get', `/api/tickets/${open._id}/comments`)).status, 200, 'agents can read unassigned');
      const denied = await reply(open, agent);
      expectError(denied, 'FORBIDDEN', 403);
      assert.equal(denied.body.error.message, 'Assign this ticket to yourself to reply');
    }
    expectError(await reply(mine, u.ben), 'FORBIDDEN', 403);
    const other = await createUser({ role: 'customer' });
    expectError(await reply(open, other), 'FORBIDDEN', 403);
    assert.equal(await TicketComment.countDocuments(), 3);
    const done = await ticket({ assignedTo: u.ana, status: 'resolved' });
    assert.equal((await reply(done, u.ana)).status, 201, 'replies on resolved tickets still allowed (D-3)');
  });

  it('existing tickets that break the rules stay readable and are not modified', async (t) => {
    if (!requireDB(t)) return;
    const orphanWorking = await ticket({ status: 'in_progress' });
    const orphanDone = await ticket({ status: 'resolved' });
    for (const legacy of [orphanWorking, orphanDone]) {
      assert.equal((await as(u.ana, 'get', `/api/tickets/${legacy._id}`)).status, 200);
      assert.equal((await as(u.ada, 'get', `/api/tickets/${legacy._id}`)).status, 200);
      assert.equal((await as(u.cara, 'get', '/api/tickets/my')).status, 200);
    }
    expectError(await status(orphanWorking, u.ada, 'resolved'), 'ASSIGNEE_REQUIRED');
    assert.equal((await assign(orphanWorking, u.ana, { assignedTo: String(u.ana._id) })).status, 200, 'claiming repairs it');
    assert.equal((await status(orphanWorking, u.ana, 'resolved')).status, 200);
    expectError(await assign(orphanDone, u.ada, { assignedTo: String(u.ben._id) }), 'TICKET_RESOLVED');
    assert.equal((await stored(orphanDone)).assignedTo, null, 'never changed automatically');
  });
});
