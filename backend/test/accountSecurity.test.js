import { describe, it, before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { AuthToken } from '../src/models/AuthToken.js';
import { clearSentEmails, sentEmails, simulateEmailFailure } from '../src/services/email.js';
import { hashToken } from '../src/utils/oneTimeToken.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createCategory, createTicket } from './helpers/factories.js';

// Account security (contract §6a): password change, email change, forgot/reset password.
// Emails go to the in-memory transport (EMAIL_TRANSPORT=memory in tests).

const PASSWORD = 'correct-horse-1';
let connected = false;
let cara;
let dev;
let logged;
const realConsole = { log: console.log, error: console.error, warn: console.warn };

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  // Everything written to the console during a test is captured and checked for secrets.
  logged = [];
  for (const level of ['log', 'error', 'warn']) console[level] = (...args) => logged.push(args.join(' '));
  if (!connected) return;
  await resetTestDB();
  clearSentEmails();
  simulateEmailFailure(false);
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  cara = await User.create({ name: 'Cara Customer', email: 'cara@example.test', role: 'customer', passwordHash });
  dev = await User.create({ name: 'Dev Customer', email: 'dev@example.test', role: 'customer', passwordHash });
});

afterEach(() => {
  Object.assign(console, realConsole);
  simulateEmailFailure(false);
});

after(async () => {
  if (connected) await clearTestDB();
  await disconnectTestDB();
});

