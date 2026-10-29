import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage, returnPath, validateComment, validateLogin, validateSignup, validateTicket } from '../src/pages/customer/validation.js';
import * as session from '../src/auth/session.js';
import { capitalize, formatIsoDate, formatShortTime, initialsOf, pageCount } from '../src/components/staff/staffFormat.js';
import { buildTicketCsv, escapeCsvCell, periodStart } from '../src/components/staff/reportCsv.js';

// Pure frontend logic: form validation, session storage, display helpers and the CSV export.

describe('form validation', () => {
  it('login needs a valid email and a password', () => {
    assert.deepEqual(validateLogin({ email: 'a@b.co', password: 'x' }), {});
    assert.deepEqual(Object.keys(validateLogin({ email: 'nope', password: ' ' })).sort(), ['email', 'password']);
  });

  it('signup mirrors the backend rules, including the 72-byte password limit', () => {
    const ok = { name: 'Asha', email: 'a@b.co', password: 'long-enough', confirmPassword: 'long-enough' };
    assert.deepEqual(validateSignup(ok), {});
    assert.ok(validateSignup({ ...ok, name: 'A' }).name);
    assert.ok(validateSignup({ ...ok, password: 'short', confirmPassword: 'short' }).password);
    const multibyte = '€'.repeat(25); // 75 bytes
    assert.ok(validateSignup({ ...ok, password: multibyte, confirmPassword: multibyte }).password);
    assert.ok(validateSignup({ ...ok, confirmPassword: 'different' }).confirmPassword);
  });

  it('tickets need subject 5–120, description 10–5000, a category and a known priority', () => {
    const ok = { subject: 'Valid subject', description: 'Long enough text', categoryId: 'c1', priority: 'low' };
    assert.deepEqual(validateTicket(ok), {});
    assert.deepEqual(
      Object.keys(validateTicket({ subject: 'abc', description: 'short', categoryId: '', priority: 'urgent' })).sort(),
      ['categoryId', 'description', 'priority', 'subject'],
    );
  });

  it('comments are 1–2000 characters after trimming', () => {
    assert.ok(validateComment('   '));
    assert.equal(validateComment('x'.repeat(2000)), null);
    assert.ok(validateComment('x'.repeat(2001)));
  });

  it('auth errors map to safe messages', () => {
    assert.equal(authErrorMessage({ code: 'INVALID_CREDENTIALS' }), 'Invalid email or password.');
    assert.match(authErrorMessage({ code: 'EMAIL_TAKEN' }), /already exists/);
    const limited = { code: 'RATE_LIMITED', status: 429, message: 'Too many sign-in attempts. Please wait a few minutes and try again.' };
    assert.equal(authErrorMessage(limited), limited.message);
    assert.equal(authErrorMessage({ code: 'SOMETHING_NEW', status: 418, message: 'internal' }), 'Something went wrong. Please try again.');
  });

  it('returnPath only allows same-site paths', () => {
    assert.equal(returnPath({ from: '/tickets/abc' }, '/tickets'), '/tickets/abc');
    assert.equal(returnPath({ from: '//evil.example' }, '/tickets'), '/tickets');
    assert.equal(returnPath({ from: 'https://evil.example' }, '/tickets'), '/tickets');
    assert.equal(returnPath(undefined, '/tickets'), '/tickets');
  });
});

describe('session storage', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.window = {
      sessionStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
    };
  });

  it('stores, reads and clears only the token (and the legacy role key)', () => {
    assert.equal(session.storeToken('tok'), true);
    assert.equal(session.readToken(), 'tok');
    store.set('helpdesk_staff_role', 'admin');
    session.clearToken();
    assert.equal(store.size, 0);
  });

  it('reports blocked storage instead of pretending to sign in', () => {
    globalThis.window = { sessionStorage: { setItem() { throw new Error('QuotaExceeded'); }, getItem: () => null, removeItem() {} } };
    assert.equal(session.storeToken('tok'), false);
  });

  it('only 401 and 403 ACCOUNT_DISABLED end a session', () => {
    assert.match(session.sessionEndedNotice({ status: 401 }), /expired/);
    assert.match(session.sessionEndedNotice({ status: 403, code: 'ACCOUNT_DISABLED' }), /deactivated/);
    for (const error of [{ status: 403, code: 'FORBIDDEN' }, { status: 500 }, { code: 'NETWORK_ERROR' }, undefined]) {
      assert.equal(session.sessionEndedNotice(error), null);
    }
  });

  it('sends each role to its own area', () => {
    assert.equal(session.homePathFor('customer'), '/tickets');
    assert.equal(session.homePathFor('agent'), '/agent/dashboard');
    assert.equal(session.homePathFor('admin'), '/admin/dashboard');
    assert.equal(session.dashboardPathFor('customer'), null);
  });
});

describe('staff display helpers', () => {
  it('initials, capitalisation and ISO dates', () => {
    assert.equal(initialsOf('Asha Customer'), 'AC');
    assert.equal(initialsOf(''), '?');
    assert.equal(capitalize('medium'), 'Medium');
    assert.equal(formatIsoDate('2026-10-05T12:00:00'), '2026-10-05');
    assert.equal(formatIsoDate('not a date'), '');
  });

  it('page counts: at least one page, rounded up', () => {
    assert.equal(pageCount(0, 20), 1);
    assert.equal(pageCount(20, 20), 1);
    assert.equal(pageCount(21, 20), 2);
    assert.equal(pageCount(undefined, 20), 1);
  });

  it('short times: today shows a time, yesterday a word, older a date', () => {
    const now = new Date(2026, 9, 28, 15, 0);
    assert.match(formatShortTime(new Date(2026, 9, 28, 9, 30), now), /\d/);
    assert.equal(formatShortTime(new Date(2026, 9, 27, 23, 0), now), 'Yesterday');
    assert.match(formatShortTime(new Date(2026, 9, 2), now), /Oct/);
    assert.match(formatShortTime(new Date(2025, 0, 2), now), /2025/);
    assert.equal(formatShortTime(null, now), '—');
  });
});

describe('report CSV', () => {
  it('quotes cells, doubles quotes and neutralises spreadsheet formulas', () => {
    assert.equal(escapeCsvCell('plain'), '"plain"');
    assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
    assert.equal(escapeCsvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(escapeCsvCell(null), '""');
  });

  it('builds a header plus one row per ticket', () => {
    const csv = buildTicketCsv([
      {
        ticketNumber: 'HD-1', subject: 'Login fails', createdBy: { name: 'Asha' }, category: { name: 'Account' },
        priority: 'high', status: 'in_progress', assignedTo: null, createdAt: '2026-10-05T12:00:00',
      },
    ]);
    const lines = csv.split('\r\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^"Ticket ID","Subject"/);
    assert.equal(lines[1], '"HD-1","Login fails","Asha","Account","High","In Progress","Unassigned","2026-10-05"');
  });

  it('report periods', () => {
    const now = new Date('2026-10-28T00:00:00Z');
    assert.equal(periodStart('All Time', now), null);
    assert.equal(periodStart('Last 7 Days', now).toISOString(), '2026-10-21T00:00:00.000Z');
    assert.equal(periodStart('Last 30 Days', now).toISOString(), '2026-09-28T00:00:00.000Z');
  });
});
