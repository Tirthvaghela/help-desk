import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { buildAnalytics, compliancePercent } from '../src/utils/analytics.js';
import { parseDateRange } from '../src/utils/dateParams.js';
import { slaState } from '../src/utils/sla.js';
import { Ticket } from '../src/models/Ticket.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createCategory, createUser } from './helpers/factories.js';

// buildAnalytics with a fixed clock, and raw documents, so older or inconsistent records the
// schema would refuse today can be tested too. A 24-hour ticket created at T0 is due at T24 and
// is "due soon" from T18 (exactly 25% left).

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-10-01T00:00:00.000Z');
const at = (hours, ms = 0) => new Date(T0.getTime() + hours * HOUR + ms);

let connected = false;
let customer;
let category;
let sequence = 0;

// Inserts through the driver: no defaults, no validation, nothing added.
async function insertRaw(fields) {
  sequence += 1;
  const doc = {
    ticketNumber: `HD-${sequence}`,
    subject: 'Private subject text',
    description: 'Private description text',
    category: category._id,
    priority: 'high',
    status: 'open',
    statusHistory: [],
    createdBy: customer._id,
    assignedTo: null,
    createdAt: T0,
    updatedAt: T0,
    resolvedAt: null,
    dueAt: at(24),
    ...fields,
  };
  await Ticket.collection.insertOne(doc);
  return doc;
}

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  sequence = 0;
  customer = await createUser({ role: 'customer' });
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

const slaAt = async (now, range = {}) => (await buildAnalytics({ ...range, now })).sla;

describe('buildAnalytics — empty', () => {
  it('an empty database gives zeros, and null where there is nothing to measure', async (t) => {
    if (!requireDB(t)) return;
    await Ticket.deleteMany({});
    assert.deepEqual(await buildAnalytics({ now: T0 }), {
      filters: { from: null, to: null, basis: 'createdAt' },
      asOf: T0.toISOString(),
      overview: { total: 0, unassigned: 0 },
      byStatus: { open: 0, in_progress: 0, resolved: 0, other: 0 },
      byPriority: { low: 0, medium: 0, high: 0, other: 0 },
      byCategory: [],
      resolutionTime: { averageMilliseconds: null, eligibleCount: 0, excludedCount: 0 },
      sla: { met: 0, missed: 0, due: 0, dueSoon: 0, overdue: 0, noSla: 0, compliancePercent: null, eligibleResolvedCount: 0 },
      byAssignee: [],
    });
  });
});

describe('buildAnalytics — status, priority and category', () => {
  it('counts every status and priority, and puts unexpected or missing values in other', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ status: 'open', priority: 'low' });
    await insertRaw({ status: 'open', priority: 'medium' });
    await insertRaw({ status: 'in_progress', priority: 'high' });
    await insertRaw({ status: 'resolved', priority: 'high', resolvedAt: at(1) });
    await insertRaw({ status: 'closed', priority: 'urgent' });
    await insertRaw({ status: null, priority: null });
    const result = await buildAnalytics({ now: at(1) });
    assert.deepEqual(result.byStatus, { open: 2, in_progress: 1, resolved: 1, other: 2 });
    assert.deepEqual(result.byPriority, { low: 1, medium: 1, high: 2, other: 2 });
    assert.equal(result.overview.total, 6);
  });

  it('sorts categories by count then name; keeps inactive, deleted and missing ones', async (t) => {
    if (!requireDB(t)) return;
    const zebra = await createCategory({ name: 'Zebra' });
    const apple = await createCategory({ name: 'Apple', isActive: false });
    const unused = await createCategory({ name: 'Unused' });
    const deletedId = new mongoose.Types.ObjectId();
    for (let i = 0; i < 3; i += 1) await insertRaw({ category: category._id });
    await insertRaw({ category: zebra._id });
    await insertRaw({ category: apple._id });
    await insertRaw({ category: deletedId });
    await insertRaw({ category: null });
    const { byCategory } = await buildAnalytics({ now: at(1) });
    assert.deepEqual(byCategory.slice(0, 3), [
      { category: { id: String(category._id), name: 'Billing', isActive: true }, count: 3 },
      { category: { id: String(apple._id), name: 'Apple', isActive: false }, count: 1 },
      { category: { id: String(zebra._id), name: 'Zebra', isActive: true }, count: 1 },
    ]);
    const unknown = byCategory.slice(3);
    assert.deepEqual(unknown.map((row) => row.category.name), [null, null], 'unknown ones last among equals');
    assert.deepEqual(new Set(unknown.map((row) => row.category.id)), new Set([String(deletedId), null]));
    assert.ok(!byCategory.some((row) => row.category.id === String(unused._id)), 'no tickets, not listed');
  });

  it('unassigned counts only unresolved tickets with no assignee', async (t) => {
    if (!requireDB(t)) return;
    const agent = await createUser({ role: 'agent' });
    await insertRaw({ status: 'open' });
    await insertRaw({ status: 'open', assignedTo: agent._id });
    await insertRaw({ status: 'resolved', resolvedAt: at(1) });
    assert.equal((await buildAnalytics({ now: at(1) })).overview.unassigned, 1);
  });
});