function requireDB(testContext) {
  if (!connected) testContext.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

const loginAs = async (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });
const tokenFor = async (email, password = PASSWORD) => (await loginAs(email, password)).body.token;
const as = (token, method, path) => request(app)[method](path).set('Authorization', `Bearer ${token}`);
const assertError = (res, status, code) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  if (code) assert.equal(res.body.error?.code, code, JSON.stringify(res.body));
};
const linkToken = (email) => {
  const match = /token=([A-Za-z0-9_-]{43})/.exec(email.text);
  assert.ok(match, `no link in: ${email.subject}`);
  return match[1];
};
const mailTo = (address) => sentEmails().filter((mail) => mail.to === address);
async function waitForMail(address, count = 1) {
  for (let i = 0; i < 50; i += 1) {
    if (mailTo(address).length >= count) return mailTo(address);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return mailTo(address);
}
// No one-time token may appear in an API response body or any console output.
function assertNoTokenLeak(token, ...responses) {
  for (const res of responses) assert.ok(!JSON.stringify(res.body).includes(token), 'token in response');
  assert.ok(!logged.some((line) => line.includes(token)), 'token in logs');
}

describe('POST /api/auth/me/password', () => {
  it('changes the password, signs out other sessions and keeps this one with a new token', async (t) => {
    if (!requireDB(t)) return;
    const sessionA = await tokenFor('cara@example.test');
    const sessionB = await tokenFor('cara@example.test');

    const res = await as(sessionA, 'post', '/api/auth/me/password').send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass-2', userId: String(dev._id) });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'cara@example.test');
    assert.ok(!JSON.stringify(res.body).includes('passwordHash'));

    assertError(await as(sessionA, 'get', '/api/auth/me'), 401, 'UNAUTHORIZED');
    assertError(await as(sessionB, 'get', '/api/auth/me'), 401, 'UNAUTHORIZED');
    assert.equal((await as(res.body.token, 'get', '/api/auth/me')).status, 200);

    assertError(await loginAs('cara@example.test'), 401, 'INVALID_CREDENTIALS');
    assert.equal((await loginAs('cara@example.test', 'brand-new-pass-2')).status, 200);
    // The body's userId was ignored: the other customer's password is unchanged.
    assert.equal((await loginAs('dev@example.test')).status, 200);
    assert.equal((await waitForMail('cara@example.test'))[0].subject, 'Your Help Desk password was changed');
  });

  it('rejects a wrong current password with 400 INVALID_CURRENT_PASSWORD and keeps the session', async (t) => {
    if (!requireDB(t)) return;
    const token = await tokenFor('cara@example.test');
    assertError(await as(token, 'post', '/api/auth/me/password').send({ currentPassword: 'wrong-pass-1', newPassword: 'brand-new-pass-2' }), 400, 'INVALID_CURRENT_PASSWORD');
    assert.equal((await as(token, 'get', '/api/auth/me')).status, 200);
    assert.equal((await loginAs('cara@example.test')).status, 200);
  });

  it('enforces the password policy (length, 72 bytes, different from current) and requires sign-in', async (t) => {
    if (!requireDB(t)) return;
    const token = await tokenFor('cara@example.test');
    for (const newPassword of ['short', '€'.repeat(25), PASSWORD, undefined, 12345678]) {
      assertError(await as(token, 'post', '/api/auth/me/password').send({ currentPassword: PASSWORD, newPassword }), 400, 'VALIDATION_ERROR');
    }
    assertError(await request(app).post('/api/auth/me/password').send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass-2' }), 401, 'UNAUTHORIZED');
    assert.equal((await loginAs('cara@example.test')).status, 200);
  });
});

describe('Email change', () => {
  it('only changes the email after the link sent to the new address is opened; tickets stay', async (t) => {
    if (!requireDB(t)) return;
    const token = await tokenFor('cara@example.test');
    const ticket = await createTicket({ createdBy: cara, category: await createCategory() });

    const res = await as(token, 'post', '/api/auth/me/email').send({ newEmail: 'Cara.New@Example.test', currentPassword: PASSWORD });
    assert.equal(res.status, 202);
    assert.equal(res.body.pendingEmail, 'cara.new@example.test');
    assert.equal((await User.findById(cara._id)).email, 'cara@example.test', 'not changed yet');
    assert.deepEqual((await as(token, 'get', '/api/auth/me/email')).body.pendingEmail, 'cara.new@example.test');

    const [verification] = await waitForMail('cara.new@example.test');
    assert.match(verification.text, /http:\/\/localhost:5173\/verify-email\?token=/);
    assert.equal((await waitForMail('cara@example.test'))[0].subject, 'Your Help Desk email address is being changed');
    const link = linkToken(verification);
    assert.equal(await AuthToken.countDocuments({ tokenHash: link }), 0, 'stored hashed, not plain');
    assert.equal(await AuthToken.countDocuments({ tokenHash: hashToken(link) }), 1);

    const verified = await request(app).post('/api/auth/verify-email').send({ token: link });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.email, 'cara.new@example.test');
    assertNoTokenLeak(link, res, verified);

    assert.equal((await loginAs('cara.new@example.test')).status, 200);
    assertError(await loginAs('cara@example.test'), 401, 'INVALID_CREDENTIALS');
    const mine = await as(token, 'get', '/api/tickets/my');
    assert.deepEqual(mine.body.tickets.map((x) => x.id), [String(ticket._id)], 'ticket history kept');
    assert.equal((await as(token, 'get', '/api/auth/me/email')).body.pendingEmail, null);

    assertError(await request(app).post('/api/auth/verify-email').send({ token: link }), 400, 'INVALID_OR_EXPIRED_TOKEN');
  });

  it('validates the new address, the current password and duplicates', async (t) => {
    if (!requireDB(t)) return;
    const token = await tokenFor('cara@example.test');
    const send = (body) => as(token, 'post', '/api/auth/me/email').send(body);
    assertError(await send({ newEmail: 'not-an-email', currentPassword: PASSWORD }), 400, 'VALIDATION_ERROR');
    assertError(await send({ newEmail: 'CARA@example.test', currentPassword: PASSWORD }), 400, 'VALIDATION_ERROR');
    assertError(await send({ newEmail: 'dev@example.test', currentPassword: PASSWORD }), 409, 'EMAIL_TAKEN');
    assertError(await send({ newEmail: 'new@example.test', currentPassword: 'wrong-pass-1' }), 400, 'INVALID_CURRENT_PASSWORD');
    assertError(await send({ newEmail: 'new@example.test' }), 400, 'VALIDATION_ERROR');
    assertError(await request(app).post('/api/auth/me/email').send({ newEmail: 'new@example.test', currentPassword: PASSWORD }), 401, 'UNAUTHORIZED');
    assert.equal(sentEmails().length, 0);
  });

  it('a new request replaces the old link; cancelling removes it', async (t) => {
    if (!requireDB(t)) return;
    const token = await tokenFor('cara@example.test');
    await as(token, 'post', '/api/auth/me/email').send({ newEmail: 'first@example.test', currentPassword: PASSWORD });
    await as(token, 'post', '/api/auth/me/email').send({ newEmail: 'second@example.test', currentPassword: PASSWORD });
    const first = linkToken((await waitForMail('first@example.test'))[0]);
    const second = linkToken((await waitForMail('second@example.test'))[0]);

    assertError(await request(app).post('/api/auth/verify-email').send({ token: first }), 400, 'INVALID_OR_EXPIRED_TOKEN');
    await as(token, 'delete', '/api/auth/me/email');
    assertError(await request(app).post('/api/auth/verify-email').send({ token: second }), 400, 'INVALID_OR_EXPIRED_TOKEN');
    assert.equal((await User.findById(cara._id)).email, 'cara@example.test');
  });

  it('expired links and addresses taken in the meantime are refused', async (t) => {
    if (!requireDB(t)) return;
    const token = await tokenFor('cara@example.test');
    await as(token, 'post', '/api/auth/me/email').send({ newEmail: 'later@example.test', currentPassword: PASSWORD });
    const link = linkToken((await waitForMail('later@example.test'))[0]);

    await User.create({ name: 'Late Comer', email: 'later@example.test', role: 'customer', passwordHash: 'x'.repeat(20) });
    assertError(await request(app).post('/api/auth/verify-email').send({ token: link }), 409, 'EMAIL_TAKEN');
    assert.equal((await User.findById(cara._id)).email, 'cara@example.test');

    await as(token, 'post', '/api/auth/me/email').send({ newEmail: 'expired@example.test', currentPassword: PASSWORD });
    const expired = linkToken((await waitForMail('expired@example.test'))[0]);
    await AuthToken.updateMany({ purpose: 'email_change' }, { expiresAt: new Date(Date.now() - 1000) });
    assertError(await request(app).post('/api/auth/verify-email').send({ token: expired }), 400, 'INVALID_OR_EXPIRED_TOKEN');
  });

  it('a failed confirmation email gives 503 and leaves nothing pending', async (t) => {
    if (!requireDB(t)) return;
    const token = await tokenFor('cara@example.test');
    simulateEmailFailure(true);
    assertError(await as(token, 'post', '/api/auth/me/email').send({ newEmail: 'nomail@example.test', currentPassword: PASSWORD }), 503, 'EMAIL_DELIVERY_FAILED');
    simulateEmailFailure(false);
    assert.equal((await as(token, 'get', '/api/auth/me/email')).body.pendingEmail, null);
    assert.equal(await AuthToken.countDocuments({ purpose: 'email_change' }), 0);
  });
});

describe('Forgot and reset password', () => {
  const forgot = (email) => request(app).post('/api/auth/forgot-password').send({ email });

  it('gives the same response for registered, unknown and deactivated emails; only real accounts get mail', async (t) => {
    if (!requireDB(t)) return;
    await User.updateOne({ _id: dev._id }, { isActive: false });
    const known = await forgot('cara@example.test');
    const unknown = await forgot('nobody@example.test');
    const inactive = await forgot('dev@example.test');

    for (const res of [known, unknown, inactive]) assert.equal(res.status, 200);
    assert.deepEqual(unknown.body, known.body);
    assert.deepEqual(inactive.body, known.body);
    await waitForMail('cara@example.test');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(sentEmails().map((mail) => mail.to), ['cara@example.test']);
    assertError(await forgot('not-an-email'), 400, 'VALIDATION_ERROR');
  });

  it('resets with a valid link: old password and sessions stop working, the link works once', async (t) => {
    if (!requireDB(t)) return;
    const session = await tokenFor('cara@example.test');
    const requested = await forgot('cara@example.test');
    const [mail] = await waitForMail('cara@example.test');
    assert.match(mail.text, /http:\/\/localhost:5173\/reset-password\?token=/);
    const link = linkToken(mail);

    const check = await request(app).post('/api/auth/reset-password/check').send({ token: link });
    assert.equal(check.status, 200);
    assert.equal(check.body.valid, true);

    const tooShort = await request(app).post('/api/auth/reset-password').send({ token: link, newPassword: 'short' });
    assertError(tooShort, 400, 'VALIDATION_ERROR');

    const reset = await request(app).post('/api/auth/reset-password').send({ token: link, newPassword: 'reset-pass-123' });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.token, undefined, 'not signed in automatically');
    assertNoTokenLeak(link, requested, check, tooShort, reset);

    assertError(await loginAs('cara@example.test'), 401, 'INVALID_CREDENTIALS');
    assert.equal((await loginAs('cara@example.test', 'reset-pass-123')).status, 200);
    assertError(await as(session, 'get', '/api/auth/me'), 401, 'UNAUTHORIZED');
    assertError(await request(app).post('/api/auth/reset-password').send({ token: link, newPassword: 'another-pass-1' }), 400, 'INVALID_OR_EXPIRED_TOKEN');
  });

  it('refuses invalid, expired and superseded links', async (t) => {
    if (!requireDB(t)) return;
    for (const token of ['', 'abc', 'x'.repeat(43), { $ne: null }, undefined]) {
      assertError(await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'reset-pass-123' }), 400, 'INVALID_OR_EXPIRED_TOKEN');
    }
    await forgot('cara@example.test');
    const link = linkToken((await waitForMail('cara@example.test'))[0]);
    await AuthToken.updateMany({ purpose: 'password_reset' }, { expiresAt: new Date(Date.now() - 1000) });
    assertError(await request(app).post('/api/auth/reset-password/check').send({ token: link }), 400, 'INVALID_OR_EXPIRED_TOKEN');
    assertError(await request(app).post('/api/auth/reset-password').send({ token: link, newPassword: 'reset-pass-123' }), 400, 'INVALID_OR_EXPIRED_TOKEN');
    assert.equal((await loginAs('cara@example.test')).status, 200);
  });

  it('repeated requests within a minute send only one email; a password change voids open reset links', async (t) => {
    if (!requireDB(t)) return;
    await forgot('cara@example.test');
    await waitForMail('cara@example.test');
    await forgot('cara@example.test');
    await forgot('cara@example.test');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(mailTo('cara@example.test').length, 1);
    const link = linkToken(mailTo('cara@example.test')[0]);

    const session = await tokenFor('cara@example.test');
    await as(session, 'post', '/api/auth/me/password').send({ currentPassword: PASSWORD, newPassword: 'changed-pass-9' });
    assertError(await request(app).post('/api/auth/reset-password').send({ token: link, newPassword: 'reset-pass-123' }), 400, 'INVALID_OR_EXPIRED_TOKEN');
  });

  it('an email delivery failure still gives the generic response and is logged without the link', async (t) => {
    if (!requireDB(t)) return;
    simulateEmailFailure(true);
    const res = await forgot('cara@example.test');
    assert.equal(res.status, 200);
    for (let i = 0; i < 50 && !logged.some((line) => line.includes('password reset')); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(logged.some((line) => line.includes('Email (password reset) could not be sent')), logged.join('\n'));
    assert.ok(!logged.some((line) => /token=|cara@example\.test/.test(line)), 'no link or address in logs');
  });
});

