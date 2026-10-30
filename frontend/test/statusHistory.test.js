import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTime, statusHistoryRows } from '../src/components/staff/staffFormat.js';

// C-2: status history in the staff ticket views. Entries as the ticket detail API returns
// them: { status, changedBy: { id, name, role }, changedAt }, oldest first.

const customer = { id: 'u1', name: 'Asha Customer', role: 'customer' };
const agent = { id: 'u2', name: 'Xena Agent', role: 'agent' };
const admin = { id: 'u3', name: 'Ada Admin', role: 'admin' };
const history = [
  { status: 'open', changedBy: customer, changedAt: '2026-10-20T09:00:00.000Z' },
  { status: 'in_progress', changedBy: agent, changedAt: '2026-10-21T10:30:00.000Z' },
  { status: 'resolved', changedBy: admin, changedAt: '2026-10-22T16:45:00.000Z' },
];

describe('statusHistoryRows', () => {
  it('one row per entry, in the order the API returns them, with each transition', () => {
    const rows = statusHistoryRows(history, 'resolved');
    assert.deepEqual(rows.map((row) => row.title), ['Open', 'Open → In Progress', 'In Progress → Resolved']);
    assert.deepEqual(rows.map((row) => row.status), ['open', 'in_progress', 'resolved']);
    assert.equal(new Set(rows.map((row) => row.key)).size, 3, 'unique keys, no duplicate rows');
  });

  it('keeps the API order instead of re-sorting', () => {
    const reversed = [...history].reverse();
    assert.deepEqual(statusHistoryRows(reversed, 'resolved').map((row) => row.status), ['resolved', 'in_progress', 'open']);
  });

  it('shows who made each change and when, using the staff date format', () => {
    const [opened, started, resolved] = statusHistoryRows(history, 'resolved');
    assert.equal(opened.by, 'Asha Customer (Customer)');
    assert.equal(started.by, 'Xena Agent (Agent)');
    assert.equal(resolved.by, 'Ada Admin (Admin)');
    assert.equal(started.when, formatDateTime('2026-10-21T10:30:00.000Z'));
    assert.equal(started.at, '2026-10-21T10:30:00.000Z');
  });

  it('marks only the last entry as current, and only when it matches the ticket status', () => {
    assert.deepEqual(statusHistoryRows(history, 'resolved').map((row) => row.current), [false, false, true]);
    assert.deepEqual(statusHistoryRows(history.slice(0, 2), 'in_progress').map((row) => row.current), [false, true]);
    assert.deepEqual(statusHistoryRows(history.slice(0, 2), 'resolved').map((row) => row.current), [false, false], 'history out of step: nothing claimed as current');
    assert.deepEqual(statusHistoryRows(history, undefined).map((row) => row.current), [false, false, false]);
  });

  it('a newly created ticket has a single "Open" entry, which is current', () => {
    const rows = statusHistoryRows(history.slice(0, 1), 'open');
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].title, rows[0].current], ['Open', true]);
  });

  it('missing or empty history gives no rows', () => {
    for (const value of [undefined, null, [], 'open', {}]) {
      assert.deepEqual(statusHistoryRows(value, 'open'), [], String(value));
    }
  });

  it('copes with incomplete entries: unknown user, missing or invalid time, unknown status', () => {
    const rows = statusHistoryRows([
      { status: 'open', changedBy: { id: 'u9' }, changedAt: 'not a date' },
      null,
      { status: 'archived', changedBy: agent, changedAt: '2026-10-21T10:00:00.000Z' },
      { status: 'in_progress', changedBy: null },
    ], 'in_progress');
    assert.deepEqual(rows.map((row) => row.title), ['Open', 'Open → In Progress']);
    assert.deepEqual(rows.map((row) => row.by), [null, null]);
    assert.deepEqual(rows.map((row) => [row.at, row.when]), [[null, '—'], [null, '—']]);
    assert.equal(rows[1].current, true);
  });

  it('a name without a role is shown on its own', () => {
    const [row] = statusHistoryRows([{ status: 'open', changedBy: { id: 'u1', name: 'Asha' }, changedAt: history[0].changedAt }], 'open');
    assert.equal(row.by, 'Asha');
  });
});
