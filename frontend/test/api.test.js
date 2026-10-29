import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, queryString, requestTokenOf } from '../src/api/client.js';
import * as session from '../src/auth/session.js';
import * as tickets from '../src/api/tickets.js';
import * as admin from '../src/api/admin.js';

// The API modules with a fake fetch: request method, URL, headers and body, and how
// responses and errors are unwrapped. No server is needed.

let calls;
let respond;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  respond = () => ({ status: 200, body: {} });
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const { status, body, throws } = respond(url, init);
    if (throws) throw new TypeError('Failed to fetch');
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const BASE = 'http://localhost:4000';

describe('apiRequest', () => {
  it('sends JSON with the bearer token and returns the parsed body', async () => {
    respond = () => ({ status: 201, body: { ticket: { id: 't1' } } });
    const result = await apiRequest('/api/x', { method: 'POST', token: 'tok', body: { a: 1 } });

    assert.deepEqual(result, { ticket: { id: 't1' } });
    assert.equal(calls[0].url, `${BASE}/api/x`);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers.Authorization, 'Bearer tok');
    assert.equal(calls[0].headers['Content-Type'], 'application/json');
    assert.deepEqual(calls[0].body, { a: 1 });
  });

  it('omits the auth header and body when not given', async () => {
    await apiRequest('/api/health');
    assert.deepEqual(calls[0].headers, {});
    assert.equal(calls[0].body, undefined);
  });

  it('turns the error envelope into an Error with status, code and message', async () => {
    respond = () => ({ status: 409, body: { error: { code: 'CATEGORY_EXISTS', message: 'Duplicate' } } });
    await assert.rejects(apiRequest('/api/x'), (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'CATEGORY_EXISTS');
      assert.equal(error.message, 'Duplicate');
      return true;
    });
  });

  it('reports an unreachable server as NETWORK_ERROR', async () => {
    respond = () => ({ throws: true });
    await assert.rejects(apiRequest('/api/x'), (error) => error.code === 'NETWORK_ERROR');
  });

  it('copes with a non-JSON error body', async () => {
    respond = () => ({ status: 502, body: null });
    await assert.rejects(apiRequest('/api/x'), (error) => error.status === 502 && /502/.test(error.message));
  });
});

// Regression: a late 401 for a token replaced by a password change (or ended by sign-out)
// used to end the newer session too, e.g. a notification poll that was still in flight.
describe('requests that overlap a session change', () => {
  let store;
  let pending;
  beforeEach(() => {
    store = new Map();
    globalThis.window = {
      sessionStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
    };
    pending = [];
    globalThis.fetch = (url, init) => new Promise((resolve) => pending.push(resolve));
  });
  afterEach(() => {
    delete globalThis.window;
  });

  const reject = (status, code) => (resolve) =>
    resolve({ ok: false, status, json: async () => ({ error: { code, message: 'Your session has ended. Please sign in again.' } }) });
  const send = (path) => apiRequest(path, { token: session.readToken() }).catch((error) => error);
  const outcome = (error) => session.sessionRejection(error, requestTokenOf(error));

  it('a 401 ends only the session that sent the request', async () => {
    session.storeToken('old-token');
    const fromOld = [send('/api/notifications/unread-count'), send('/api/notifications')];
    session.storeToken('new-token'); // password change: the backend now rejects old-token
    const fromNew = send('/api/notifications/unread-count');
    pending.forEach(reject(401, 'UNAUTHORIZED'));
    const [old1, old2, current] = await Promise.all([...fromOld, fromNew]);

    assert.equal(outcome(old1), 'stale');
    assert.equal(outcome(old2), 'stale');
    assert.equal(outcome(current), 'end', 'a genuine 401 for the current token still ends it');
  });

  it('after sign-out, a late 401 is stale; deactivation of the current session still ends it', async () => {
    session.storeToken('tok');
    const late = send('/api/notifications/unread-count');
    const disabled = send('/api/tickets');
    reject(401, 'UNAUTHORIZED')(pending[0]);
    reject(403, 'ACCOUNT_DISABLED')(pending[1]);
    const [lateError, disabledError] = await Promise.all([late, disabled]);

    assert.equal(outcome(disabledError), 'end');
    session.clearToken();
    assert.equal(outcome(lateError), 'stale', 'nothing to end, and no "expired" notice after a sign-out');
  });

  it('other errors are left to the page, and the token never appears on the error', async () => {
    session.storeToken('secret-token-value');
    const failed = send('/api/admin/users');
    reject(500, 'INTERNAL')(pending[0]);
    const error = await failed;

    assert.equal(outcome(error), null);
    assert.equal(requestTokenOf(error), 'secret-token-value');
    assert.ok(!JSON.stringify({ ...error, message: error.message }).includes('secret-token-value'));
    assert.equal(requestTokenOf(new Error('not from the API')), undefined);
    assert.equal(session.sessionRejection({ status: 401 }, undefined, 'tok'), 'end', 'tokenless requests are never stale');
  });
});

describe('queryString', () => {
  it('skips empty values and "all", and encodes the rest', () => {
    assert.equal(queryString({ status: 'all', q: '', page: 2, assignee: undefined, x: null, search: 'a b&c' }), '?page=2&search=a+b%26c');
    assert.equal(queryString({}), '');
  });
});