// A password change must evict anyone relying on an old email-change link, and an email change
// must end reset links that went to the old address.
describe('Links after a password or email change', () => {
  const NEW_PASSWORD = 'after-change-pass-7';
  const reset = (token, newPassword = NEW_PASSWORD) => request(app).post('/api/auth/reset-password').send({ token, newPassword });
  const verify = (token) => request(app).post('/api/auth/verify-email').send({ token });

  async function requestEmailChange(address, newEmail) {
    const session = await tokenFor(address);
    const res = await as(session, 'post', '/api/auth/me/email').send({ newEmail, currentPassword: PASSWORD });
    assert.equal(res.status, 202, JSON.stringify(res.body));
    return linkToken((await waitForMail(newEmail))[0]);
  }

  // The link in the newest reset email to this address. Other emails (notices) may arrive too.
  async function requestResetLink(address) {
    const isReset = (mail) => mail.text.includes('/reset-password?token=');
    const res = await request(app).post('/api/auth/forgot-password').send({ email: address });
    assert.equal(res.status, 200);
    for (let i = 0; i < 50 && !mailTo(address).some(isReset); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return linkToken(mailTo(address).filter(isReset).at(-1));
  }

  it('a password reset voids a pending email change; another user\'s link keeps working', async (t) => {
    if (!requireDB(t)) return;
    const caraLink = await requestEmailChange('cara@example.test', 'cara.pending@example.test');
    const devLink = await requestEmailChange('dev@example.test', 'dev.pending@example.test');

    assert.equal((await reset(await requestResetLink('cara@example.test'))).status, 200);

    assertError(await verify(caraLink), 400, 'INVALID_OR_EXPIRED_TOKEN');
    assert.equal((await User.findById(cara._id)).email, 'cara@example.test');
    assert.equal(await AuthToken.countDocuments({ user: cara._id, purpose: 'email_change' }), 0);

    assert.equal((await verify(devLink)).status, 200, 'the other user is unaffected');
    assert.equal((await User.findById(dev._id)).email, 'dev.pending@example.test');
  });

  it('a signed-in password change voids a pending email change too', async (t) => {
    if (!requireDB(t)) return;
    const link = await requestEmailChange('cara@example.test', 'cara.pending@example.test');
    const session = await tokenFor('cara@example.test');

    const res = await as(session, 'post', '/api/auth/me/password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    assert.equal(res.status, 200);

    assertError(await verify(link), 400, 'INVALID_OR_EXPIRED_TOKEN');
    assert.equal((await User.findById(cara._id)).email, 'cara@example.test');
    assert.equal((await as(res.body.token, 'get', '/api/auth/me/email')).body.pendingEmail, null);
  });

  it('if the links cannot be voided, the password stays as it was', async (t) => {
    if (!requireDB(t)) return;
    const link = await requestResetLink('cara@example.test');
    t.mock.method(AuthToken, 'deleteMany', async () => { throw new Error('write failed'); });

    assertError(await reset(link), 500, 'INTERNAL_ERROR');

    t.mock.restoreAll();
    assert.equal((await loginAs('cara@example.test')).status, 200, 'the old password still works');
    assert.equal((await loginAs('cara@example.test', NEW_PASSWORD)).status, 401);
  });

  it('a confirmed email change voids reset links; another user\'s link keeps working', async (t) => {
    if (!requireDB(t)) return;
    const oldLink = await requestResetLink('cara@example.test');
    const devLink = await requestResetLink('dev@example.test');
    const changeLink = await requestEmailChange('cara@example.test', 'cara.moved@example.test');

    assert.equal((await verify(changeLink)).status, 200);

    assertError(await reset(oldLink), 400, 'INVALID_OR_EXPIRED_TOKEN');
    assert.equal((await loginAs('cara.moved@example.test')).status, 200, 'the password did not change');

    assert.equal((await reset(devLink)).status, 200, 'the other user is unaffected');
    assert.equal((await loginAs('dev@example.test', NEW_PASSWORD)).status, 200);

    const newLink = await requestResetLink('cara.moved@example.test');
    assert.equal((await reset(newLink)).status, 200, 'a new link to the new address works');
  });

  it('a refused email change keeps the old email and the reset link', async (t) => {
    if (!requireDB(t)) return;
    const resetLink = await requestResetLink('cara@example.test');
    const changeLink = await requestEmailChange('cara@example.test', 'taken@example.test');
    await User.create({ name: 'Late Comer', email: 'taken@example.test', role: 'customer', passwordHash: 'x'.repeat(20) });

    assertError(await verify(changeLink), 409, 'EMAIL_TAKEN');

    assert.equal((await User.findById(cara._id)).email, 'cara@example.test');
    assert.equal((await reset(resetLink)).status, 200, 'the reset link still works');
  });

  it('if the reset links cannot be voided, the email change is undone', async (t) => {
    if (!requireDB(t)) return;
    const resetLink = await requestResetLink('cara@example.test');
    const changeLink = await requestEmailChange('cara@example.test', 'cara.moved@example.test');
    t.mock.method(AuthToken, 'deleteMany', async () => { throw new Error('write failed'); });

    assertError(await verify(changeLink), 500, 'INTERNAL_ERROR');

    t.mock.restoreAll();
    assert.equal((await User.findById(cara._id)).email, 'cara@example.test');
    assert.equal((await reset(resetLink)).status, 200, 'the account is as it was, so its reset link still works');
  });
});
