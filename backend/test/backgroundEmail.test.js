import { describe, it, before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { clearSentEmails, pendingEmailCount, sendInBackground, sentEmails, simulateEmailFailure, waitForPendingEmails } from '../src/services/email.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';

// Background email work and Vercel's waitUntil (services/email.js). On Vercel, the current
// request's context sits under Symbol.for('@vercel/request-context'), and @vercel/functions'
// waitUntil hands promises to it. These tests put a stand-in context there, the way Vercel does,
// and record what it receives. Nothing is deployed.

const VERCEL_REQUEST_CONTEXT = Symbol.for('@vercel/request-context');
let registered;

function withVercelContext() {
  registered = [];
  globalThis[VERCEL_REQUEST_CONTEXT] = { get: () => ({ waitUntil: (promise) => registered.push(promise) }) };
}

afterEach(() => {
  delete globalThis[VERCEL_REQUEST_CONTEXT];
});

describe('sendInBackground and waitUntil', () => {
  it('hands each task\'s promise to the Vercel request context', async () => {
    withVercelContext();
    const work = sendInBackground('test task', async () => {});
    assert.equal(registered.length, 1);
    assert.equal(registered[0], work, 'the same promise that shutdown tracking waits for');
    await work;
  });

  it('without a Vercel context nothing changes: the task runs and is tracked', async () => {
    let ran = false;
    const work = sendInBackground('test task', async () => { ran = true; });
    assert.ok(pendingEmailCount() >= 1);
    assert.deepEqual(await waitForPendingEmails(5_000), { settled: true });
    await work;
    assert.equal(ran, true);
    assert.equal(pendingEmailCount(), 0);
  });

  it('a failing task resolves (never rejects), even as handed to Vercel, and is logged', async (t) => {
    withVercelContext();
    const errors = [];
    t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
    const unhandled = [];
    const onUnhandled = (err) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);
    try {
      sendInBackground('test task', async () => { throw Object.assign(new Error('boom'), { code: 'ESOCKET' }); });
      await assert.doesNotReject(registered[0]);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(unhandled, []);
      assert.deepEqual(errors, ['Email (test task) could not be sent: code=ESOCKET']);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('forgot-password work runs in the background', () => {
  const PASSWORD = 'correct-horse-1';
  let connected = false;

  before(async () => {
    connected = await connectTestDB();
  });
  beforeEach(async () => {
    if (!connected) return;
    await resetTestDB();
    clearSentEmails();
    simulateEmailFailure(false);
    await User.create({ name: 'Cara Customer', email: 'cara@example.test', role: 'customer', passwordHash: await bcrypt.hash(PASSWORD, 4) });
  });
  after(async () => {
    if (connected) await clearTestDB();
    await disconnectTestDB();
  });
  const needsDB = (t) => {
    if (!connected) t.skip('MongoDB is not reachable at MONGODB_URI_TEST');
    return connected;
  };
  const forgot = (email) => request(app).post('/api/auth/forgot-password').send({ email });

  it('the whole lookup-and-send is handed to Vercel, and the email is sent', async (t) => {
    if (!needsDB(t)) return;
    withVercelContext();
    const res = await forgot('cara@example.test');
    assert.equal(res.status, 200);
    assert.equal(registered.length, 1);
    await registered[0];
    const mails = sentEmails().filter((mail) => mail.to === 'cara@example.test');
    assert.equal(mails.length, 1);
    assert.match(mails[0].text, /reset-password\?token=/);
  });

  it('the work is tracked for shutdown while it is still running', async (t) => {
    if (!needsDB(t)) return;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const realFindOne = User.findOne.bind(User);
    t.mock.method(User, 'findOne', async (...args) => {
      await gate;
      return realFindOne(...args);
    });

    const res = await forgot('cara@example.test');
    assert.equal(res.status, 200, 'answered before the lookup finished');
    assert.equal(pendingEmailCount(), 1);
    assert.equal(sentEmails().length, 0);

    release();
    assert.deepEqual(await waitForPendingEmails(5_000), { settled: true });
    assert.equal(sentEmails().filter((mail) => mail.to === 'cara@example.test').length, 1);
  });

  it('an unknown address gets the same answer, is also handed to Vercel, and sends nothing', async (t) => {
    if (!needsDB(t)) return;
    withVercelContext();
    const known = await forgot('cara@example.test');
    const unknown = await forgot('nobody@example.test');
    assert.equal(unknown.status, known.status);
    assert.deepEqual(unknown.body, known.body);
    assert.equal(registered.length, 2);
    await Promise.all(registered);
    assert.equal(sentEmails().filter((mail) => mail.to === 'nobody@example.test').length, 0);
  });

  it('the one-minute cooldown still holds: a second request sends no second email', async (t) => {
    if (!needsDB(t)) return;
    withVercelContext();
    await forgot('cara@example.test');
    await registered[0];
    await forgot('cara@example.test');
    await registered[1];
    assert.equal(sentEmails().filter((mail) => mail.to === 'cara@example.test').length, 1);
  });
});

// The missing-context warning only applies on Vercel (VERCEL set; NODE_ENV=production is then
// required), so it runs in a child process. No database is needed: the tasks do nothing.
describe('on Vercel without a request context', () => {
  function run(lines) {
    const script = [
      'const logged = [];',
      "for (const level of ['log', 'error', 'warn']) console[level] = (...args) => logged.push(args.join(' '));",
      "const { sendInBackground } = await import('./src/services/email.js');",
      ...lines,
      "process.stdout.write(JSON.stringify({ logged }) + '\\n');",
      'process.exit(0);',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        VERCEL: '1',
        NODE_ENV: 'production',
        EMAIL_TRANSPORT: 'disabled',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/helpdesk_test',
        JWT_SECRET: 'p'.repeat(48),
        CLIENT_URL: 'http://localhost:5173',
        CORS_ORIGINS: '',
        JWT_EXPIRES_IN: '',
        TRUST_PROXY: '',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim().split('\n').pop()).logged;
  }

  it('warns once, with no user data, and the work still runs', () => {
    const logged = run([
      "await sendInBackground('password reset', async () => {});",
      "await sendInBackground('ticket status', async () => {});",
    ]);
    assert.equal(logged.length, 1);
    assert.match(logged[0], /^Background email: no Vercel request context/);
    assert.doesNotMatch(logged[0], /@|token|password reset|ticket status/);
  });

  it('stays quiet when Vercel\'s request context is there', () => {
    const logged = run([
      "globalThis[Symbol.for('@vercel/request-context')] = { get: () => ({ waitUntil: () => {} }) };",
      "await sendInBackground('password reset', async () => {});",
    ]);
    assert.deepEqual(logged, []);
  });
});
