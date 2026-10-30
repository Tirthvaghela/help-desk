import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { Category } from '../src/models/Category.js';
import { Ticket } from '../src/models/Ticket.js';
import { TicketComment } from '../src/models/TicketComment.js';
import { Counter } from '../src/models/Counter.js';
import { checkDemoTarget } from '../scripts/lib/target.js';
import { DEMO_PASSWORD, DEMO_TICKETS, DEMO_USERS, DemoSeedError, seedDemo } from '../scripts/lib/demoData.js';
import { DEFAULT_SLA_HOURS, slaState } from '../src/utils/sla.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, createTicket, authHeader } from './helpers/factories.js';

// Demo data (`npm run seed:demo`): where it may be written, that it is consistent with the
// schema and the ticket rules, and that running it again changes nothing.

describe('seed:demo target guard', () => {
  const ok = (uri, env) => checkDemoTarget(uri, env).ok;

  it('accepts only a local database named *_demo, *_dev or *_test', () => {
    for (const uri of [
      'mongodb://127.0.0.1:27017/helpdesk_demo',
      'mongodb://localhost:27017/helpdesk_dev',
      'mongodb://localhost/helpdesk_test',
      'mongodb://[::1]:27017/helpdesk_demo',
    ]) {
      assert.equal(ok(uri, 'development'), true, uri);
    }
  });

  it('refuses remote hosts, Atlas (+srv) and multi-host strings, with no way around it', () => {
    for (const uri of [
      'mongodb+srv://user:secret@cluster0.example.mongodb.net/helpdesk_demo',
      'mongodb://db.example.com:27017/helpdesk_demo',
      'mongodb://10.0.0.5:27017/helpdesk_test',
      'mongodb://127.0.0.1:27017,127.0.0.2:27017/helpdesk_demo',
    ]) {
      assert.equal(ok(uri, 'development'), false, uri);
    }
  });

  it('refuses real database names (helpdesk, test, the default database)', () => {
    for (const name of ['helpdesk', 'test', '', 'helpdesk_demo_backup', 'demo', 'helpdesk-demo']) {
      assert.equal(ok(`mongodb://127.0.0.1:27017/${name}`, 'development'), false, name || '(default)');
    }
  });

  it('refuses NODE_ENV=production and a missing or invalid MONGODB_URI', () => {
    assert.equal(ok('mongodb://127.0.0.1:27017/helpdesk_demo', 'production'), false);
    assert.equal(ok(undefined, 'development'), false);
    assert.equal(ok('not a url', 'development'), false);
  });

  it('never repeats credentials from the connection string', () => {
    const check = checkDemoTarget('mongodb+srv://user:secret@cluster0.example.mongodb.net/helpdesk', 'development');
    assert.ok(!JSON.stringify(check).includes('secret'));
    assert.ok(!JSON.stringify(check).includes('cluster0'));
  });
});

let connected = false;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (connected) await resetTestDB();
});

after(async () => {
  if (connected) await clearTestDB();
  await disconnectTestDB();
});

