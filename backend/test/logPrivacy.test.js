import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { redactUrl, requestLogger } from '../src/middleware/requestLog.js';
import {
  clearSentEmails,
  safeErrorDetails,
  sendEmailQuietly,
  sendInBackground,
  sentEmails,
  simulateEmailFailure,
} from '../src/services/email.js';
import { emailStatusChange } from '../src/utils/ticketEmails.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createCategory, createTicket, createUser } from './helpers/factories.js';

// Personal data and one-time links must stay out of the server logs: failed emails (an SMTP error's
// text commonly quotes the recipient) and request lines (a query string can hold an address).

const ADDRESS = 'private.person@example.test';
const PASSWORD = 'correct-horse-1';

// What Nodemailer produces when a server refuses a recipient: the reply is in the message.
function smtpRejection(address = ADDRESS) {
  const reply = `550 5.1.1 <${address}>: Recipient address rejected`;
  return Object.assign(new Error(`Can't send mail - all recipients were rejected: ${reply}`), {
    code: 'EENVELOPE',
    responseCode: 550,
    response: reply,
    rejected: [address],
  });
}

function captureConsole(t) {
  const lines = [];
  for (const level of ['log', 'error', 'warn']) {
    t.mock.method(console, level, (...args) => lines.push(args.join(' ')));
  }
  return lines;
}

const assertNothingPrivate = (text, ...addresses) => {
  for (const address of [ADDRESS, ...addresses]) assert.ok(!text.includes(address), `address in logs: ${text}`);
  assert.ok(!/token=|[A-Za-z0-9_-]{43}|550 5\.1\.1|rejected/.test(text), `link or server reply in logs: ${text}`);
};

describe('safeErrorDetails', () => {
  it('keeps the code and numeric reply code, and nothing else from the error', () => {
    assert.equal(safeErrorDetails(smtpRejection()), 'code=EENVELOPE responseCode=550');
    assert.equal(safeErrorDetails(Object.assign(new Error(ADDRESS), { code: 'ETIMEDOUT' })), 'code=ETIMEDOUT');
    assert.equal(safeErrorDetails(Object.assign(new Error(ADDRESS), { code: 11000 })), 'code=11000');
  });

  it('leaves out a code or reply code that is not in the expected form', () => {
    assert.equal(safeErrorDetails(new Error(ADDRESS)), 'code=unknown');
    assert.equal(safeErrorDetails(Object.assign(new Error('x'), { code: ADDRESS })), 'code=unknown');
    assert.equal(safeErrorDetails(Object.assign(new Error('x'), { code: 'EAUTH', responseCode: ADDRESS })), 'code=EAUTH');
    assert.equal(safeErrorDetails(undefined), 'code=unknown');
    assert.equal(safeErrorDetails(ADDRESS), 'code=unknown');
  });
});

