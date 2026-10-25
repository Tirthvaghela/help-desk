import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { parseQueueQuery, withAccessScope, QUEUE_SORT } from '../src/utils/ticketQuery.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';

// Runs the parsed queue filters against a real MongoDB to prove they combine safely
// with an access scope. Uses a test-only collection; the real Ticket model is Swati's.
const QueueProbe = mongoose.model(
  'QueueProbeTicket',
  new mongoose.Schema({
    ticketNumber: String,
    subject: String,
    status: String,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdAt: Date,
  }),
);

const agentId = new mongoose.Types.ObjectId();
const otherAgentId = new mongoose.Types.ObjectId();

// Stand-in for the OPEN-1 rule (unassigned or assigned to this agent), used only to
// exercise withAccessScope. The production helper is still to be written by its owner.
const agentScope = { $or: [{ assignedTo: null }, { assignedTo: agentId }] };

describe('queue filters against MongoDB', () => {
  let connected = false;

  before(async () => {
    connected = await connectTestDB();
  });

  beforeEach(async () => {
    if (!connected) return;
    await clearTestDB();
    await QueueProbe.insertMany([
      { ticketNumber: 'HD-101', subject: 'Unable to reset password', status: 'open', assignedTo: null, createdAt: new Date('2026-10-20') },
      { ticketNumber: 'HD-102', subject: 'Password reset link expired', status: 'in_progress', assignedTo: agentId, createdAt: new Date('2026-10-21') },
      { ticketNumber: 'HD-103', subject: 'Password change fails', status: 'open', assignedTo: otherAgentId, createdAt: new Date('2026-10-22') },
      { ticketNumber: 'HD-104', subject: 'Billing question', status: 'open', assignedTo: null, createdAt: new Date('2026-10-23') },
      { ticketNumber: 'HD-105', subject: 'Literal (a.b*) in subject', status: 'open', assignedTo: null, createdAt: new Date('2026-10-24') },
    ]);
  });

  after(async () => {
    if (connected) await clearTestDB();
    await disconnectTestDB();
  });

  // Skips only when MongoDB is unreachable and strict mode is off; CI uses strict mode.
  function requireDB(t) {
    if (!connected) t.skip('MongoDB is not reachable at MONGODB_URI_TEST');
    return connected;
  }

  async function findNumbers(query) {
    return (await QueueProbe.find(query).sort(QUEUE_SORT)).map((doc) => doc.ticketNumber);
  }

  it('keeps the access scope when the search also uses $or', async (t) => {
    if (!requireDB(t)) return;
    const { filter } = parseQueueQuery({ q: 'password' }, agentId);
    const query = withAccessScope(agentScope, filter);

    assert.deepEqual(await findNumbers(query), ['HD-102', 'HD-101']);
    assert.equal(await QueueProbe.countDocuments(query), 2);
  });

  it('shows why object spread is unsafe: the access rule is lost', async (t) => {
    if (!requireDB(t)) return;
    const { filter } = parseQueueQuery({ q: 'password' }, agentId);
    const unsafe = { ...agentScope, ...filter };

    assert.ok((await findNumbers(unsafe)).includes('HD-103'), 'spread leaks another agent’s ticket');
  });

  it('counts only tickets inside the scope, so totals cannot leak', async (t) => {
    if (!requireDB(t)) return;
    const { filter } = parseQueueQuery({ status: 'open' }, agentId);

    assert.equal(await QueueProbe.countDocuments(filter), 4);
    assert.equal(await QueueProbe.countDocuments(withAccessScope(agentScope, filter)), 3);
  });

  it('returns nothing when an agent filters by another agent', async (t) => {
    if (!requireDB(t)) return;
    const { filter } = parseQueueQuery({ assignee: otherAgentId.toString() }, agentId);

    assert.deepEqual(await findNumbers(withAccessScope(agentScope, filter)), []);
  });

  it('supports assignee=me and assignee=unassigned within the scope', async (t) => {
    if (!requireDB(t)) return;
    const mine = parseQueueQuery({ assignee: 'me' }, agentId).filter;
    const unassigned = parseQueueQuery({ assignee: 'unassigned' }, agentId).filter;

    assert.deepEqual(await findNumbers(withAccessScope(agentScope, mine)), ['HD-102']);
    assert.deepEqual(await findNumbers(withAccessScope(agentScope, unassigned)), ['HD-105', 'HD-104', 'HD-101']);
  });

  it('matches regex special characters literally', async (t) => {
    if (!requireDB(t)) return;
    const literal = parseQueueQuery({ q: '(a.b*)' }, agentId).filter;
    const wildcard = parseQueueQuery({ q: '.*' }, agentId).filter;

    assert.deepEqual(await findNumbers(literal), ['HD-105']);
    assert.deepEqual(await findNumbers(wildcard), []);
  });

  it('searches ticket numbers case-insensitively', async (t) => {
    if (!requireDB(t)) return;
    const { filter } = parseQueueQuery({ q: 'hd-104' }, agentId);

    assert.deepEqual(await findNumbers(withAccessScope(agentScope, filter)), ['HD-104']);
  });

  it('paginates newest first with skip and limit', async (t) => {
    if (!requireDB(t)) return;
    const { filter, skip, limit, sort } = parseQueueQuery({ page: '2', limit: '2' }, agentId);
    const page = await QueueProbe.find(filter).sort(sort).skip(skip).limit(limit);

    assert.deepEqual(page.map((doc) => doc.ticketNumber), ['HD-103', 'HD-102']);
  });
});
