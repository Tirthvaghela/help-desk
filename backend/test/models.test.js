import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Category } from '../src/models/Category.js';
import { Ticket } from '../src/models/Ticket.js';
import { TicketComment, COMMENT_MAX_LENGTH } from '../src/models/TicketComment.js';
import { nextTicketNumber, nextSequence } from '../src/models/Counter.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, createTicket } from './helpers/factories.js';

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

// Skips only when MongoDB is unreachable and strict mode is off; CI uses strict mode.
function requireDB(t) {
  if (!connected) t.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

async function assertValidationError(promise, path) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof mongoose.Error.ValidationError, `expected ValidationError, got ${err.name}`);
    assert.ok(err.errors[path], `expected an error on "${path}", got: ${Object.keys(err.errors).join(', ')}`);
    return true;
  });
}

async function assertDuplicateKey(promise) {
  await assert.rejects(promise, (err) => err.code === 11000);
}

describe('User model', () => {
  it('defaults to an active customer and normalises the email', async (t) => {
    if (!requireDB(t)) return;
    const user = await User.create({ name: '  Asha  ', email: '  Asha@Example.COM ', passwordHash: 'hash' });

    assert.equal(user.name, 'Asha');
    assert.equal(user.email, 'asha@example.com');
    assert.equal(user.role, 'customer');
    assert.equal(user.isActive, true);
    assert.ok(user.createdAt instanceof Date);
  });

  it('rejects unknown roles, bad emails and short names', async (t) => {
    if (!requireDB(t)) return;
    await assertValidationError(User.create({ name: 'Asha', email: 'a@example.com', passwordHash: 'h', role: 'superuser' }), 'role');
    await assertValidationError(User.create({ name: 'Asha', email: 'not-an-email', passwordHash: 'h' }), 'email');
    await assertValidationError(User.create({ name: 'A', email: 'a@example.com', passwordHash: 'h' }), 'name');
    await assertValidationError(User.create({ name: 'Asha', email: 'a@example.com' }), 'passwordHash');
  });

  it('enforces unique emails regardless of case', async (t) => {
    if (!requireDB(t)) return;
    await createUser({ email: 'asha@example.com' });
    await assertDuplicateKey(createUser({ email: 'ASHA@example.com' }));
  });

  it('never loads or serialises passwordHash unless explicitly selected', async (t) => {
    if (!requireDB(t)) return;
    const created = await createUser();

    const loaded = await User.findById(created._id);
    assert.equal(loaded.passwordHash, undefined);

    const withHash = await User.findById(created._id).select('+passwordHash');
    assert.ok(withHash.passwordHash);
    const json = withHash.toJSON();
    assert.equal(json.passwordHash, undefined);
    assert.equal(json.id, String(created._id));
    assert.equal(json._id, undefined);
    assert.equal(json.__v, undefined);
    assert.ok(!JSON.stringify(withHash).includes(withHash.passwordHash));
  });
});

describe('Category model (D-6)', () => {
  it('defaults to active and trims the name', async (t) => {
    if (!requireDB(t)) return;
    const category = await Category.create({ name: '  Billing  ' });
    assert.equal(category.name, 'Billing');
    assert.equal(category.isActive, true);
  });

  it('enforces case-insensitive unique names', async (t) => {
    if (!requireDB(t)) return;
    await Category.create({ name: 'Billing' });
    await assertDuplicateKey(Category.create({ name: 'billing' }));
    await assertDuplicateKey(Category.create({ name: 'BILLING' }));
  });

  it('enforces name length', async (t) => {
    if (!requireDB(t)) return;
    await assertValidationError(Category.create({ name: 'B' }), 'name');
    await assertValidationError(Category.create({ name: 'x'.repeat(51) }), 'name');
  });
});