describe('Failed emails in the logs', () => {
  let connected = false;

  before(async () => {
    connected = await connectTestDB();
  });

  beforeEach(async () => {
    simulateEmailFailure(false);
    clearSentEmails();
    if (connected) await resetTestDB();
  });

  after(async () => {
    simulateEmailFailure(false);
    if (connected) await clearTestDB();
    await disconnectTestDB();
  });

  function requireDB(testContext) {
    if (!connected) testContext.skip('MongoDB is not reachable at MONGODB_URI_TEST');
    return connected;
  }

  const createCustomer = async (email = ADDRESS) =>
    User.create({ name: 'Private Person', email, role: 'customer', passwordHash: await bcrypt.hash(PASSWORD, 4) });

  async function waitForLog(lines, text) {
    for (let i = 0; i < 100 && !lines.some((line) => line.includes(text)); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  it('sendEmailQuietly logs the purpose and codes only', async (t) => {
    const lines = captureConsole(t);
    simulateEmailFailure(smtpRejection());
    assert.equal(await sendEmailQuietly('test notice', { to: ADDRESS, subject: 'S', text: 'Link: token=abc' }), false);
    assert.equal(lines.join('\n'), 'Email (test notice) could not be sent: code=EENVELOPE responseCode=550');
  });

  it('sendInBackground logs the purpose and codes only', async (t) => {
    const lines = captureConsole(t);
    await sendInBackground('test task', async () => { throw smtpRejection(); });
    assert.equal(lines.join('\n'), 'Email (test task) could not be sent: code=EENVELOPE responseCode=550');
  });

  it('a rejected ticket status email', async (t) => {
    if (!requireDB(t)) return;
    const customer = await createCustomer();
    const agent = await createUser({ role: 'agent' });
    const ticket = await createTicket({ createdBy: customer, category: await createCategory(), assignedTo: agent, status: 'in_progress' });
    const lines = captureConsole(t);
    simulateEmailFailure(smtpRejection());
    await emailStatusChange(ticket, 'open', agent);
    assert.equal(lines.join('\n'), 'Email (ticket status) could not be sent: code=EENVELOPE responseCode=550');
  });

  it('a rejected password reset email', async (t) => {
    if (!requireDB(t)) return;
    await createCustomer();
    const lines = captureConsole(t);
    simulateEmailFailure(smtpRejection());
    assert.equal((await request(app).post('/api/auth/forgot-password').send({ email: ADDRESS })).status, 200);
    await waitForLog(lines, 'password reset');
    assert.equal(lines.join('\n'), 'Email (password reset) could not be sent: code=EENVELOPE responseCode=550');
    assert.equal(sentEmails().length, 0);
  });

  it('a forgot-password request that fails before sending', async (t) => {
    if (!requireDB(t)) return;
    const lines = captureConsole(t);
    t.mock.method(User, 'findOne', async () => { throw new Error(`lookup failed for ${ADDRESS}`); });
    assert.equal((await request(app).post('/api/auth/forgot-password').send({ email: ADDRESS })).status, 200);
    await waitForLog(lines, 'Password reset request failed');
    assert.equal(lines.join('\n'), 'Password reset request failed: code=unknown');
  });

  it('a rejected email-change confirmation and its notice', async (t) => {
    if (!requireDB(t)) return;
    await createCustomer();
    const login = await request(app).post('/api/auth/login').send({ email: ADDRESS, password: PASSWORD });
    const newAddress = 'private.new@example.test';
    const lines = captureConsole(t);
    simulateEmailFailure(smtpRejection(newAddress));
    const res = await request(app).post('/api/auth/me/email').set('Authorization', `Bearer ${login.body.token}`).send({ newEmail: newAddress, currentPassword: PASSWORD });
    assert.equal(res.status, 503);
    assert.equal(lines.join('\n'), 'Email (email change) could not be sent: code=EENVELOPE responseCode=550');
    assertNothingPrivate(lines.join('\n'), newAddress);
  });

  it('a rejected password-changed notice during a real reset; no token is logged', async (t) => {
    if (!requireDB(t)) return;
    await createCustomer();
    await request(app).post('/api/auth/forgot-password').send({ email: ADDRESS });
    for (let i = 0; i < 100 && sentEmails().length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    const token = /token=([A-Za-z0-9_-]{43})/.exec(sentEmails()[0].text)[1];

    const lines = captureConsole(t);
    simulateEmailFailure(smtpRejection());
    const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'new-password-22' });
    assert.equal(res.status, 200);
    assert.equal(lines.join('\n'), 'Email (password changed) could not be sent: code=EENVELOPE responseCode=550');
    assert.ok(!lines.join('\n').includes(token));
  });
});

describe('Request logs', () => {
  it('redactUrl cuts the query and keeps the path', () => {
    assert.equal(redactUrl('/api/admin/users'), '/api/admin/users');
    assert.equal(redactUrl(`/api/admin/users?q=${ADDRESS}&page=2`), '/api/admin/users?[redacted]');
    assert.equal(redactUrl('https://app.example.test/reset-password?token=abc'), 'https://app.example.test/reset-password?[redacted]');
    assert.equal(redactUrl('https://app.example.test/page#token=abc'), 'https://app.example.test/page?[redacted]');
  });

  for (const nodeEnv of ['development', 'production']) {
    it(`${nodeEnv} format: method, path, status and timing stay; the query and referrer query go`, async () => {
      const written = [];
      const small = express();
      small.use(requestLogger(nodeEnv, { stream: { write: (line) => written.push(line) } }));
      small.get('/api/admin/users', (req, res) => res.status(204).end());
      await request(small)
        .get(`/api/admin/users?q=${encodeURIComponent(ADDRESS)}&q2=${ADDRESS}`)
        .set('Referer', 'https://app.example.test/reset-password?token=one-time-secret');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const line = written.join('');
      assert.match(line, /GET/);
      assert.match(line, /\/api\/admin\/users\?\[redacted\]/);
      assert.match(line, /204/);
      if (nodeEnv === 'development') assert.match(line, /\d ms/);
      else assert.match(line, /https:\/\/app\.example\.test\/reset-password\?\[redacted\]/);
      for (const secret of [ADDRESS, encodeURIComponent(ADDRESS), 'one-time-secret']) assert.ok(!line.includes(secret), line);
    });
  }

  // The real app, whose request log is off in tests. No database is contacted: the request stops
  // at sign-in (401) and no email is involved.
  for (const nodeEnv of ['development', 'production']) {
    it(`the real app in ${nodeEnv} logs no query string (checked in a child process)`, () => {
      const script = [
        "const { default: request } = await import('supertest');",
        "const { default: app } = await import('./src/app.js');",
        `await request(app).get('/api/admin/users?q=${encodeURIComponent(ADDRESS)}').set('Referer', 'https://app.example.test/a?token=one-time-secret');`,
        'await new Promise((resolve) => setTimeout(resolve, 100));',
        'process.exit(0);',
      ].join('\n');
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: new URL('..', import.meta.url),
        env: {
          ...process.env,
          NODE_ENV: nodeEnv,
          JWT_SECRET: 'p'.repeat(48),
          EMAIL_TRANSPORT: 'disabled',
          MONGODB_URI: 'mongodb://127.0.0.1:27017/helpdesk_test',
          CLIENT_URL: 'http://localhost:5173',
        },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      const output = result.stdout + result.stderr;
      assert.match(output, /\/api\/admin\/users\?\[redacted\]/);
      assert.match(output, /401/);
      for (const secret of [ADDRESS, encodeURIComponent(ADDRESS), 'one-time-secret']) assert.ok(!output.includes(secret), output);
    });
  }
});
