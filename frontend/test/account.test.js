import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as account from '../src/api/account.js';
import * as notifications from '../src/api/notifications.js';
import { tokenFromSearch, validateEmailChange, validatePasswordChange, validateResetPassword } from '../src/components/account/accountValidation.js';

// Account-security and notification API calls (fake fetch) and the account form rules.

let calls;
let respond;
const realFetch = globalThis.fetch;
const BASE = 'http://localhost:4000';
const TOKEN = 'a'.repeat(43);

beforeEach(() => {
  calls = [];
  respond = () => ({ status: 200, body: {} });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: url.replace(BASE, ''), method: init.method, auth: init.headers.Authorization, body: init.body && JSON.parse(init.body) });
    const { status, body } = respond(url);
    return { ok: status < 300, status, json: async () => body };
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('account API', () => {
  it('sends reset and verification tokens in the body only, never in the URL', async () => {
    await account.checkResetToken(TOKEN);
    await account.resetPassword(TOKEN, 'new-password-1');
    await account.verifyEmailChange(TOKEN);
    assert.deepEqual(calls.map((c) => [c.method, c.url, c.body]), [
      ['POST', '/api/auth/reset-password/check', { token: TOKEN }],
      ['POST', '/api/auth/reset-password', { token: TOKEN, newPassword: 'new-password-1' }],
      ['POST', '/api/auth/verify-email', { token: TOKEN }],
    ]);
    assert.ok(calls.every((c) => !c.url.includes(TOKEN)));
    assert.ok(calls.every((c) => c.auth === undefined), 'public endpoints send no sign-in token');
  });

  it('signed-in calls use the bearer token and the documented routes', async () => {
    await account.changePassword('jwt', { currentPassword: 'old-pass-1', newPassword: 'new-pass-1' });
    await account.requestEmailChange('jwt', { newEmail: 'new@example.com', currentPassword: 'old-pass-1' });
    await account.getPendingEmailChange('jwt');
    await account.cancelEmailChange('jwt');
    await account.requestPasswordReset('me@example.com');
    assert.deepEqual(calls.map((c) => [c.method, c.url, c.auth]), [
      ['POST', '/api/auth/me/password', 'Bearer jwt'],
      ['POST', '/api/auth/me/email', 'Bearer jwt'],
      ['GET', '/api/auth/me/email', 'Bearer jwt'],
      ['DELETE', '/api/auth/me/email', 'Bearer jwt'],
      ['POST', '/api/auth/forgot-password', undefined],
    ]);
  });

  it('accountErrorMessage shows server messages only for known codes', () => {
    for (const code of ['INVALID_CURRENT_PASSWORD', 'EMAIL_TAKEN', 'INVALID_OR_EXPIRED_TOKEN', 'EMAIL_DELIVERY_FAILED', 'RATE_LIMITED']) {
      assert.equal(account.accountErrorMessage({ code, message: `msg ${code}` }), `msg ${code}`);
    }
    assert.equal(account.accountErrorMessage({ code: 'SOMETHING', message: 'internal' }), 'Something went wrong. Please try again.');
    assert.match(account.accountErrorMessage({ status: 503, message: 'x' }), /server had a problem/);
  });
});

describe('notifications API', () => {
  it('lists, counts and marks with the documented routes', async () => {
    respond = (url) => ({ status: 200, body: url.endsWith('/unread-count') ? { unreadCount: 3 } : {} });
    await notifications.listNotifications('jwt', { limit: 10, unread: 'true' });
    assert.equal(await notifications.getUnreadCount('jwt'), 3);
    await notifications.markNotificationRead('jwt', 'n1');
    await notifications.markAllNotificationsRead('jwt');
    assert.deepEqual(calls.map((c) => [c.method, c.url]), [
      ['GET', '/api/notifications?limit=10&unread=true'],
      ['GET', '/api/notifications/unread-count'],
      ['PATCH', '/api/notifications/n1/read'],
      ['POST', '/api/notifications/read-all'],
    ]);
  });

  it('links each role to where it can open the ticket; no link without a ticket', () => {
    const n = { ticket: { id: 't1', ticketNumber: 'HD-1' } };
    assert.equal(notifications.notificationLink(n, 'customer'), '/tickets/t1');
    assert.equal(notifications.notificationLink(n, 'agent'), '/agent/dashboard?ticket=t1');
    assert.equal(notifications.notificationLink(n, 'admin'), '/admin/dashboard?ticket=t1');
    assert.equal(notifications.notificationLink({ ticket: null }, 'customer'), null);
    assert.equal(notifications.notificationLink(n, 'stranger'), null);
  });
});

describe('account form rules', () => {
  it('password change: current required, policy, different, confirmation', () => {
    const ok = { currentPassword: 'old-pass-1', newPassword: 'new-pass-12', confirmPassword: 'new-pass-12' };
    assert.deepEqual(validatePasswordChange(ok), {});
    assert.ok(validatePasswordChange({ ...ok, currentPassword: '' }).currentPassword);
    assert.ok(validatePasswordChange({ ...ok, newPassword: 'short', confirmPassword: 'short' }).newPassword);
    assert.ok(validatePasswordChange({ ...ok, newPassword: '€'.repeat(25), confirmPassword: '€'.repeat(25) }).newPassword);
    assert.ok(validatePasswordChange({ ...ok, newPassword: 'old-pass-1', confirmPassword: 'old-pass-1' }).newPassword);
    assert.ok(validatePasswordChange({ ...ok, confirmPassword: 'other-pass-1' }).confirmPassword);
  });

  it('email change: format, not the current address, password required', () => {
    assert.deepEqual(validateEmailChange({ newEmail: 'new@example.com', currentPassword: 'x' }, 'me@example.com'), {});
    assert.ok(validateEmailChange({ newEmail: 'nope', currentPassword: 'x' }).newEmail);
    assert.ok(validateEmailChange({ newEmail: 'ME@example.com', currentPassword: 'x' }, 'me@example.com').newEmail);
    assert.ok(validateEmailChange({ newEmail: 'new@example.com', currentPassword: ' ' }).currentPassword);
  });

  it('reset form and link token parsing', () => {
    assert.deepEqual(validateResetPassword({ newPassword: 'new-pass-12', confirmPassword: 'new-pass-12' }), {});
    assert.ok(validateResetPassword({ newPassword: 'new-pass-12', confirmPassword: 'x' }).confirmPassword);
    assert.equal(tokenFromSearch(`?token=${TOKEN}`), TOKEN);
    assert.equal(tokenFromSearch('?token=short'), null);
    assert.equal(tokenFromSearch('?token=<script>alert(1)</script>'), null);
    assert.equal(tokenFromSearch(''), null);
  });
});