describe('ticket API', () => {
  it('createTicket posts the contract body and returns the ticket', async () => {
    respond = () => ({ status: 201, body: { ticket: { id: 't1' } } });
    const ticket = await tickets.createTicket('tok', { subject: 's', description: 'd', categoryId: 'c1', priority: 'low' });
    assert.deepEqual(ticket, { id: 't1' });
    assert.deepEqual(calls[0].body, { subject: 's', description: 'd', categoryId: 'c1', priority: 'low' });
    assert.equal(calls[0].url, `${BASE}/api/tickets`);
  });

  it('listMyTickets and listQueue pass filters and pagination as query parameters', async () => {
    respond = () => ({ status: 200, body: { tickets: [], page: 2, limit: 10, total: 0 } });
    await tickets.listMyTickets('tok', { status: 'resolved', page: 2, limit: 10 });
    await tickets.listQueue('tok', { status: 'all', assignee: 'me', q: 'HD-1', priority: 'high' });
    assert.equal(calls[0].url, `${BASE}/api/tickets/my?status=resolved&page=2&limit=10`);
    assert.equal(calls[1].url, `${BASE}/api/tickets?assignee=me&q=HD-1&priority=high`);
  });

  it('assign, status and comment calls use the documented methods and bodies', async () => {
    respond = (url) => ({ status: 200, body: url.endsWith('/comments') ? { comment: { id: 'c' } } : { ticket: { id: 't' } } });
    await tickets.assignTicket('tok', 'abc', { assignedTo: null });
    await tickets.updateTicketStatus('tok', 'abc', 'in_progress');
    await tickets.addComment('tok', 'abc', 'hello');
    assert.deepEqual(calls.map((c) => [c.method, c.url.replace(BASE, ''), c.body]), [
      ['PATCH', '/api/tickets/abc/assign', { assignedTo: null }],
      ['PATCH', '/api/tickets/abc/status', { status: 'in_progress' }],
      ['POST', '/api/tickets/abc/comments', { message: 'hello' }],
    ]);
  });

  it('nextStatus only allows one step forward', () => {
    assert.equal(tickets.nextStatus('open'), 'in_progress');
    assert.equal(tickets.nextStatus('in_progress'), 'resolved');
    assert.equal(tickets.nextStatus('resolved'), null);
    assert.equal(tickets.nextStatus('bogus'), null);
  });

  it('ticketErrorMessage maps statuses to safe messages', () => {
    assert.equal(tickets.ticketErrorMessage({ status: 404 }), 'This ticket could not be found.');
    assert.equal(tickets.ticketErrorMessage({ status: 403 }), 'You do not have access to this ticket.');
    assert.match(tickets.ticketErrorMessage({ status: 409 }), /changed by someone else/);
    assert.equal(tickets.ticketErrorMessage({ status: 400, message: 'subject is required' }), 'subject is required');
    assert.match(tickets.ticketErrorMessage({ status: 500, message: 'stack trace' }), /server had a problem/);
  });
});

describe('admin API', () => {
  it('getStats sends `from` as an ISO date', async () => {
    await admin.getStats('tok', { from: new Date('2026-10-01T00:00:00Z') });
    assert.equal(calls[0].url, `${BASE}/api/admin/stats?from=2026-10-01T00%3A00%3A00.000Z`);
  });

  it('user and category mutations hit the contract routes', async () => {
    respond = (url) => ({ status: 200, body: url.includes('/users/') ? { user: { id: 'u' } } : { category: { id: 'c' } } });
    await admin.updateUserRole('tok', 'u1', 'agent');
    await admin.updateUserStatus('tok', 'u1', false);
    await admin.createCategory('tok', { name: 'Billing', description: '' });
    await admin.updateCategory('tok', 'c1', { isActive: false });
    assert.deepEqual(calls.map((c) => [c.method, c.url.replace(BASE, ''), c.body]), [
      ['PATCH', '/api/admin/users/u1/role', { role: 'agent' }],
      ['PATCH', '/api/admin/users/u1/status', { isActive: false }],
      ['POST', '/api/admin/categories', { name: 'Billing', description: '' }],
      ['PATCH', '/api/admin/categories/c1', { isActive: false }],
    ]);
  });

  it('listAssignableStaff merges active agents and admins, sorted by name', async () => {
    respond = (url) => ({
      status: 200,
      body: { users: url.includes('role=agent') ? [{ id: '2', name: 'Zed' }] : [{ id: '1', name: 'Ada' }] },
    });
    const staff = await admin.listAssignableStaff('tok');
    assert.deepEqual(staff.map((s) => s.name), ['Ada', 'Zed']);
    assert.ok(calls.every((c) => c.url.includes('isActive=true')));
  });

  it('adminErrorMessage shows backend messages for known codes only', () => {
    assert.equal(admin.adminErrorMessage({ code: 'CATEGORY_EXISTS', message: 'A category with this name already exists' }), 'A category with this name already exists');
    assert.equal(admin.adminErrorMessage({ code: 'CANNOT_MODIFY_SELF', message: 'You cannot change your own role' }), 'You cannot change your own role');
    assert.equal(admin.adminErrorMessage({ code: 'LAST_ACTIVE_ADMIN', message: 'At least one active admin must remain. Try again.' }), 'At least one active admin must remain. Try again.');
    assert.equal(admin.adminErrorMessage({ code: 'FORBIDDEN', message: 'internal detail' }), 'You do not have permission to do this.');
    assert.match(admin.adminErrorMessage({ status: 500, message: 'x' }), /server had a problem/);
  });
});