describe('buildAnalytics — assignees', () => {
  it('per-assignee totals by status, most tickets first, with names and ids only', async (t) => {
    if (!requireDB(t)) return;
    const ana = await createUser({ role: 'agent', name: 'Agent Ana' });
    const ben = await createUser({ role: 'admin', name: 'Admin Ben' });
    await insertRaw({ assignedTo: ana._id, status: 'in_progress' });
    await insertRaw({ assignedTo: ana._id, status: 'resolved', resolvedAt: at(1) });
    await insertRaw({ assignedTo: ben._id, status: 'open' });
    assert.deepEqual((await buildAnalytics({ now: at(1) })).byAssignee, [
      { assignee: { id: String(ana._id), name: 'Agent Ana' }, total: 2, byStatus: { open: 0, in_progress: 1, resolved: 1, other: 0 } },
      { assignee: { id: String(ben._id), name: 'Admin Ben' }, total: 1, byStatus: { open: 1, in_progress: 0, resolved: 0, other: 0 } },
    ]);
  });

  it('never names a deleted user or someone whose role is now customer', async (t) => {
    if (!requireDB(t)) return;
    const deletedId = new mongoose.Types.ObjectId();
    const demoted = await createUser({ role: 'customer', name: 'Former Agent' });
    await insertRaw({ assignedTo: deletedId });
    await insertRaw({ assignedTo: demoted._id });
    const { byAssignee } = await buildAnalytics({ now: at(1) });
    assert.deepEqual(byAssignee.map((row) => row.assignee.name), [null, null]);
    assert.ok(!JSON.stringify(byAssignee).includes('Former Agent'));
  });
});

