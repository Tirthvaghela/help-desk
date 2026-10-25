import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { ApiError } from '../src/utils/ApiError.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import {
  QUEUE_DEFAULT_LIMIT,
  QUEUE_MAX_LIMIT,
  escapeRegex,
  parseQueueQuery,
  withAccessScope,
} from '../src/utils/ticketQuery.js';

const AGENT_ID = '6718f0c2a1b2c3d4e5f60002';
const OTHER_ID = '6718f0c2a1b2c3d4e5f60003';
const CATEGORY_ID = '6718f0c2a1b2c3d4e5f60100';

// Asserts that parsing the query throws a 400 VALIDATION_ERROR with the given message.
function assertRejected(query, message) {
  assert.throws(
    () => parseQueueQuery(query, AGENT_ID),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.equal(err.code, 'VALIDATION_ERROR');
      assert.equal(err.message, message);
      return true;
    },
  );
}

describe('parseQueueQuery defaults', () => {
  it('returns an empty filter, page 1, the default limit and newest-first sort', () => {
    assert.deepEqual(parseQueueQuery({}, AGENT_ID), {
      filter: {},
      page: 1,
      limit: QUEUE_DEFAULT_LIMIT,
      skip: 0,
      sort: { createdAt: -1 },
    });
  });

  it('treats a missing query object and empty values as "no filter"', () => {
    assert.deepEqual(parseQueueQuery(undefined, AGENT_ID).filter, {});
    const result = parseQueueQuery({ status: '', priority: '  ', q: '', page: '', limit: '' }, AGENT_ID);
    assert.deepEqual(result.filter, {});
    assert.equal(result.page, 1);
    assert.equal(result.limit, QUEUE_DEFAULT_LIMIT);
  });

  it('ignores parameters that are not part of the contract', () => {
    assert.deepEqual(parseQueueQuery({ sort: 'subject', createdBy: OTHER_ID }, AGENT_ID).filter, {});
  });
});

describe('parseQueueQuery filters', () => {
  it('filters by status and priority', () => {
    const { filter } = parseQueueQuery({ status: 'in_progress', priority: 'high' }, AGENT_ID);
    assert.deepEqual(filter, { status: 'in_progress', priority: 'high' });
  });

  it('rejects unknown status and priority values', () => {
    assertRejected({ status: 'closed' }, 'status must be one of: open, in_progress, resolved');
    assertRejected({ priority: 'urgent' }, 'priority must be one of: low, medium, high');
    assertRejected({ status: 'OPEN' }, 'status must be one of: open, in_progress, resolved');
  });

  it('filters by category id and rejects invalid ids', () => {
    assert.deepEqual(parseQueueQuery({ category: CATEGORY_ID }, AGENT_ID).filter, { category: CATEGORY_ID });
    assertRejected({ category: 'billing' }, 'category must be a valid id');
    assertRejected({ category: `${CATEGORY_ID}0` }, 'category must be a valid id');
  });

  it('supports assignee=unassigned, assignee=me and an assignee id', () => {
    assert.deepEqual(parseQueueQuery({ assignee: 'unassigned' }, AGENT_ID).filter, { assignedTo: null });
    assert.deepEqual(parseQueueQuery({ assignee: 'me' }, AGENT_ID).filter, { assignedTo: AGENT_ID });
    assert.deepEqual(parseQueueQuery({ assignee: OTHER_ID }, AGENT_ID).filter, { assignedTo: OTHER_ID });
  });

  it('rejects other assignee values', () => {
    assertRejected({ assignee: 'nobody' }, 'assignee must be a valid id');
    assertRejected({ assignee: 'ME' }, 'assignee must be a valid id');
  });

  it('throws a programming error if assignee=me is used without a current user', () => {
    assert.throws(() => parseQueueQuery({ assignee: 'me' }), (err) => !(err instanceof ApiError));
  });

  it('combines several filters', () => {
    const { filter } = parseQueueQuery(
      { status: 'open', priority: 'low', category: CATEGORY_ID, assignee: 'unassigned' },
      AGENT_ID,
    );
    assert.deepEqual(filter, { status: 'open', priority: 'low', category: CATEGORY_ID, assignedTo: null });
  });
});

describe('parseQueueQuery repeated and non-string parameters', () => {
  it('rejects repeated parameters (parsed as arrays)', () => {
    assertRejected({ status: ['open', 'resolved'] }, 'status must be a single value');
    assertRejected({ assignee: ['me', OTHER_ID] }, 'assignee must be a single value');
    assertRejected({ page: ['1', '2'] }, 'page must be a single value');
  });

  it('rejects object values that could be used as query operators', () => {
    assertRejected({ status: { $ne: 'resolved' } }, 'status must be a single value');
    assertRejected({ category: { $gt: '' } }, 'category must be a single value');
    assertRejected({ q: { $regex: '.*' } }, 'q must be a single value');
  });
});

