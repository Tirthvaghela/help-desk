import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatusCounts } from '../src/utils/ticketStats.js';

describe('normalizeStatusCounts', () => {
  it('returns all three statuses as 0 when there are no results', () => {
    const zeros = { open: 0, in_progress: 0, resolved: 0 };
    assert.deepEqual(normalizeStatusCounts([]), zeros);
    assert.deepEqual(normalizeStatusCounts(null), zeros);
    assert.deepEqual(normalizeStatusCounts(undefined), zeros);
  });

  it('keeps supplied counts and fills missing statuses with 0', () => {
    assert.deepEqual(normalizeStatusCounts([{ _id: 'resolved', count: 25 }, { _id: 'open', count: 12 }]), {
      open: 12,
      in_progress: 0,
      resolved: 25,
    });
  });

  it('returns the keys in a fixed order', () => {
    const result = normalizeStatusCounts([{ _id: 'resolved', count: 1 }]);
    assert.deepEqual(Object.keys(result), ['open', 'in_progress', 'resolved']);
  });

  it('adds up repeated rows for the same status', () => {
    assert.deepEqual(normalizeStatusCounts([{ _id: 'open', count: 2 }, { _id: 'open', count: 3 }]), {
      open: 5,
      in_progress: 0,
      resolved: 0,
    });
  });

  it('accepts explicit zero counts', () => {
    assert.equal(normalizeStatusCounts([{ _id: 'in_progress', count: 0 }]).in_progress, 0);
  });

  it('throws on a status outside the contract instead of dropping it', () => {
    for (const status of ['closed', 'OPEN', null, undefined]) {
      assert.throws(() => normalizeStatusCounts([{ _id: status, count: 1 }]), /Unexpected ticket status/);
    }
  });

  it('throws on missing, negative, fractional or non-numeric counts', () => {
    for (const count of [undefined, null, -1, 1.5, '3', Number.NaN, Infinity]) {
      assert.throws(() => normalizeStatusCounts([{ _id: 'open', count }]), /Invalid count/);
    }
  });

  it('throws on malformed rows and inputs', () => {
    assert.throws(() => normalizeStatusCounts([null]), /Unexpected ticket status/);
    assert.throws(() => normalizeStatusCounts({ open: 1 }), TypeError);
  });
});