describe('buildAnalytics — date range', () => {
  it('from and to are both inclusive, to the millisecond', async (t) => {
    if (!requireDB(t)) return;
    const from = at(10);
    const to = at(20);
    await insertRaw({ createdAt: at(10, -1), subject: 'before' });
    await insertRaw({ createdAt: from });
    await insertRaw({ createdAt: to });
    await insertRaw({ createdAt: at(20, 1), subject: 'after' });
    const count = async (range) => (await buildAnalytics({ ...range, now: at(30) })).overview.total;
    assert.equal(await count({ from, to }), 2);
    assert.equal(await count({ from }), 3);
    assert.equal(await count({ to }), 3);
    assert.equal(await count({}), 4);
  });

  it('every panel follows the same range, including SLA, assignees and resolution time', async (t) => {
    if (!requireDB(t)) return;
    const ana = await createUser({ role: 'agent' });
    const other = await createCategory({ name: 'Other' });
    // In range: resolved on time.
    await insertRaw({ createdAt: at(0), dueAt: at(24), status: 'resolved', resolvedAt: at(2), assignedTo: ana._id });
    // Out of range: every panel would change if it leaked in.
    await insertRaw({
      createdAt: at(100),
      dueAt: at(124),
      status: 'resolved',
      resolvedAt: at(200),
      priority: 'low',
      category: other._id,
      assignedTo: ana._id,
    });
    await insertRaw({ createdAt: at(101), dueAt: at(102), status: 'open', category: other._id });

    const result = await buildAnalytics({ from: at(0), to: at(50), now: at(300) });
    assert.equal(result.overview.total, 1);
    assert.equal(result.overview.unassigned, 0);
    assert.deepEqual(result.byStatus, { open: 0, in_progress: 0, resolved: 1, other: 0 });
    assert.deepEqual(result.byPriority, { low: 0, medium: 0, high: 1, other: 0 });
    assert.deepEqual(result.byCategory.map((row) => [row.category.name, row.count]), [['Billing', 1]]);
    assert.deepEqual(result.resolutionTime, { averageMilliseconds: 2 * HOUR, eligibleCount: 1, excludedCount: 0 });
    assert.equal(result.sla.met, 1);
    assert.equal(result.sla.missed, 0);
    assert.equal(result.sla.overdue, 0);
    assert.equal(result.byAssignee[0].total, 1);
    assert.deepEqual(result.filters, { from: at(0).toISOString(), to: at(50).toISOString(), basis: 'createdAt' });
  });
});

describe('buildAnalytics — average resolution time', () => {
  it('averages resolvedAt − createdAt of resolved tickets', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ status: 'resolved', resolvedAt: at(2) });
    await insertRaw({ status: 'resolved', resolvedAt: at(4) });
    await insertRaw({ status: 'open' });
    assert.deepEqual((await buildAnalytics({ now: at(5) })).resolutionTime, {
      averageMilliseconds: 3 * HOUR,
      eligibleCount: 2,
      excludedCount: 0,
    });
  });

  it('a resolution at the creation time counts, as zero', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ status: 'resolved', resolvedAt: T0 });
    assert.deepEqual((await buildAnalytics({ now: at(1) })).resolutionTime, { averageMilliseconds: 0, eligibleCount: 1, excludedCount: 0 });
  });

  it('excludes and counts resolved tickets with missing, invalid or negative times', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ status: 'resolved', resolvedAt: at(4) });
    await insertRaw({ status: 'resolved', resolvedAt: null });
    await insertRaw({ status: 'resolved', resolvedAt: 'not-a-date' });
    await insertRaw({ status: 'resolved', resolvedAt: at(-1) });
    await insertRaw({ status: 'resolved', resolvedAt: at(4), createdAt: 'not-a-date' });
    const { resolutionTime } = await buildAnalytics({ now: at(5) });
    assert.deepEqual(resolutionTime, { averageMilliseconds: 4 * HOUR, eligibleCount: 1, excludedCount: 4 });
  });

  it('never uses updatedAt', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ status: 'resolved', resolvedAt: at(2), updatedAt: at(500) });
    await insertRaw({ status: 'resolved', resolvedAt: null, updatedAt: at(500) });
    assert.deepEqual((await buildAnalytics({ now: at(600) })).resolutionTime, {
      averageMilliseconds: 2 * HOUR,
      eligibleCount: 1,
      excludedCount: 1,
    });
  });

  it('an unresolved ticket with a resolvedAt is not counted as resolved', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ status: 'open', resolvedAt: at(2) });
    await insertRaw({ status: 'in_progress', resolvedAt: at(2) });
    const result = await buildAnalytics({ now: at(5) });
    assert.equal(result.byStatus.resolved, 0);
    assert.deepEqual(result.resolutionTime, { averageMilliseconds: null, eligibleCount: 0, excludedCount: 0 });
    assert.equal(result.sla.met, 0);
    assert.equal(result.sla.due, 2, 'still in the unresolved states');
  });
});

