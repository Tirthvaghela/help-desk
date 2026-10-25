import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ApiError } from '../src/utils/ApiError.js';
import { requireEligibleAssignee } from '../src/utils/ticketAssign.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createUser } from './helpers/factories.js';

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

function requireDB(t) {
  if (!connected) t.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

async function assertNotEligible(promise) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.message, 'assignedTo must be an active agent or admin');
    return true;
  });
}

describe('requireEligibleAssignee (D-2)', () => {
  it('accepts active agents and admins and returns the user', async (t) => {
    if (!requireDB(t)) return;
    const agent = await createUser({ role: 'agent' });
    const admin = await createUser({ role: 'admin' });

    assert.ok((await requireEligibleAssignee(String(agent._id)))._id.equals(agent._id));
    assert.ok((await requireEligibleAssignee(String(admin._id)))._id.equals(admin._id));
  });

  it('returns null when unassigning', async (t) => {
    if (!requireDB(t)) return;
    assert.equal(await requireEligibleAssignee(null), null);
  });

  it('rejects customers', async (t) => {
    if (!requireDB(t)) return;
    const customer = await createUser({ role: 'customer' });
    await assertNotEligible(requireEligibleAssignee(String(customer._id)));
  });

  it('rejects deactivated agents and admins', async (t) => {
    if (!requireDB(t)) return;
    const agent = await createUser({ role: 'agent', isActive: false });
    const admin = await createUser({ role: 'admin', isActive: false });
    await assertNotEligible(requireEligibleAssignee(String(agent._id)));
    await assertNotEligible(requireEligibleAssignee(String(admin._id)));
  });

  it('rejects an id that matches no user with 400, not 404', async (t) => {
    if (!requireDB(t)) return;
    await createUser({ role: 'agent' });
    await assertNotEligible(requireEligibleAssignee(new mongoose.Types.ObjectId().toString()));
  });

  it('refuses undefined instead of matching any agent', async (t) => {
    if (!requireDB(t)) return;
    await createUser({ role: 'agent' });
    await assert.rejects(requireEligibleAssignee(undefined), /needs an id or null/);
  });
});
