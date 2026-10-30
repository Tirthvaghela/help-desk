import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import app from '../src/app.js';
import { Ticket } from '../src/models/Ticket.js';
import { User } from '../src/models/User.js';
import {
  clearSentEmails,
  pendingEmailCount,
  sendInBackground,
  sentEmails,
  simulateEmailFailure,
  SMTP_TIMEOUTS,
  smtpTransportOptions,
  waitForPendingEmails,
} from '../src/services/email.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, createTicket, authHeader } from './helpers/factories.js';

// Ticket status emails to customers (API contract §8). Tests use the in-memory transport
// (test/setup.js): no email ever leaves this process.

describe('email delivery helpers', () => {
  it('SMTP connections have connection, greeting and socket timeouts', () => {
    assert.deepEqual(SMTP_TIMEOUTS, { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
    const options = smtpTransportOptions({ host: 'smtp.example.test', port: 587, secure: false, user: 'u', pass: 'p' });
    assert.equal(options.connectionTimeout, 10_000);
    assert.equal(options.greetingTimeout, 10_000);
    assert.equal(options.socketTimeout, 20_000);
    assert.deepEqual(options.auth, { user: 'u', pass: 'p' });
    assert.equal(smtpTransportOptions({ host: 'h', port: 25, secure: false }).auth, undefined, 'no auth without a user');
  });

  it('background tasks are tracked until they settle, and a failure is logged, never thrown', async (t) => {
    const logged = [];
    t.mock.method(console, 'error', (line) => logged.push(line));
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ok = sendInBackground('test ok', () => gate);
    const failed = sendInBackground('test failing', async () => { throw new Error('boom'); });
    assert.equal(pendingEmailCount() >= 1, true);
    await failed;
    assert.match(logged.join('\n'), /Email \(test failing\) could not be sent: code=unknown/);
    assert.ok(!logged.join('\n').includes('boom'), 'error messages are not logged');
    release();
    await ok;
    assert.equal(pendingEmailCount(), 0);
  });

  it('waitForPendingEmails resolves when work is done, or reports what is left after the limit', async () => {
    assert.deepEqual(await waitForPendingEmails(50), { settled: true });
    let release;
    const stuck = sendInBackground('test stuck', () => new Promise((resolve) => { release = resolve; }));
    const started = Date.now();
    assert.deepEqual(await waitForPendingEmails(60), { settled: false, pending: 1 });
    assert.ok(Date.now() - started < 1000, 'bounded by the limit');
    release();
    await stuck;
    assert.deepEqual(await waitForPendingEmails(50), { settled: true });
  });

  it('the outbox transport writes the status email to a file (separate process, temporary folder)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'helpdesk-outbox-'));
    try {
      const script = `
        const { sendEmail, sendInBackground, waitForPendingEmails } = await import('./src/services/email.js');
        const { ticketStatusChangedEmail } = await import('./src/services/emailTemplates.js');
        sendInBackground('ticket status', () => sendEmail({ to: 'customer@example.test', ...ticketStatusChangedEmail({
          name: 'Asha', ticketId: 'abc123', ticketNumber: 'HD-7', subject: 'Printer jam', previousStatus: 'open', status: 'in_progress' }) }));
        console.log(JSON.stringify(await waitForPendingEmails(5000)));`;
      const output = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { ...process.env, EMAIL_TRANSPORT: 'outbox', EMAIL_OUTBOX_DIR: dir },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        let err = '';
        child.stdout.on('data', (chunk) => { out += chunk; });
        child.stderr.on('data', (chunk) => { err += chunk; });
        child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}: ${err}`))));
      });
      assert.match(output, /"settled":true/);
      const files = await readdir(dir);
      assert.equal(files.length, 1);
      const mail = await readFile(join(dir, files[0]), 'utf8');
      assert.match(mail, /^To: customer@example\.test$/m);
      assert.match(mail, /^Subject: Your ticket HD-7 is now In progress$/m);
      assert.match(mail, /^Previous status: Open$/m);
      assert.match(mail, /^New status: In progress$/m);
      assert.match(mail, new RegExp(`View ticket: ${process.env.CLIENT_URL}/tickets/abc123`));
      assert.ok(!mail.includes('<!DOCTYPE') && !mail.includes('<table'), 'the outbox file holds the text part only');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

let connected = false;
let u;
let c;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  clearSentEmails();
  simulateEmailFailure(false);
  if (!connected) return;
  await resetTestDB();
  u = {
    customer: await createUser({ role: 'customer', name: 'Asha Customer', email: 'asha.customer@example.test' }),
    other: await createUser({ role: 'customer', name: 'Other Customer', email: 'other.customer@example.test' }),
    agent: await createUser({ role: 'agent', name: 'Xena Agent', email: 'xena.agent@example.test' }),
    admin: await createUser({ role: 'admin', name: 'Ada Admin', email: 'ada.admin@example.test' }),
  };
  c = { billing: await createCategory({ name: 'Billing' }) };
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

const setStatus = (user, ticket, status, extraHeaders = {}) =>
  request(app).patch(`/api/tickets/${ticket._id}/status`).set(authHeader(user)).set(extraHeaders).send({ status });
const ticketFor = (overrides = {}) =>
  createTicket({ createdBy: u.customer, category: c.billing, assignedTo: u.agent, subject: 'Invoice total is wrong', ...overrides });
// Every request returns before its email is sent; wait for the background work first.
const settledEmails = async () => {
  assert.deepEqual(await waitForPendingEmails(3000), { settled: true });
  return sentEmails();
};

describe('status change emails', () => {
  it('assignee moves the ticket to In progress, then Resolved: the customer gets one email each', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await ticketFor();
    assert.equal((await setStatus(u.agent, ticket, 'in_progress')).status, 200);
    let mails = await settledEmails();
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, 'asha.customer@example.test');
    assert.equal(mails[0].subject, `Your ticket ${ticket.ticketNumber} is now In progress`);
    assert.ok(mails[0].text.includes(`Ticket: ${ticket.ticketNumber}\nSubject: Invoice total is wrong\nPrevious status: Open\nNew status: In progress`));

    assert.equal((await setStatus(u.agent, ticket, 'resolved')).status, 200);
    mails = await settledEmails();
    assert.equal(mails.length, 2);
    assert.equal(mails[1].to, 'asha.customer@example.test');
    assert.equal(mails[1].subject, `Your ticket ${ticket.ticketNumber} has been resolved`);
    assert.ok(mails[1].text.includes('Previous status: In progress\nNew status: Resolved'));
  });

  it('contents: ticket number, subject, both statuses, a CLIENT_URL link, why it was sent; no staff details', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await ticketFor();
    // A forged Host header must not change the link.
    await setStatus(u.agent, ticket, 'in_progress', { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' });
    const [mail] = await settledEmails();
    const link = `${process.env.CLIENT_URL}/tickets/${ticket._id}`;
    for (const part of [mail.text, mail.html]) {
      assert.ok(part.includes(ticket.ticketNumber), 'ticket number');
      assert.ok(part.includes('Invoice total is wrong'), 'subject');
      assert.ok(part.includes('Open') && part.includes('In progress'), 'both statuses');
      assert.ok(part.includes(link), 'link built from CLIENT_URL');
      assert.ok(part.includes('Our support team'), 'generic wording');
      assert.ok(part.includes('because the status of your support ticket changed'), 'why it was sent');
      for (const hidden of ['evil.example', 'Xena', 'xena.agent@example.test', 'Ada', 'ada.admin@example.test', 'other.customer@example.test', 'Other Customer']) {
        assert.ok(!part.includes(hidden), `must not contain ${hidden}`);
      }
    }
  });

  it('escapes the customer-written subject in the HTML part', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await ticketFor({ subject: '<script>alert(1)</script> & "quotes"' });
    await setStatus(u.agent, ticket, 'in_progress');
    const [mail] = await settledEmails();
    assert.ok(!mail.html.includes('<script>'), 'no raw markup');
    assert.ok(mail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;'));
    assert.ok(!/[\r\n]/.test(mail.subject), 'single-line subject');
  });

  it('an admin changing the status also emails the customer', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await ticketFor();
    assert.equal((await setStatus(u.admin, ticket, 'in_progress')).status, 200);
    const mails = await settledEmails();
    assert.deepEqual(mails.map((mail) => mail.to), ['asha.customer@example.test']);
  });

  it('rejected or repeated changes send nothing (same status again, skipped step, unassigned, resolved)', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await ticketFor();
    assert.equal((await setStatus(u.agent, ticket, 'in_progress')).status, 200);
    assert.equal((await settledEmails()).length, 1);

    const again = await setStatus(u.agent, ticket, 'in_progress');
    assert.deepEqual([again.status, again.body.error.code], [400, 'INVALID_STATUS_TRANSITION']);
    const skipped = await setStatus(u.agent, await ticketFor(), 'resolved');
    assert.deepEqual([skipped.status, skipped.body.error.code], [400, 'INVALID_STATUS_TRANSITION']);
    const unassigned = await setStatus(u.agent, await ticketFor({ assignedTo: null }), 'in_progress');
    assert.deepEqual([unassigned.status, unassigned.body.error.code], [400, 'ASSIGNEE_REQUIRED']);
    const resolved = await ticketFor({ status: 'resolved' });
    const final = await setStatus(u.agent, resolved, 'in_progress');
    assert.deepEqual([final.status, final.body.error.code], [400, 'TICKET_RESOLVED']);
    const outsider = await createUser({ role: 'agent' });
    assert.equal((await setStatus(outsider, ticket, 'resolved')).status, 403);

    assert.equal((await settledEmails()).length, 1, 'still only the first email');
  });

  it('a deactivated customer gets no email; the status still changes', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await ticketFor();
    await User.updateOne({ _id: u.customer._id }, { isActive: false });
    assert.equal((await setStatus(u.agent, ticket, 'in_progress')).status, 200);
    assert.equal((await settledEmails()).length, 0);
    assert.equal((await Ticket.findById(ticket._id)).status, 'in_progress');
  });

  it('a delivery failure never undoes the change, and the log names no address or link', async (t) => {
    if (!requireDB(t)) return;
    const logged = [];
    t.mock.method(console, 'error', (line) => logged.push(String(line)));
    simulateEmailFailure(true);
    const ticket = await ticketFor();
    const res = await setStatus(u.agent, ticket, 'in_progress');
    assert.equal(res.status, 200);
    assert.equal(res.body.ticket.status, 'in_progress');
    await settledEmails();
    const stored = await Ticket.findById(ticket._id);
    assert.equal(stored.status, 'in_progress');
    assert.deepEqual(stored.statusHistory.map((entry) => entry.status), ['open', 'in_progress']);
    assert.equal(sentEmails().length, 0);
    const log = logged.join('\n');
    assert.match(log, /Email \(ticket status\) could not be sent: code=unknown/);
    assert.ok(!log.includes('asha.customer@example.test') && !log.includes('/tickets/'), 'no address or link in logs');
  });

  it('the response does not wait for the email (sent in the background, tracked until done)', async (t) => {
    if (!requireDB(t)) return;
    const realFindOne = User.findOne;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    t.mock.method(User, 'findOne', function findOne(...args) {
      const query = realFindOne.apply(this, args);
      const filter = args[0] ?? {};
      if (filter.role === 'customer' && filter.isActive === true) {
        return { select: (...fields) => gate.then(() => query.select(...fields)) };
      }
      return query;
    });
    const ticket = await ticketFor();
    const res = await setStatus(u.agent, ticket, 'in_progress');
    assert.equal(res.status, 200, 'answered while the email is still waiting');
    assert.equal(pendingEmailCount(), 1);
    assert.equal(sentEmails().length, 0);
    release();
    assert.equal((await settledEmails()).length, 1);
    assert.equal(pendingEmailCount(), 0);
  });

  it('no email for assignment, release, priority changes, replies or ticket creation (including replays)', async (t) => {
    if (!requireDB(t)) return;
    const open = await ticketFor({ assignedTo: null });
    assert.equal((await request(app).patch(`/api/tickets/${open._id}/assign`).set(authHeader(u.agent)).send({ assignedTo: String(u.agent._id) })).status, 200);
    assert.equal((await request(app).patch(`/api/tickets/${open._id}/assign`).set(authHeader(u.agent)).send({ priority: 'high' })).status, 200);
    assert.equal((await request(app).patch(`/api/tickets/${open._id}/assign`).set(authHeader(u.agent)).send({ assignedTo: null })).status, 200);
    assert.equal((await request(app).patch(`/api/tickets/${open._id}/assign`).set(authHeader(u.admin)).send({ assignedTo: String(u.agent._id) })).status, 200);
    assert.equal((await request(app).post(`/api/tickets/${open._id}/comments`).set(authHeader(u.agent)).send({ message: 'Looking into it.' })).status, 201);

    const body = { subject: 'Cannot download invoice', description: 'The download button does nothing.', categoryId: String(c.billing._id) };
    const create = (key) => {
      const req = request(app).post('/api/tickets').set(authHeader(u.customer));
      if (key) req.set('Idempotency-Key', key);
      return req.send(body);
    };
    assert.equal((await create()).status, 201);
    assert.equal((await create('replay-key-0001')).status, 201);
    assert.equal((await create('replay-key-0001')).status, 200, 'idempotent replay');

    assert.equal((await settledEmails()).length, 0);
  });

  it('only the ticket owner is emailed, never another customer', async (t) => {
    if (!requireDB(t)) return;
    const mine = await ticketFor();
    await createTicket({ createdBy: u.other, category: c.billing, assignedTo: u.agent });
    await setStatus(u.agent, mine, 'in_progress');
    const mails = await settledEmails();
    assert.deepEqual(mails.map((mail) => mail.to), ['asha.customer@example.test']);
  });
});