describe('parseQueueQuery text search', () => {
  it('searches ticketNumber and subject case-insensitively', () => {
    const { filter } = parseQueueQuery({ q: ' HD-104 ' }, AGENT_ID);
    assert.deepEqual(filter, {
      $or: [
        { ticketNumber: { $regex: 'HD-104', $options: 'i' } },
        { subject: { $regex: 'HD-104', $options: 'i' } },
      ],
    });
  });

  it('escapes regex special characters so they match literally', () => {
    const input = 'a.b*c+d?e^f$g{1}(h)|i[j]\\k';
    const { filter } = parseQueueQuery({ q: input }, AGENT_ID);
    const regex = new RegExp(filter.$or[1].subject.$regex, 'i');

    assert.ok(regex.test(`Subject: ${input} (copied)`));
    assert.ok(!regex.test('aXbbbcd'));
  });

  it('does not let a pattern like ".*" match everything', () => {
    const { filter } = parseQueueQuery({ q: '.*' }, AGENT_ID);
    const regex = new RegExp(filter.$or[0].ticketNumber.$regex, 'i');
    assert.ok(!regex.test('HD-104'));
    assert.ok(regex.test('literal .* text'));
  });

  it('accepts exactly 100 characters and rejects 101', () => {
    assert.ok(parseQueueQuery({ q: 'x'.repeat(100) }, AGENT_ID).filter.$or);
    assertRejected({ q: 'x'.repeat(101) }, 'q must be at most 100 characters');
  });
});

describe('parseQueueQuery pagination', () => {
  it('computes skip from page and limit', () => {
    assert.deepEqual(
      (({ page, limit, skip }) => ({ page, limit, skip }))(parseQueueQuery({ page: '3', limit: '25' }, AGENT_ID)),
      { page: 3, limit: 25, skip: 50 },
    );
  });

  it(`accepts limit 1 and ${QUEUE_MAX_LIMIT}`, () => {
    assert.equal(parseQueueQuery({ limit: '1' }, AGENT_ID).limit, 1);
    assert.equal(parseQueueQuery({ limit: String(QUEUE_MAX_LIMIT) }, AGENT_ID).limit, QUEUE_MAX_LIMIT);
  });

  it(`rejects a limit above ${QUEUE_MAX_LIMIT}`, () => {
    assertRejected({ limit: String(QUEUE_MAX_LIMIT + 1) }, `limit must be at most ${QUEUE_MAX_LIMIT}`);
  });

  it('rejects zero, negative, decimal, padded and non-numeric values', () => {
    for (const value of ['0', '-1', '1.5', '01', '+2', '1e2', 'abc', '0x10']) {
      assertRejected({ page: value }, 'page must be a whole number of at least 1');
      assertRejected({ limit: value }, 'limit must be a whole number of at least 1');
    }
  });

  it('rejects page numbers beyond the safe integer range', () => {
    assertRejected({ page: '99999999999999999999' }, 'page must be a whole number of at least 1');
  });
});

describe('parseQueueQuery with the real Express query parser', () => {
  const app = express();
  app.get('/queue', (req, res) => res.json(parseQueueQuery(req.query, AGENT_ID).filter));
  app.use(errorHandler);

  it('returns 400 in the standard error format for a repeated parameter', async () => {
    const res = await request(app).get('/queue?status=open&status=resolved');

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: { code: 'VALIDATION_ERROR', message: 'status must be a single value' } });
  });

  it('does not turn bracket syntax into query operators', async () => {
    const res = await request(app).get('/queue?status[$ne]=resolved&assignee[$exists]=true');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {});
  });
});

describe('withAccessScope', () => {
  const scope = { $or: [{ assignedTo: null }, { assignedTo: AGENT_ID }] };

  it('keeps both $or clauses when the scope and the search both use $or', () => {
    const { filter } = parseQueueQuery({ q: 'password', status: 'open' }, AGENT_ID);
    const combined = withAccessScope(scope, filter);

    assert.deepEqual(combined, { $and: [scope, filter] });
    assert.deepEqual(combined.$and[0].$or, scope.$or);
    assert.equal(combined.$and[1].$or.length, 2);
  });

  it('returns the scope alone when there are no user filters', () => {
    assert.deepEqual(withAccessScope(scope, {}), scope);
    assert.deepEqual(withAccessScope(scope, undefined), scope);
  });

  it('accepts an empty scope (e.g. admin) and returns the filter alone', () => {
    assert.deepEqual(withAccessScope({}, { status: 'open' }), { status: 'open' });
    assert.deepEqual(withAccessScope({}, {}), {});
  });

  it('refuses to run without a scope, so the access rule cannot be forgotten', () => {
    for (const missing of [undefined, null, 'agent']) {
      assert.throws(() => withAccessScope(missing, { status: 'open' }), /requires an access-scope filter/);
    }
  });

  it('does not modify its inputs', () => {
    const filter = { status: 'open' };
    const scopeCopy = structuredClone(scope);
    withAccessScope(scope, filter);
    assert.deepEqual(scope, scopeCopy);
    assert.deepEqual(filter, { status: 'open' });
  });
});

describe('escapeRegex', () => {
  it('leaves ordinary text unchanged', () => {
    assert.equal(escapeRegex('Unable to reset password'), 'Unable to reset password');
  });

  it('escapes every regex metacharacter', () => {
    assert.equal(escapeRegex('.*+?^${}()|[]\\'), '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });
});