describe('buildAnalytics — SLA', () => {
  it('met and missed at the deadline, and neither moves with the clock', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ status: 'resolved', resolvedAt: at(24) });
    await insertRaw({ status: 'resolved', resolvedAt: at(24, 1) });
    for (const now of [at(25), at(9000)]) {
      const sla = await slaAt(now);
      assert.equal(sla.met, 1);
      assert.equal(sla.missed, 1);
      assert.equal(sla.overdue, 0);
    }
  });

  it('exact 25% boundary: due one millisecond before, due soon at it', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({});
    assert.equal((await slaAt(at(18, -1))).due, 1);
    const atBoundary = await slaAt(at(18));
    assert.equal(atBoundary.dueSoon, 1);
    assert.equal(atBoundary.due, 0);
  });

  it('exact deadline: still due soon at it, overdue one millisecond after', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({});
    assert.equal((await slaAt(at(24))).dueSoon, 1);
    const late = await slaAt(at(24, 1));
    assert.equal(late.overdue, 1);
    assert.equal(late.dueSoon, 0);
  });

  it('an overdue ticket is not missed, and does not affect compliance', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ status: 'resolved', resolvedAt: at(1) });
    await insertRaw({ status: 'open' });
    const sla = await slaAt(at(100));
    assert.equal(sla.overdue, 1);
    assert.equal(sla.missed, 0);
    assert.equal(sla.compliancePercent, 100);
    assert.equal(sla.eligibleResolvedCount, 1);
  });

  it('no SLA: missing or invalid dueAt, or resolved with no valid resolvedAt', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ dueAt: null });
    await insertRaw({ dueAt: 'not-a-date' });
    const missing = await insertRaw({});
    await Ticket.collection.updateOne({ _id: missing._id }, { $unset: { dueAt: '' } });
    await insertRaw({ status: 'resolved', resolvedAt: null });
    await insertRaw({ status: 'resolved', resolvedAt: 'not-a-date' });
    const sla = await slaAt(at(1));
    assert.equal(sla.noSla, 5);
    assert.equal(sla.compliancePercent, null);
    assert.equal(sla.eligibleResolvedCount, 0);
  });

  it('zero eligible resolved tickets gives null compliance, without a division error', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({});
    await insertRaw({ status: 'resolved', resolvedAt: at(1), dueAt: null });
    const sla = await slaAt(at(1));
    assert.equal(sla.compliancePercent, null);
    assert.equal(sla.eligibleResolvedCount, 0);
  });

  it('matches slaState on every stored ticket, and the six states add up to the total', async (t) => {
    if (!requireDB(t)) return;
    const now = at(20);
    const fixtures = [
      {},
      { dueAt: at(60), createdAt: T0 },
      { dueAt: at(1) },
      { dueAt: null },
      { dueAt: 'not-a-date' },
      { status: 'in_progress', dueAt: at(21) },
      { status: 'in_progress', dueAt: at(5) },
      { status: 'resolved', resolvedAt: at(3) },
      { status: 'resolved', resolvedAt: at(30) },
      { status: 'resolved', resolvedAt: null },
      { status: 'resolved', resolvedAt: at(3), dueAt: null },
      { createdAt: null },
      { createdAt: 'not-a-date', dueAt: at(21) },
    ];
    for (const fields of fixtures) await insertRaw(fields);

    const direct = { met: 0, missed: 0, due: 0, due_soon: 0, overdue: 0, no_sla: 0 };
    for (const ticket of await Ticket.collection.find().toArray()) direct[slaState(ticket, now)] += 1;

    const result = await buildAnalytics({ now });
    const { sla } = result;
    assert.deepEqual(
      { met: sla.met, missed: sla.missed, due: sla.due, due_soon: sla.dueSoon, overdue: sla.overdue, no_sla: sla.noSla },
      direct,
    );
    assert.ok(Object.values(direct).filter((count) => count > 0).length === 6, 'the fixtures reach all six states');
    const sum = sla.met + sla.missed + sla.due + sla.dueSoon + sla.overdue + sla.noSla;
    assert.equal(sum, result.overview.total);
    assert.equal(sum, fixtures.length);
  });

  it('uses one asOf for every ticket in a response', async (t) => {
    if (!requireDB(t)) return;
    await insertRaw({ dueAt: at(5) });
    assert.equal((await buildAnalytics({ now: at(5) })).asOf, at(5).toISOString());
    assert.equal((await buildAnalytics({ now: at(5) })).sla.overdue, 0);
    assert.equal((await buildAnalytics({ now: at(5, 1) })).sla.overdue, 1);
  });
});

