import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/utils/ApiError.js';
import { NEXT_STATUS, canTransition, assertStatusTransition } from '../src/utils/ticketStatus.js';
import { TICKET_STATUSES } from '../src/utils/ticketConstants.js';

// Asserts that fn throws a 400 ApiError with the given code and message.
function assertBadRequest(fn, code, message) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    assert.equal(err.code, code);
    assert.equal(err.message, message);
    return true;
  });
}

describe('ticket status transitions', () => {
  it('only allows open → in_progress and in_progress → resolved', () => {
    assert.deepEqual(NEXT_STATUS, { open: 'in_progress', in_progress: 'resolved' });

    const allowed = [];
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_STATUSES) {
        if (canTransition(from, to)) allowed.push(`${from}->${to}`);
      }
    }
    assert.deepEqual(allowed, ['open->in_progress', 'in_progress->resolved']);
  });

  it('does not treat inherited object keys as statuses', () => {
    assert.equal(canTransition('constructor', 'resolved'), false);
    assert.equal(canTransition('__proto__', 'open'), false);
  });
});

describe('assertStatusTransition', () => {
  it('returns the new status for allowed moves', () => {
    assert.equal(assertStatusTransition('open', 'in_progress'), 'in_progress');
    assert.equal(assertStatusTransition('in_progress', 'resolved'), 'resolved');
  });

  it('rejects skipped, backwards and same-status moves with INVALID_STATUS_TRANSITION', () => {
    const cases = [
      ['open', 'resolved'],
      ['resolved', 'open'],
      ['resolved', 'in_progress'],
      ['in_progress', 'open'],
      ['open', 'open'],
      ['in_progress', 'in_progress'],
      ['resolved', 'resolved'],
    ];
    for (const [from, to] of cases) {
      assertBadRequest(
        () => assertStatusTransition(from, to),
        'INVALID_STATUS_TRANSITION',
        `Cannot change status from ${from} to ${to}`,
      );
    }
  });

  it('rejects a missing status with VALIDATION_ERROR', () => {
    for (const value of [undefined, null, '']) {
      assertBadRequest(() => assertStatusTransition('open', value), 'VALIDATION_ERROR', 'status is required');
    }
  });

  it('rejects unknown or wrongly typed statuses with VALIDATION_ERROR', () => {
    for (const value of ['closed', 'IN_PROGRESS', 'In Progress', 1, ['in_progress'], { status: 'in_progress' }]) {
      assertBadRequest(
        () => assertStatusTransition('open', value),
        'VALIDATION_ERROR',
        'status must be one of: open, in_progress, resolved',
      );
    }
  });
});
