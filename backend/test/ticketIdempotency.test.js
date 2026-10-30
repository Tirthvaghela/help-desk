import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { Ticket } from '../src/models/Ticket.js';
import { Notification } from '../src/models/Notification.js';
import { TicketSubmission } from '../src/models/TicketSubmission.js';
import { Counter } from '../src/models/Counter.js';
import { Category } from '../src/models/Category.js';
import { requestFingerprint, submissionId, submissionTiming } from '../src/utils/idempotency.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser, createCategory, authHeader } from './helpers/factories.js';

// C-3: duplicate ticket submissions (API contract §7). With an Idempotency-Key, repeats of
// one submission (retries, double clicks) return the ticket it created; separate submissions
// with different keys always create separate tickets, even with identical content.

let connected = false;
let u;
let c;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  u = {
    customerA: await createUser({ role: 'customer' }),
    customerB: await createUser({ role: 'customer' }),
    agent: await createUser({ role: 'agent' }),
    admin: await createUser({ role: 'admin' }),
  };
  c = {
    billing: await createCategory({ name: 'Billing' }),
    retired: await createCategory({ name: 'Retired', isActive: false }),
  };
});

after(async () => {
  if (connected) await clearTestDB();
  await disconnectTestDB();
});

function requireDB(testContext) {
  if (!connected) testContext.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

const KEY = '0f8c2a4e-3b1d-4c6a-9e2f-7a5b8c9d0e1f';
const validBody = (overrides = {}) => ({
  subject: 'Invoice total is wrong',
  description: 'My October invoice charges me twice.',
  categoryId: String(c.billing._id),
  priority: 'high',
  ...overrides,
});
const create = (user, body, key) => {
  const req = request(app).post('/api/tickets');
  if (user) req.set(authHeader(user));
  if (key !== undefined) req.set('Idempotency-Key', key);
  return req.send(body);
};
const assertError = (res, status, code) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.error?.code, code, JSON.stringify(res.body));
};
const ticketSeq = async () => (await Counter.findById('ticket').lean())?.seq ?? 0;