describe('compliancePercent', () => {
  it('rounds down to one decimal, without floating-point surprises', () => {
    assert.equal(compliancePercent(57, 43), 57);
    assert.equal(compliancePercent(1, 2), 33.3);
    assert.equal(compliancePercent(2, 1), 66.6);
    assert.equal(compliancePercent(9999, 1), 99.9, 'a missed ticket never shows as 100%');
    assert.equal(compliancePercent(1, 0), 100);
    assert.equal(compliancePercent(0, 1), 0);
    assert.equal(compliancePercent(0, 0), null);
  });
});

describe('parseDateRange', () => {
  const bad = (query, pattern) => assert.throws(() => parseDateRange(query), (err) => {
    assert.equal(err.status, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    if (pattern) assert.match(err.message, pattern);
    return true;
  });

  it('no parameters means no limit', () => {
    assert.deepEqual(parseDateRange({}), { from: null, to: null });
    assert.deepEqual(parseDateRange({ other: 'x' }), { from: null, to: null });
  });

  it('a date-only from is the start of that UTC day, a date-only to is the end of it', () => {
    const { from, to } = parseDateRange({ from: '2026-10-01', to: '2026-10-01' });
    assert.equal(from.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(to.toISOString(), '2026-10-01T23:59:59.999Z');
  });

  it('converts offsets to UTC instants', () => {
    const { from, to } = parseDateRange({ from: '2026-10-01T00:00:00+05:30', to: '2026-10-01T23:59:59.999+05:30' });
    assert.equal(from.toISOString(), '2026-09-30T18:30:00.000Z');
    assert.equal(to.toISOString(), '2026-10-01T18:29:59.999Z');
  });

  it('refuses blank values instead of treating them as no limit', () => {
    for (const blank of ['', ' ', '   ']) {
      bad({ from: blank }, /blank/);
      bad({ to: blank }, /blank/);
    }
  });

  it('refuses malformed and impossible dates', () => {
    for (const value of ['1', '2026', 'not-a-date', '10/29/2026', '2026-02-31', '2026-13-01', '2026-10-01T24:00:00Z', '2026-10-01T10:00', '2026-10-01T10:00:00+15:00', ' 2026-10-01']) {
      bad({ from: value }, /ISO date/);
      bad({ to: value }, /ISO date/);
    }
  });

  it('refuses repeated parameters, objects and operator keys', () => {
    bad({ from: ['2026-10-01', '2026-10-02'] }, /single value/);
    bad({ to: { $gt: '2026-10-01' } }, /single value/);
    bad({ 'from[$gt]': '2026-10-01' }, /from must be a single value/);
    bad({ 'to[$ne]': '2026-10-01' }, /to must be a single value/);
    bad({ 'from.$gt': '2026-10-01' }, /from must be a single value/);
  });

  it('refuses an end before the start, and allows them to be equal', () => {
    bad({ from: '2026-10-02', to: '2026-10-01' }, /earlier/);
    bad({ from: '2026-10-01T10:00:00.001Z', to: '2026-10-01T10:00:00Z' }, /earlier/);
    assert.doesNotThrow(() => parseDateRange({ from: '2026-10-01T10:00:00Z', to: '2026-10-01T10:00:00Z' }));
  });
});
