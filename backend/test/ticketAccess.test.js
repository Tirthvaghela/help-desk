import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ApiError } from '../src/utils/ApiError.js';
import { Ticket } from '../src/models/Ticket.js';
import {
  ticketScope,
  canAccessTicket,
  accessibleTicketFilter,
  findAccessibleTicket,
} from '../src/utils/ticketAccess.js';
import { parseQueueQuery, withAccessScope } from '../src/utils/ticketQuery.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, createTicket } from './helpers/factories.js';

let connected = false;
let users;
let tickets;

before(async () => {
  connected = await connectTestDB();
});

// Two customers (A, B), two agents (X, Y), one admin and four tickets:
//   t1: A, unassigned   t2: A, assigned to X   t3: B, assigned to Y   t4: B, unassigned
beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  const [customerA, customerB, agentX, agentY, admin] = await Promise.all([
    createUser({ role: 'customer' }),
    createUser({ role: 'customer' }),
    createUser({ role: 'agent' }),
    createUser({ role: 'agent' }),
    createUser({ role: 'admin' }),
  ]);
  const category = await createCategory();
  users = { customerA, customerB, agentX, agentY, admin };
  tickets = {
    t1: await createTicket({ createdBy: customerA, category, subject: 'Ticket one subject' }),
    t2: await createTicket({ createdBy: customerA, category, assignedTo: agentX, status: 'in_progress', subject: 'Ticket two subject' }),
    t3: await createTicket({ createdBy: customerB, category, assignedTo: agentY, subject: 'Ticket three subject' }),
    t4: await createTicket({ createdBy: customerB, category, subject: 'Ticket four subject' }),
  };
});

after(async () => {
  if (connected) await clearTestDB();
  await disconnectTestDB();
});

function requireDB(t) {
  if (!connected) t.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

function namesOf(docs) {
  const byId = new Map(Object.entries(tickets).map(([name, ticket]) => [String(ticket._id), name]));
  return docs.map((doc) => byId.get(String(doc._id))).sort();
}

const EXPECTED = {
  customerA: ['t1', 't2'],
  customerB: ['t3', 't4'],
  agentX: ['t1', 't2', 't4'],
  agentY: ['t1', 't3', 't4'],
  admin: ['t1', 't2', 't3', 't4'],
};

async function assertApiError(promise, status, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
    return true;
  });
}

describe('ticketScope (database filter)', () => {
  it('shows each role exactly the tickets the access rule allows', async (t) => {
    if (!requireDB(t)) return;
    for (const [name, expected] of Object.entries(EXPECTED)) {
      const found = await Ticket.find(ticketScope(users[name]));
      assert.deepEqual(namesOf(found), expected, name);
    }
  });

  it('denies unknown roles and missing users', () => {
    for (const user of [{ role: 'superuser', _id: new mongoose.Types.ObjectId() }, {}, null, undefined]) {
      assert.throws(() => ticketScope(user), (err) => err instanceof ApiError && err.status === 403);
    }
  });

  it('keeps the rule when combined with queue filters that also use $or', async (t) => {
    if (!requireDB(t)) return;
    const { filter } = parseQueueQuery({ q: 'subject' }, users.agentX._id);
    const found = await Ticket.find(withAccessScope(ticketScope(users.agentX), filter));
    assert.deepEqual(namesOf(found), EXPECTED.agentX);
  });
});

describe('canAccessTicket (single ticket)', () => {
  it('agrees with ticketScope for every user and ticket', async (t) => {
    if (!requireDB(t)) return;
    for (const [userName, expected] of Object.entries(EXPECTED)) {
      for (const [ticketName, ticket] of Object.entries(tickets)) {
        assert.equal(
          canAccessTicket(users[userName], ticket),
          expected.includes(ticketName),
          `${userName} → ${ticketName}`,
        );
      }
    }
  });

  it('works with populated references', async (t) => {
    if (!requireDB(t)) return;
    const populated = await Ticket.findById(tickets.t2._id).populate('assignedTo createdBy');
    assert.equal(canAccessTicket(users.agentX, populated), true);
    assert.equal(canAccessTicket(users.agentY, populated), false);
    assert.equal(canAccessTicket(users.customerA, populated), true);
    assert.equal(canAccessTicket(users.customerB, populated), false);
  });

  it('denies unknown roles', async (t) => {
    if (!requireDB(t)) return;
    assert.equal(canAccessTicket({ role: 'superuser', _id: users.admin._id }, tickets.t1), false);
    assert.equal(canAccessTicket(undefined, tickets.t1), false);
  });
});

describe('findAccessibleTicket', () => {
  it('returns 400 INVALID_ID before looking anything up', async (t) => {
    if (!requireDB(t)) return;
    for (const id of ['abc', 'my', '', undefined]) {
      await assertApiError(findAccessibleTicket(id, users.admin), 400, 'INVALID_ID');
    }
  });

  it('returns 404 for a ticket that does not exist, even for users who could not see it', async (t) => {
    if (!requireDB(t)) return;
    const missing = new mongoose.Types.ObjectId().toString();
    await assertApiError(findAccessibleTicket(missing, users.customerB), 404, 'NOT_FOUND');
  });

  it('returns 403 for tickets outside the rule', async (t) => {
    if (!requireDB(t)) return;
    await assertApiError(findAccessibleTicket(String(tickets.t3._id), users.agentX), 403, 'FORBIDDEN');
    await assertApiError(findAccessibleTicket(String(tickets.t3._id), users.customerA), 403, 'FORBIDDEN');
  });

  it('returns the ticket when allowed', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await findAccessibleTicket(String(tickets.t2._id), users.agentX);
    assert.equal(ticket.ticketNumber, tickets.t2.ticketNumber);
  });
});

describe('reassignment', () => {
  it('moves access from the previous agent to the new one', async (t) => {
    if (!requireDB(t)) return;
    await Ticket.updateOne({ _id: tickets.t2._id }, { assignedTo: users.agentY._id });

    await assertApiError(findAccessibleTicket(String(tickets.t2._id), users.agentX), 403, 'FORBIDDEN');
    assert.ok(await findAccessibleTicket(String(tickets.t2._id), users.agentY));
    assert.ok(!namesOf(await Ticket.find(ticketScope(users.agentX))).includes('t2'));
  });

  it('makes a released ticket visible to every agent again', async (t) => {
    if (!requireDB(t)) return;
    await Ticket.updateOne({ _id: tickets.t3._id }, { assignedTo: null });
    assert.ok(namesOf(await Ticket.find(ticketScope(users.agentX))).includes('t3'));
  });
});

describe('accessibleTicketFilter (atomic updates)', () => {
  it('does not update a ticket outside the rule', async (t) => {
    if (!requireDB(t)) return;
    const result = await Ticket.updateOne(accessibleTicketFilter(tickets.t3._id, users.agentX), { priority: 'high' });
    assert.equal(result.matchedCount, 0);
    assert.equal((await Ticket.findById(tickets.t3._id)).priority, 'medium');
  });

  it('lets only one of two simultaneous identical status changes succeed', async (t) => {
    if (!requireDB(t)) return;
    const filter = accessibleTicketFilter(tickets.t1._id, users.agentX, { status: 'open' });
    const change = () => Ticket.updateOne(filter, { status: 'in_progress' });
    const results = await Promise.all([change(), change()]);

    assert.deepEqual(results.map((r) => r.modifiedCount).sort(), [0, 1]);
  });
});
