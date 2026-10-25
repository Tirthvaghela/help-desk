import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/utils/ApiError.js';
import { parseAssignBody, assertAssignmentAllowed } from '../src/utils/ticketAssign.js';

const USER_ID = '6718f0c2a1b2c3d4e5f60002';

// Asserts that parsing the body throws a 400 ApiError with the given code and message.
function assertRejected(body, code, message) {
  assert.throws(
    () => parseAssignBody(body),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.equal(err.code, code);
      assert.equal(err.message, message);
      return true;
    },
  );
}

describe('parseAssignBody valid requests', () => {
  it('accepts an assignee id', () => {
    assert.deepEqual(parseAssignBody({ assignedTo: USER_ID }), { assignedTo: USER_ID });
  });

  it('accepts null to unassign', () => {
    assert.deepEqual(parseAssignBody({ assignedTo: null }), { assignedTo: null });
  });

  it('accepts a priority on its own', () => {
    assert.deepEqual(parseAssignBody({ priority: 'high' }), { priority: 'high' });
  });

  it('accepts both fields together', () => {
    assert.deepEqual(parseAssignBody({ assignedTo: USER_ID, priority: 'low' }), {
      assignedTo: USER_ID,
      priority: 'low',
    });
  });
});

describe('parseAssignBody fields outside the contract', () => {
  it('never returns other fields, so they cannot be applied', () => {
    const result = parseAssignBody({
      priority: 'medium',
      status: 'resolved',
      createdBy: USER_ID,
      ticketNumber: 'HD-1',
      $set: { status: 'resolved' },
    });
    assert.deepEqual(result, { priority: 'medium' });
  });

  it('does not count other fields towards "at least one field"', () => {
    assertRejected({ status: 'resolved' }, 'VALIDATION_ERROR', 'Provide assignedTo, priority, or both');
  });

  it('ignores inherited properties', () => {
    const body = Object.create({ priority: 'high' });
    assertRejected(body, 'VALIDATION_ERROR', 'Provide assignedTo, priority, or both');
  });
});

describe('parseAssignBody invalid requests', () => {
  it('rejects an empty body', () => {
    assertRejected({}, 'VALIDATION_ERROR', 'Provide assignedTo, priority, or both');
  });

  it('rejects a body that is not a JSON object', () => {
    for (const body of [undefined, null, 'high', 42, [USER_ID]]) {
      assertRejected(body, 'VALIDATION_ERROR', 'Request body must be a JSON object');
    }
  });

  it('rejects invalid assignee ids with INVALID_ID', () => {
    for (const assignedTo of ['me', 'unassigned', '', 'abc', `${USER_ID}0`, 'aaaaaaaaaaaa', 42, true, {}, [USER_ID]]) {
      assertRejected({ assignedTo }, 'INVALID_ID', 'assignedTo must be a valid user id or null');
    }
  });

  it('rejects an operator object as assignee', () => {
    assertRejected({ assignedTo: { $ne: null } }, 'INVALID_ID', 'assignedTo must be a valid user id or null');
  });

  it('rejects unknown, wrongly cased or non-string priorities', () => {
    for (const priority of ['urgent', 'HIGH', '', null, 1, ['high']]) {
      assertRejected({ priority }, 'VALIDATION_ERROR', 'priority must be one of: low, medium, high');
    }
  });

  it('validates both fields when both are given', () => {
    assertRejected({ assignedTo: 'bad', priority: 'high' }, 'INVALID_ID', 'assignedTo must be a valid user id or null');
    assertRejected({ assignedTo: USER_ID, priority: 'urgent' }, 'VALIDATION_ERROR', 'priority must be one of: low, medium, high');
  });
});

describe('assertAssignmentAllowed (D-1)', () => {
  const agent = { role: 'agent', _id: USER_ID };
  const OTHER_ID = '6718f0c2a1b2c3d4e5f60009';

  function assertForbidden(fn, message) {
    assert.throws(fn, (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 403);
      assert.equal(err.code, 'FORBIDDEN');
      if (message) assert.equal(err.message, message);
      return true;
    });
  }

  it('lets an agent claim a ticket for themselves', () => {
    assert.doesNotThrow(() => assertAssignmentAllowed(agent, USER_ID));
  });

  it('compares ids by value, so ObjectId and string forms both match', () => {
    const withObjectId = { role: 'agent', _id: { toString: () => USER_ID } };
    assert.doesNotThrow(() => assertAssignmentAllowed(withObjectId, USER_ID));
  });

  it('lets an agent release a ticket (null) or change only the priority (undefined)', () => {
    assert.doesNotThrow(() => assertAssignmentAllowed(agent, null));
    assert.doesNotThrow(() => assertAssignmentAllowed(agent, undefined));
  });

  it('does not let an agent assign a ticket to another user', () => {
    assertForbidden(() => assertAssignmentAllowed(agent, OTHER_ID), 'Agents can only assign tickets to themselves');
  });

  it('lets an admin assign anyone, release, or change only the priority', () => {
    const admin = { role: 'admin', _id: USER_ID };
    for (const assignedTo of [OTHER_ID, USER_ID, null, undefined]) {
      assert.doesNotThrow(() => assertAssignmentAllowed(admin, assignedTo));
    }
  });

  it('denies customers, unknown roles and missing users, whatever the request', () => {
    for (const actor of [{ role: 'customer', _id: USER_ID }, { role: 'superuser', _id: USER_ID }, undefined]) {
      for (const assignedTo of [USER_ID, null, undefined]) {
        assertForbidden(() => assertAssignmentAllowed(actor, assignedTo));
      }
    }
  });
});