describe('POST /api/tickets with an Idempotency-Key', () => {
  it('a repeated request returns the original ticket (200, Idempotent-Replayed) and creates nothing more', async (t) => {
    if (!requireDB(t)) return;
    const first = await create(u.customerA, validBody(), KEY);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.headers['idempotent-replayed'], undefined);
    const notified = await Notification.countDocuments();
    assert.ok(notified > 0, 'staff are notified of the new ticket');

    const again = await create(u.customerA, validBody(), KEY);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.headers['idempotent-replayed'], 'true');
    assert.deepEqual(again.body, first.body, 'same ticket, same reference, same shape');

    assert.equal(await Ticket.countDocuments(), 1);
    assert.equal(await Notification.countDocuments(), notified, 'nobody is notified again');
    assert.equal(await ticketSeq(), 1, 'no ticket number used up');
  });

  it('concurrent requests with one key create exactly one ticket and all return it', async (t) => {
    if (!requireDB(t)) return;
    const responses = await Promise.all(Array.from({ length: 8 }, () => create(u.customerA, validBody(), KEY)));
    const statuses = responses.map((res) => res.status).sort();
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 200, 201], JSON.stringify(responses.map((res) => res.body)));
    const ids = new Set(responses.map((res) => res.body.ticket.id));
    const numbers = new Set(responses.map((res) => res.body.ticket.ticketNumber));
    assert.equal(ids.size, 1);
    assert.equal(numbers.size, 1);
    assert.equal(await Ticket.countDocuments(), 1);
    assert.equal(await TicketSubmission.countDocuments(), 1);
    assert.equal(await ticketSeq(), 1, 'only the winning request takes a ticket number');
  });

  it('separate submissions with different keys create separate tickets, even with identical content', async (t) => {
    if (!requireDB(t)) return;
    const a = await create(u.customerA, validBody(), KEY);
    const b = await create(u.customerA, validBody(), 'second-submission-key');
    assert.deepEqual([a.status, b.status], [201, 201]);
    assert.notEqual(a.body.ticket.id, b.body.ticket.id);
    assert.notEqual(a.body.ticket.ticketNumber, b.body.ticket.ticketNumber);
    assert.equal(await Ticket.countDocuments(), 2);
  });

  it('without a key the endpoint behaves as before: every request creates a ticket', async (t) => {
    if (!requireDB(t)) return;
    const a = await create(u.customerA, validBody());
    const b = await create(u.customerA, validBody());
    assert.deepEqual([a.status, b.status], [201, 201]);
    assert.notEqual(a.body.ticket.id, b.body.ticket.id);
    assert.equal(await TicketSubmission.countDocuments(), 0);
  });

  it('the response shape with a key matches the shape without one', async (t) => {
    if (!requireDB(t)) return;
    const plain = await create(u.customerA, validBody());
    const keyed = await create(u.customerA, validBody(), KEY);
    assert.deepEqual(Object.keys(keyed.body), ['ticket']);
    assert.deepEqual(Object.keys(keyed.body.ticket).sort(), Object.keys(plain.body.ticket).sort());
    assert.equal(keyed.body.ticket.status, 'open');
    assert.equal(keyed.body.ticket.createdBy.id, String(u.customerA._id));
    assert.match(keyed.body.ticket.ticketNumber, /^HD-\d+$/);
    assert.deepEqual(keyed.body.ticket.statusHistory.map((entry) => entry.status), ['open']);
  });

  it('reusing a key for different content is refused (409 IDEMPOTENCY_KEY_REUSED)', async (t) => {
    if (!requireDB(t)) return;
    const first = await create(u.customerA, validBody(), KEY);
    assert.equal(first.status, 201);
    for (const change of [{ subject: 'A different problem' }, { description: 'Something else entirely.' }, { priority: 'low' }]) {
      assertError(await create(u.customerA, validBody(change), KEY), 409, 'IDEMPOTENCY_KEY_REUSED');
    }
    assert.equal(await Ticket.countDocuments(), 1);
  });

  it('the same content after trimming counts as the same submission', async (t) => {
    if (!requireDB(t)) return;
    const first = await create(u.customerA, validBody(), KEY);
    const padded = await create(u.customerA, validBody({ subject: '  Invoice total is wrong  ' }), KEY);
    assert.deepEqual([first.status, padded.status], [201, 200]);
    assert.equal(padded.body.ticket.id, first.body.ticket.id);
  });

  it('keys are per user: another customer using the same key gets their own ticket', async (t) => {
    if (!requireDB(t)) return;
    const a = await create(u.customerA, validBody(), KEY);
    const b = await create(u.customerB, validBody(), KEY);
    assert.deepEqual([a.status, b.status], [201, 201]);
    assert.notEqual(a.body.ticket.id, b.body.ticket.id);
    assert.equal(b.body.ticket.createdBy.id, String(u.customerB._id));
  });

  it('rejects malformed keys with 400 INVALID_IDEMPOTENCY_KEY and creates nothing', async (t) => {
    if (!requireDB(t)) return;
    for (const key of ['', 'short', 'x'.repeat(129), 'has spaces in it', 'semi;colon-key', 'dotted.key.value', 'plus+slash/key']) {
      assertError(await create(u.customerA, validBody(), key), 400, 'INVALID_IDEMPOTENCY_KEY');
    }
    assert.equal(await Ticket.countDocuments(), 0);
    assert.equal(await TicketSubmission.countDocuments(), 0);
    // Bounds of the format: 8 and 128 characters, letters, digits, "-" and "_".
    assert.equal((await create(u.customerA, validBody(), 'aB3_-xYz')).status, 201);
    assert.equal((await create(u.customerA, validBody(), 'k'.repeat(128))).status, 201);
  });

  it('authorization still comes first: no token → 401, staff → 403, and no key is claimed', async (t) => {
    if (!requireDB(t)) return;
    assertError(await create(null, validBody(), KEY), 401, 'UNAUTHORIZED');
    assertError(await create(u.agent, validBody(), KEY), 403, 'FORBIDDEN');
    assertError(await create(u.admin, validBody(), KEY), 403, 'FORBIDDEN');
    assert.equal(await TicketSubmission.countDocuments(), 0);
    assert.equal(await Ticket.countDocuments(), 0);
  });

  it('a request that fails validation does not use up its key; the corrected retry creates the ticket', async (t) => {
    if (!requireDB(t)) return;
    assertError(await create(u.customerA, validBody({ subject: 'Hi' }), KEY), 400, 'VALIDATION_ERROR');
    assertError(await create(u.customerA, validBody({ categoryId: 'nope' }), KEY), 400, 'INVALID_ID');
    assertError(await create(u.customerA, validBody({ categoryId: String(c.retired._id) }), KEY), 400, 'VALIDATION_ERROR');
    assert.equal(await TicketSubmission.countDocuments(), 0, 'an inactive category releases the claim');
    assert.equal(await ticketSeq(), 0);
    const fixed = await create(u.customerA, validBody(), KEY);
    assert.equal(fixed.status, 201, JSON.stringify(fixed.body));
    assert.equal(await Ticket.countDocuments(), 1);
  });

  it('a retry still returns the original ticket after its category was deactivated', async (t) => {
    if (!requireDB(t)) return;
    const first = await create(u.customerA, validBody(), KEY);
    await c.billing.updateOne({ isActive: false });
    const again = await create(u.customerA, validBody(), KEY);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.ticket.id, first.body.ticket.id);
  });

  it('the browser may send the header cross-origin (CORS preflight allows it)', async () => {
    const res = await request(app)
      .options('/api/tickets')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,idempotency-key');
    assert.equal(res.status, 204);
    assert.match(res.headers['access-control-allow-headers'] ?? '', /idempotency-key/i);
  });

  describe('unfinished claims', () => {
    const saved = { ...submissionTiming };
    beforeEach(() => Object.assign(submissionTiming, { waitMs: 300, pollMs: 20 }));
    after(() => Object.assign(submissionTiming, saved));

    const fields = () => ({ subject: 'Invoice total is wrong', description: 'My October invoice charges me twice.', category: String(c.billing._id), priority: 'high' });
    const claimId = () => submissionId(u.customerA._id, KEY);
    // Seeds a claim whose request never inserted its ticket; returns the claim's ticket id.
    const insertClaim = async (ageMs) => {
      const ticket = new mongoose.Types.ObjectId();
      await TicketSubmission.collection.insertOne({
        _id: claimId(),
        ticket,
        fingerprint: requestFingerprint(fields()),
        createdAt: new Date(Date.now() - ageMs),
      });
      return String(ticket);
    };
    const claimTicket = async () => String((await TicketSubmission.findById(claimId()).lean())?.ticket);
    const staleNow = () => new Date(Date.now() - submissionTiming.staleMs - 1000);
    const createdNotices = () => Notification.countDocuments({ type: 'ticket_created' });
    const STAFF = 2; // the agent and the admin are notified of every new ticket

    it('while the first request is still creating the ticket, a repeat gets 409 IDEMPOTENCY_KEY_IN_USE', async (t) => {
      if (!requireDB(t)) return;
      await insertClaim(0);
      assertError(await create(u.customerA, validBody(), KEY), 409, 'IDEMPOTENCY_KEY_IN_USE');
      assert.equal(await Ticket.countDocuments(), 0);
    });

    it('an abandoned claim (older than the stale limit, no ticket) is taken over with the same ticket id', async (t) => {
      if (!requireDB(t)) return;
      const claimed = await insertClaim(submissionTiming.staleMs + 1000);
      const res = await create(u.customerA, validBody(), KEY);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.ticket.id, claimed, 'the claim keeps its ticket id (F1)');
      const again = await create(u.customerA, validBody(), KEY);
      assert.equal(again.status, 200);
      assert.equal(again.body.ticket.id, res.body.ticket.id);
      assert.equal(await Ticket.countDocuments(), 1);
      assert.equal(await TicketSubmission.countDocuments(), 1);
      assert.equal(await claimTicket(), claimed);
    });

    // F1 regression: the takeover used to replace the claim with a new ticket id, so a stalled
    // original that later finished created a second ticket.
    it('a stalled original that finishes after a takeover returns the same ticket: one ticket, one round of notices', async (t) => {
      if (!requireDB(t)) return;
      const realExists = Category.exists;
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      let arrived;
      const paused = new Promise((resolve) => { arrived = resolve; });
      let calls = 0;
      t.mock.method(Category, 'exists', async function exists(...args) {
        calls += 1;
        if (calls === 1) {
          arrived();
          await gate; // request A stops here, holding the claim, before inserting anything
        }
        return realExists.apply(this, args);
      });

      const a = create(u.customerA, validBody(), KEY).then((res) => res);
      await paused;
      const claimed = await claimTicket();
      // A's claim becomes stale (as if more than the stale limit had passed).
      await TicketSubmission.collection.updateOne({ _id: claimId() }, { $set: { createdAt: staleNow() } });

      const b = await create(u.customerA, validBody(), KEY);
      assert.equal(b.status, 201, JSON.stringify(b.body));
      assert.equal(b.body.ticket.id, claimed, 'the takeover inserts the claim’s own ticket id');
      assert.equal(await createdNotices(), STAFF);

      release();
      const resA = await a;
      assert.equal(resA.status, 200, JSON.stringify(resA.body));
      assert.equal(resA.headers['idempotent-replayed'], 'true');
      assert.equal(resA.body.ticket.id, b.body.ticket.id);
      assert.equal(resA.body.ticket.ticketNumber, b.body.ticket.ticketNumber);
      assert.equal(await Ticket.countDocuments(), 1);
      assert.equal(await createdNotices(), STAFF, 'the late original sends no second round of notices');
      assert.equal(await claimTicket(), claimed);
    });

    it('several retries racing to take over one stale claim create exactly one ticket, with the claim’s id', async (t) => {
      if (!requireDB(t)) return;
      const claimed = await insertClaim(submissionTiming.staleMs + 1000);
      const responses = await Promise.all(Array.from({ length: 6 }, () => create(u.customerA, validBody(), KEY)));
      assert.deepEqual(responses.map((res) => res.status).sort(), [200, 200, 200, 200, 200, 201], JSON.stringify(responses.map((res) => res.body)));
      assert.deepEqual([...new Set(responses.map((res) => res.body.ticket.id))], [claimed]);
      assert.equal(new Set(responses.map((res) => res.body.ticket.ticketNumber)).size, 1);
      assert.equal(await Ticket.countDocuments(), 1);
      assert.equal(await TicketSubmission.countDocuments(), 1);
      assert.equal(await createdNotices(), STAFF);
    });

    it('a takeover that fails before inserting keeps the claim (the original may still insert it)', async (t) => {
      if (!requireDB(t)) return;
      const claimed = await insertClaim(submissionTiming.staleMs + 1000);
      await c.billing.updateOne({ isActive: false });
      assertError(await create(u.customerA, validBody(), KEY), 400, 'VALIDATION_ERROR');
      assert.equal(await claimTicket(), claimed);
      assert.equal(await Ticket.countDocuments(), 0);
    });
  });

  // F3: Ticket.create may report an error although the ticket was written (network error,
  // write-concern timeout). The claim is kept, so a retry finds or inserts that same ticket.
  describe('failures while inserting the ticket', () => {
    const realCreate = Ticket.create;
    const claimId = () => submissionId(u.customerA._id, KEY);
    const createdNotices = () => Notification.countDocuments({ type: 'ticket_created' });
    // Ticket.create fails once with `error`, after writing the ticket when `persist` is true.
    function failInsertOnce(t, error, { persist }) {
      let failed = false;
      t.mock.method(Ticket, 'create', async function create(...args) {
        if (failed) return realCreate.apply(this, args);
        failed = true;
        if (persist) await realCreate.apply(this, args);
        throw error;
      });
    }
    const networkError = () => Object.assign(new Error('connection reset by peer'), { name: 'MongoNetworkError' });
    let quiet;
    beforeEach((t) => { quiet = t.mock?.method(console, 'error', () => {}); });
    after(() => quiet?.mock.restore());

    it('written but reported as failed: the claim stays, and the retry returns that ticket without a second one', async (t) => {
      if (!requireDB(t)) return;
      failInsertOnce(t, networkError(), { persist: true });
      const first = await create(u.customerA, validBody(), KEY);
      assert.equal(first.status, 500, JSON.stringify(first.body));
      const claim = await TicketSubmission.findById(claimId()).lean();
      assert.ok(claim, 'claim preserved');
      assert.equal(await Ticket.countDocuments(), 1);
      const notices = await createdNotices();

      const retry = await create(u.customerA, validBody(), KEY);
      assert.equal(retry.status, 200, JSON.stringify(retry.body));
      assert.equal(retry.headers['idempotent-replayed'], 'true');
      assert.equal(retry.body.ticket.id, String(claim.ticket));
      assert.equal(await Ticket.countDocuments(), 1);
      assert.equal(await createdNotices(), notices, 'no notices from the retry');
    });

    it('not written: the claim stays with its ticket id, and the retry creates that ticket at once', async (t) => {
      if (!requireDB(t)) return;
      failInsertOnce(t, networkError(), { persist: false });
      assert.equal((await create(u.customerA, validBody(), KEY)).status, 500);
      const claim = await TicketSubmission.findById(claimId()).lean();
      assert.ok(claim, 'claim preserved');
      assert.equal(await Ticket.countDocuments(), 0);

      const retry = await create(u.customerA, validBody(), KEY);
      assert.equal(retry.status, 201, JSON.stringify(retry.body));
      assert.equal(retry.body.ticket.id, String(claim.ticket), 'same ticket id, no stale-limit wait');
      assert.equal(await Ticket.countDocuments(), 1);
      assert.equal(await createdNotices(), 2);
    });

    it('an unrelated duplicate-key error (not the ticket id) is not treated as a replay', async (t) => {
      if (!requireDB(t)) return;
      const duplicateNumber = Object.assign(new Error('E11000 duplicate key error collection: tickets index: ticketNumber_1'), {
        code: 11000,
        keyPattern: { ticketNumber: 1 },
        keyValue: { ticketNumber: 'HD-1' },
      });
      failInsertOnce(t, duplicateNumber, { persist: false });
      assertError(await create(u.customerA, validBody(), KEY), 409, 'DUPLICATE');
      assert.equal(await Ticket.countDocuments(), 0);
      assert.ok(await TicketSubmission.findById(claimId()).lean(), 'claim preserved');
      assert.equal((await create(u.customerA, validBody(), KEY)).status, 201);
      assert.equal(await Ticket.countDocuments(), 1);
    });
  });
});