function requireDB(testContext) {
  if (!connected) testContext.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

const NOW = new Date('2026-10-29T10:00:00.000Z');
const COMMENT_COUNT = DEMO_TICKETS.reduce((sum, spec) => sum + (spec.comments?.length ?? 0), 0);
const demoEmails = DEMO_USERS.map((user) => user.email);
const snapshot = async () => ({
  users: (await User.find().sort({ email: 1 }).lean()).map((user) => [String(user._id), user.email, user.role]),
  categories: (await Category.find().sort({ name: 1 }).lean()).map((category) => [String(category._id), category.name]),
  tickets: (await Ticket.find().sort({ ticketNumber: 1 }).lean()).map((ticket) => [String(ticket._id), ticket.ticketNumber, ticket.status]),
  comments: (await TicketComment.find().sort({ _id: 1 }).lean()).map((comment) => String(comment._id)),
  counter: (await Counter.findById('ticket').lean())?.seq ?? 0,
});

describe('seedDemo', () => {
  it('creates the demo data: 1 admin, 2 agents, 3 customers, 4 categories, 7 tickets with replies', async (t) => {
    if (!requireDB(t)) return;
    const summary = await seedDemo({ now: NOW });
    assert.deepEqual(summary.users, { added: 6, kept: 0 });
    assert.deepEqual(summary.categories, { added: 4, kept: 0 });
    assert.deepEqual(summary.tickets, { added: 7, kept: 0 });
    assert.deepEqual(summary.comments, { added: COMMENT_COUNT, kept: 0 });

    const roles = Object.fromEntries((await User.find({ email: { $in: demoEmails } })).map((user) => [user.email, user.role]));
    assert.deepEqual(Object.values(roles).sort(), ['admin', 'agent', 'agent', 'customer', 'customer', 'customer']);
    const statuses = (await Ticket.find()).map((ticket) => ticket.status);
    for (const status of ['open', 'in_progress', 'resolved']) assert.ok(statuses.includes(status), status);
    const priorities = new Set((await Ticket.find()).map((ticket) => ticket.priority));
    assert.deepEqual([...priorities].sort(), ['high', 'low', 'medium']);
  });

  it('running it again adds nothing and changes nothing (same ids, numbers, counter)', async (t) => {
    if (!requireDB(t)) return;
    await seedDemo({ now: NOW });
    const first = await snapshot();
    const again = await seedDemo({ now: new Date(NOW.getTime() + 86400000) });
    assert.deepEqual(again.users, { added: 0, kept: 6 });
    assert.deepEqual(again.categories, { added: 0, kept: 4 });
    assert.deepEqual(again.tickets, { added: 0, kept: 7 });
    assert.deepEqual(again.comments, { added: 0, kept: COMMENT_COUNT });
    assert.ok(again.records.every((line) => line.startsWith('kept')), again.records.join('\n'));
    assert.deepEqual(await snapshot(), first);
  });

  it('every record passes the schema, and tickets follow the status and ownership rules (D-10, D-11)', async (t) => {
    if (!requireDB(t)) return;
    await seedDemo({ now: NOW });
    const users = new Map((await User.find()).map((user) => [String(user._id), user]));
    const categoryIds = new Set((await Category.find()).map((category) => String(category._id)));
    const tickets = await Ticket.find();
    assert.equal(new Set(tickets.map((ticket) => ticket.ticketNumber)).size, tickets.length, 'unique HD numbers');

    for (const ticket of tickets) {
      await ticket.validate();
      const label = ticket.ticketNumber;
      assert.ok(categoryIds.has(String(ticket.category)), `${label}: category exists`);
      assert.equal(users.get(String(ticket.createdBy)).role, 'customer', `${label}: raised by a customer`);
      const assignee = ticket.assignedTo ? users.get(String(ticket.assignedTo)) : null;
      if (assignee) assert.equal(assignee.role, 'agent', `${label}: assigned to an agent`);
      if (ticket.status !== 'open') assert.ok(assignee, `${label}: ${ticket.status} tickets have an assignee (D-10)`);

      const steps = ticket.statusHistory.map((entry) => entry.status);
      assert.deepEqual(steps, ['open', 'in_progress', 'resolved'].slice(0, steps.length), `${label}: history in order`);
      assert.equal(steps.at(-1), ticket.status, `${label}: history ends at the current status`);
      assert.equal(String(ticket.statusHistory[0].changedBy), String(ticket.createdBy), `${label}: opened by its customer`);
      for (const entry of ticket.statusHistory.slice(1)) {
        assert.equal(String(entry.changedBy), String(ticket.assignedTo), `${label}: status changed by the assignee`);
      }
      const times = ticket.statusHistory.map((entry) => entry.changedAt.getTime());
      assert.deepEqual(times, [...times].sort((a, b) => a - b), `${label}: times in order`);
      assert.equal(ticket.createdAt.getTime(), times[0], `${label}: created when opened`);
      assert.ok(ticket.createdAt < NOW && ticket.updatedAt >= ticket.createdAt && ticket.updatedAt < NOW, `${label}: dates`);
      if (ticket.status === 'resolved') assert.equal(ticket.resolvedAt.getTime(), times.at(-1), `${label}: resolvedAt`);
      else assert.equal(ticket.resolvedAt, null, `${label}: not resolved`);

      for (const comment of await TicketComment.find({ ticket: ticket._id })) {
        await comment.validate();
        const author = String(comment.author);
        assert.ok(author === String(ticket.createdBy) || author === String(ticket.assignedTo), `${label}: reply by its customer or assignee (D-11)`);
        assert.ok(comment.createdAt >= ticket.createdAt && comment.createdAt < NOW, `${label}: reply time`);
      }
    }
    for (const user of users.values()) await user.validate();
  });

  it('demo accounts sign in with the demo password, and each agent sees the right queue', async (t) => {
    if (!requireDB(t)) return;
    await seedDemo({ now: NOW });
    for (const demo of DEMO_USERS) {
      const res = await request(app).post('/api/auth/login').send({ email: demo.email, password: DEMO_PASSWORD });
      assert.equal(res.status, 200, `${demo.email}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.user.role, demo.role);
    }
    const wrong = await request(app).post('/api/auth/login').send({ email: DEMO_USERS[0].email, password: 'not-the-password' });
    assert.equal(wrong.status, 401);

    // Agents see unassigned tickets plus their own (OPEN-1); the admin sees all seven.
    const queue = async (key) => {
      const user = await User.findOne({ email: DEMO_USERS.find((demo) => demo.key === key).email });
      return (await request(app).get('/api/tickets').set(authHeader(user))).body.total;
    };
    const unassigned = DEMO_TICKETS.filter((spec) => !spec.assignee).length;
    assert.equal(await queue('arjun'), unassigned + DEMO_TICKETS.filter((spec) => spec.assignee === 'arjun').length);
    assert.equal(await queue('sara'), unassigned + DEMO_TICKETS.filter((spec) => spec.assignee === 'sara').length);
    assert.equal(await queue('admin'), DEMO_TICKETS.length);
  });

  it('keeps existing records exactly as they are and reuses existing categories (any letter case)', async (t) => {
    if (!requireDB(t)) return;
    const rohan = await createUser({ role: 'customer', name: 'Existing Rohan', email: 'rohan.demo@example.com' });
    const billing = await createCategory({ name: 'billing', isActive: false });
    const other = await createTicket({ subject: 'Someone else’s ticket' });
    const before = await snapshot();

    const summary = await seedDemo({ now: NOW });
    assert.deepEqual(summary.users, { added: 5, kept: 1 });
    assert.deepEqual(summary.categories, { added: 3, kept: 1 });

    const keptRohan = await User.findById(rohan._id).select('+passwordHash');
    assert.equal(keptRohan.name, 'Existing Rohan', 'not renamed');
    assert.equal(keptRohan.passwordHash, 'placeholder-hash-not-valid-for-login', 'password not changed');
    const keptBilling = await Category.findById(billing._id);
    assert.deepEqual([keptBilling.name, keptBilling.isActive], ['billing', false], 'category not changed');
    assert.equal(await Category.countDocuments({ name: /^billing$/i }), 1, 'no second Billing');
    const keptTicket = await Ticket.findById(other._id).lean();
    assert.equal(keptTicket.subject, 'Someone else’s ticket');
    assert.equal(keptTicket.ticketNumber, before.tickets[0][1], 'existing ticket number unchanged');
    assert.ok((await Ticket.find({ createdBy: rohan._id })).length > 0, 'the existing customer gets the demo tickets');
  });

  it('stops before writing anything when a demo email belongs to an account with another role', async (t) => {
    if (!requireDB(t)) return;
    await createUser({ role: 'customer', email: 'admin.demo@example.com' });
    const before = await snapshot();
    await assert.rejects(seedDemo({ now: NOW }), (err) => err instanceof DemoSeedError && /admin\.demo@example\.com already exists as customer/.test(err.message));
    assert.deepEqual(await snapshot(), before);
  });

  it('every demo ticket has an SLA due date (created + target), and the set shows every state, incl. overdue', async (t) => {
    if (!requireDB(t)) return;
    await seedDemo({ now: NOW });
    const states = new Map();
    for (const ticket of await Ticket.find()) {
      assert.ok(ticket.dueAt instanceof Date, `${ticket.ticketNumber}: has a due date`);
      assert.equal(ticket.dueAt.getTime(), ticket.createdAt.getTime() + DEFAULT_SLA_HOURS[ticket.priority] * 3600000, `${ticket.ticketNumber}: created + ${ticket.priority} target`);
      states.set(ticket.subject, slaState(ticket, NOW));
    }
    assert.deepEqual([...new Set(states.values())].sort(), ['due', 'due_soon', 'met', 'missed', 'overdue']);
    const overdue = [...states.entries()].filter(([, state]) => state === 'overdue').map(([subject]) => subject);
    assert.ok(overdue.length >= 1);
    for (const subject of overdue) {
      assert.notEqual((await Ticket.findOne({ subject })).status, 'resolved', 'the overdue example is unresolved');
    }
  });

  it('uses SLA_HOURS_* like the API, and an invalid value stops the seed before any write', async (t) => {
    if (!requireDB(t)) return;
    await assert.rejects(seedDemo({ now: NOW, slaSource: { SLA_HOURS_HIGH: '0' } }), (err) => err instanceof DemoSeedError && /SLA_HOURS_HIGH/.test(err.message));
    assert.equal(await User.countDocuments(), 0);
    assert.equal(await Ticket.countDocuments(), 0);

    await seedDemo({ now: NOW, slaSource: { SLA_HOURS_HIGH: '4' } });
    const high = await Ticket.findOne({ priority: 'high' });
    assert.equal(high.dueAt.getTime(), high.createdAt.getTime() + 4 * 3600000);
  });

  it('rejects an unusable demo password before writing anything', async (t) => {
    if (!requireDB(t)) return;
    await assert.rejects(seedDemo({ password: 'short' }), DemoSeedError);
    await assert.rejects(seedDemo({ password: 'x'.repeat(73) }), DemoSeedError);
    assert.equal(await User.countDocuments(), 0);
  });
});