describe('Ticket model', () => {
  it('defaults to open and unassigned, and records the first history entry', async (t) => {
    if (!requireDB(t)) return;
    const customer = await createUser();
    const category = await createCategory();
    const ticket = await Ticket.create({
      ticketNumber: 'HD-1',
      subject: 'Unable to reset password',
      description: 'The reset link has expired.',
      category: category._id,
      priority: 'medium',
      createdBy: customer._id,
    });

    assert.equal(ticket.status, 'open');
    assert.equal(ticket.assignedTo, null);
    assert.equal(ticket.resolvedAt, null);
    assert.equal(ticket.statusHistory.length, 1);
    assert.equal(ticket.statusHistory[0].status, 'open');
    assert.ok(ticket.statusHistory[0].changedBy.equals(customer._id));
    assert.ok(ticket.statusHistory[0].changedAt instanceof Date);
  });

  it('rejects values outside the contract enums and required fields', async (t) => {
    if (!requireDB(t)) return;
    const base = {
      ticketNumber: 'HD-2',
      subject: 'Unable to reset password',
      description: 'The reset link has expired.',
      category: new mongoose.Types.ObjectId(),
      priority: 'medium',
      createdBy: new mongoose.Types.ObjectId(),
    };
    await assertValidationError(Ticket.create({ ...base, priority: 'urgent' }), 'priority');
    await assertValidationError(Ticket.create({ ...base, status: 'closed' }), 'status');
    await assertValidationError(Ticket.create({ ...base, subject: 'Hi' }), 'subject');
    await assertValidationError(Ticket.create({ ...base, ticketNumber: 'TICKET-2' }), 'ticketNumber');
    await assertValidationError(Ticket.create({ ...base, category: undefined }), 'category');
    await assertValidationError(Ticket.create({ ...base, createdBy: undefined }), 'createdBy');
  });

  it('enforces unique ticket numbers', async (t) => {
    if (!requireDB(t)) return;
    const first = await createTicket();
    await assertDuplicateKey(
      Ticket.create({
        ticketNumber: first.ticketNumber,
        subject: 'Another subject',
        description: 'Another description.',
        category: first.category,
        priority: 'low',
        createdBy: first.createdBy,
      }),
    );
  });

  it('has the indexes the queue, history and stats queries need', async (t) => {
    if (!requireDB(t)) return;
    const keys = (await Ticket.listIndexes()).map((index) => JSON.stringify(index.key));
    for (const expected of [
      { ticketNumber: 1 },
      { createdBy: 1, createdAt: -1 },
      { assignedTo: 1, status: 1, createdAt: -1 },
      { status: 1, category: 1 },
    ]) {
      assert.ok(keys.includes(JSON.stringify(expected)), `missing index ${JSON.stringify(expected)}`);
    }
  });

  it('serialises populated users without passwordHash', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await createTicket();
    const populated = await Ticket.findById(ticket._id).populate({ path: 'createdBy', select: '+passwordHash' });
    const json = JSON.parse(JSON.stringify(populated));

    assert.equal(json.id, String(ticket._id));
    assert.equal(json.createdBy.id, String(ticket.createdBy));
    assert.equal(json.createdBy.passwordHash, undefined);
    assert.equal(json.createdBy._id, undefined);
  });
});

describe('TicketComment model (D-4)', () => {
  it('stores a trimmed message with createdAt only', async (t) => {
    if (!requireDB(t)) return;
    const ticket = await createTicket();
    const comment = await TicketComment.create({ ticket: ticket._id, author: ticket.createdBy, message: '  Thanks!  ' });

    assert.equal(comment.message, 'Thanks!');
    assert.ok(comment.createdAt instanceof Date);
    assert.equal(comment.updatedAt, undefined);
    assert.equal(TicketComment.collection.collectionName, 'ticketcomments');
  });

  it(`rejects empty and over-${COMMENT_MAX_LENGTH}-character messages`, async (t) => {
    if (!requireDB(t)) return;
    const ticket = await createTicket();
    const base = { ticket: ticket._id, author: ticket.createdBy };
    await assertValidationError(TicketComment.create({ ...base, message: '   ' }), 'message');
    await assertValidationError(TicketComment.create({ ...base, message: 'x'.repeat(COMMENT_MAX_LENGTH + 1) }), 'message');
    await TicketComment.create({ ...base, message: 'x'.repeat(COMMENT_MAX_LENGTH) });
  });

  it('has an index for reading a thread oldest first', async (t) => {
    if (!requireDB(t)) return;
    const keys = (await TicketComment.listIndexes()).map((index) => JSON.stringify(index.key));
    assert.ok(keys.includes(JSON.stringify({ ticket: 1, createdAt: 1 })));
  });
});

describe('Counter / ticket numbers', () => {
  it('issues sequential HD-numbers starting at HD-1', async (t) => {
    if (!requireDB(t)) return;
    assert.equal(await nextTicketNumber(), 'HD-1');
    assert.equal(await nextTicketNumber(), 'HD-2');
  });

  it('never issues the same number twice under concurrency', async (t) => {
    if (!requireDB(t)) return;
    const numbers = await Promise.all(Array.from({ length: 25 }, () => nextSequence('concurrency-test')));
    assert.equal(new Set(numbers).size, 25);
    assert.deepEqual([...numbers].sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i + 1));
  });
});

describe('createTicket factory', () => {
  it('builds a consistent history for each status', async (t) => {
    if (!requireDB(t)) return;
    const agent = await createUser({ role: 'agent' });
    const resolved = await createTicket({ assignedTo: agent, status: 'resolved' });

    assert.deepEqual(resolved.statusHistory.map((entry) => entry.status), ['open', 'in_progress', 'resolved']);
    assert.ok(resolved.statusHistory[0].changedBy.equals(resolved.createdBy));
    assert.ok(resolved.statusHistory[2].changedBy.equals(agent._id));
    assert.ok(resolved.resolvedAt instanceof Date);
    assert.match(resolved.ticketNumber, /^HD-\d+$/);
  });
});
