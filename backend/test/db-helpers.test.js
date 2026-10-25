import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectTestDB, disconnectTestDB } from './helpers/db.js';

// Nothing listens on port 1, so connections fail quickly.
const UNREACHABLE_URI = 'mongodb://127.0.0.1:1/helpdesk_test';
const original = {
  MONGODB_URI: process.env.MONGODB_URI,
  REQUIRE_TEST_DB: process.env.REQUIRE_TEST_DB,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('connectTestDB with an unreachable database', () => {
  afterEach(async () => {
    restoreEnv();
    await disconnectTestDB();
  });

  it('returns false when strict mode is off', async () => {
    process.env.MONGODB_URI = UNREACHABLE_URI;
    delete process.env.REQUIRE_TEST_DB;

    assert.equal(await connectTestDB(), false);
    assert.equal(mongoose.connection.readyState, 0);
  });

  it('throws a clear error when REQUIRE_TEST_DB=1', async () => {
    process.env.MONGODB_URI = UNREACHABLE_URI;
    process.env.REQUIRE_TEST_DB = '1';

    await assert.rejects(connectTestDB(), /REQUIRE_TEST_DB=1 but the test database is not reachable/);
    assert.equal(mongoose.connection.readyState, 0);
  });

  it('does not include credentials from the URI in the error', async () => {
    process.env.MONGODB_URI = 'mongodb://ci-user:s3cret-pass@127.0.0.1:1/helpdesk_test';
    process.env.REQUIRE_TEST_DB = '1';

    await assert.rejects(connectTestDB(), (err) => {
      assert.ok(!err.message.includes('s3cret-pass'));
      assert.ok(!err.message.includes('ci-user'));
      assert.match(err.message, /mongodb:\/\/\*\*\*@127\.0\.0\.1:1\/helpdesk_test/);
      return true;
    });
  });
});

describe('connectTestDB safety guard', () => {
  afterEach(async () => {
    restoreEnv();
    await disconnectTestDB();
  });

  it('refuses a database whose name does not end in "_test"', async (t) => {
    // Only the database name changes; host and port stay those of the test server.
    const url = new URL(original.MONGODB_URI);
    url.pathname = '/helpdesk';
    process.env.MONGODB_URI = url.toString();

    let refused;
    try {
      const connected = await connectTestDB();
      if (!connected) {
        t.skip('MongoDB is not reachable, so the name guard cannot be exercised');
        return;
      }
    } catch (err) {
      refused = err;
    }

    assert.match(refused?.message ?? '', /Refusing to use database "helpdesk"/);
    assert.equal(mongoose.connection.readyState, 0);
  });
});
