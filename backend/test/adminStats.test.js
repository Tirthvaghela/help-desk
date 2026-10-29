import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, createTicket, authHeader } from './helpers/factories.js';

// Admin-dashboard fields of GET /api/admin/stats (added after total/byStatus/byCategory,
// which agentWorkflow.test.js covers) and the optional `from` date.

let connected = false;
let u;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  u = {
    customer: await createUser({ role: 'customer' }),
    ana: await createUser({ role: 'agent', name: 'Agent Ana' }),
    ben: await createUser({ role: 'agent', name: 'Agent Ben' }),
    admin: await createUser({ role: 'admin' }),
  };
  const billing = await createCategory({ name: 'Billing' });
  const old = new Date('2026-01-01');
  const recent = new Date();
  await createTicket({ createdBy: u.customer, category: billing, priority: 'high', createdAt: recent });
  await createTicket({ createdBy: u.customer, category: billing, priority: 'high', assignedTo: u.ana, status: 'in_progress', createdAt: recent });
  await createTicket({ createdBy: u.customer, category: billing, priority: 'low', assignedTo: u.ana, status: 'resolved', createdAt: old });
  await createTicket({ createdBy: u.customer, category: billing, priority: 'medium', assignedTo: u.ben, status: 'resolved', createdAt: old });
  await createTicket({ createdBy: u.customer, category: billing, priority: 'low', status: 'resolved', createdAt: recent });
});

after(async () => {
  if (connected) await clearTestDB();
  await disconnectTestDB();
});

function requireDB(testContext) {
  if (!connected) testContext.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

const stats = (query = '') => request(app).get(`/api/admin/stats${query}`).set(authHeader(u.admin));

describe('GET /api/admin/stats — dashboard fields', () => {
  it('returns priority, unresolved priority, unassigned and per-assignee counts', async (t) => {
    if (!requireDB(t)) return;
    const res = await stats();

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 5);
    assert.deepEqual(res.body.byPriority, { low: 2, medium: 1, high: 2 });
    assert.deepEqual(res.body.unresolvedByPriority, { low: 0, medium: 0, high: 2 });
    assert.equal(res.body.unassigned, 1, 'unresolved and unassigned only');
    assert.deepEqual(res.body.byAssignee, [
      { assignee: { id: String(u.ana._id), name: 'Agent Ana', role: 'agent' }, total: 2, byStatus: { open: 0, in_progress: 1, resolved: 1 } },
      { assignee: { id: String(u.ben._id), name: 'Agent Ben', role: 'agent' }, total: 1, byStatus: { open: 0, in_progress: 0, resolved: 1 } },
    ]);
  });

  it('from= limits every figure to tickets created since that date', async (t) => {
    if (!requireDB(t)) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await stats(`?from=${encodeURIComponent(since)}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 3);
    assert.deepEqual(res.body.byStatus, { open: 1, in_progress: 1, resolved: 1 });
    assert.deepEqual(res.body.byPriority, { low: 1, medium: 0, high: 2 });
    assert.equal(res.body.byAssignee.length, 1);
    assert.equal(res.body.byCategory[0].count, 3);
  });

  it('rejects an invalid from date (400)', async (t) => {
    if (!requireDB(t)) return;
    const res = await stats('?from=not-a-date');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  // Regression: `new Date()` accepted these ("1" became 2001, "2026-02-31" became 3 March).
  it('accepts only ISO dates for from: non-ISO, impossible or zone-less values are 400', async (t) => {
    if (!requireDB(t)) return;
    for (const from of ['1', '0', '2026', '10/29/2026', '2026-02-31', '2026-13-01', '2026-10-01T10:00', '2026-10-01 10:00Z']) {
      const res = await stats(`?from=${encodeURIComponent(from)}`);
      assert.equal(res.status, 400, `${from}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    for (const from of ['2026-01-01', '2026-01-01T00:00:00Z', '2026-01-01T05:30:00+05:30', '2026-01-01T00:00:00.000Z']) {
      assert.equal((await stats(`?from=${encodeURIComponent(from)}`)).status, 200, from);
    }
    assert.equal((await stats('?from=2026-01-02')).body.total, 3, 'date-only means UTC midnight');
  });

  it('range-checks the time and offset of a from date-time', async (t) => {
    if (!requireDB(t)) return;
    const invalid = [
      // hours (24:00 used to roll over to the next day)
      '2026-10-01T24:00:00Z', '2026-10-01T24:00Z', '2026-10-01T25:00:00Z', '2026-10-01T99:00:00Z',
      // minutes and seconds
      '2026-10-01T10:60:00Z', '2026-10-01T10:99Z', '2026-10-01T10:00:60Z', '2026-10-01T10:00:99.000Z',
      // offsets: beyond ±14:00 (used to be accepted up to ±23:59), bad minutes, malformed
      '2026-10-01T10:00:00+15:00', '2026-10-01T10:00:00+23:59', '2026-10-01T10:00:00-14:01', '2026-10-01T10:00:00+24:00',
      '2026-10-01T10:00:00+05:60', '2026-10-01T10:00:00+0530', '2026-10-01T10:00:00+5:30', '2026-10-01T10:00:00z',
    ];
    for (const from of invalid) {
      const res = await stats(`?from=${encodeURIComponent(from)}`);
      assert.equal(res.status, 400, `${from}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }

    const valid = [
      '2026-10-01T00:00Z', '2026-10-01T23:59:59Z', '2026-10-01T23:59:59.999Z',
      '2026-10-01T10:00:00+05:30', '2026-10-01T10:00-03:00', '2026-10-01T10:00:00+14:00', '2026-10-01T10:00:00-12:00',
      '2026-10-01T10:00:00+00:00', '2026-10-01T10:00:00-00:00',
    ];
    for (const from of valid) {
      assert.equal((await stats(`?from=${encodeURIComponent(from)}`)).status, 200, from);
    }

    // Offsets are converted to UTC: both mean 2026-01-02T00:00:00Z, like the date-only form.
    for (const from of ['2026-01-02T05:30:00+05:30', '2026-01-01T19:00:00-05:00']) {
      assert.equal((await stats(`?from=${encodeURIComponent(from)}`)).body.total, 3, from);
    }
    // The two old tickets were created at exactly 2026-01-01T00:00:00Z: included only if the
    // offset is applied (05:30+05:30 is 00:00Z; read as 05:30Z it would exclude them).
    assert.equal((await stats(`?from=${encodeURIComponent('2026-01-01T05:30:00+05:30')}`)).body.total, 5);
  });

  it('keeps totals consistent, and survives a deleted assignee and an empty range', async (t) => {
    if (!requireDB(t)) return;
    await User.deleteOne({ _id: u.ben._id });
    const res = await stats();
    assert.equal(res.status, 200);
    const sum = (counts) => Object.values(counts).reduce((total, n) => total + n, 0);
    assert.equal(sum(res.body.byStatus), res.body.total);
    assert.equal(sum(res.body.byPriority), res.body.total);
    assert.equal(sum(res.body.unresolvedByPriority), res.body.total - res.body.byStatus.resolved);
    assert.deepEqual(res.body.byAssignee.find((row) => row.assignee.id === String(u.ben._id)).assignee, { id: String(u.ben._id) });

    const empty = await stats('?from=2999-01-01');
    assert.deepEqual(empty.body, {
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
