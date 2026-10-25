import mongoose from 'mongoose';

// Database helpers for tests that need MongoDB.
// Every function refuses to run unless the database name ends in "_test",
// so a misconfigured URI can never modify development or production data.

function assertTestDatabase() {
  const name = mongoose.connection.name;
  if (!name || !name.endsWith('_test')) {
    throw new Error(`Refusing to use database "${name}" in tests: name must end with "_test"`);
  }
}

// Returns true when connected, false when MongoDB is not reachable.
// With REQUIRE_TEST_DB=1 (set in CI), an unreachable database throws instead,
// so database tests fail rather than being skipped.
export async function connectTestDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
  } catch (err) {
    await mongoose.disconnect();
    if (process.env.REQUIRE_TEST_DB === '1') {
      // Mask any username/password so they never appear in test output or CI logs.
      const uri = process.env.MONGODB_URI.replace(/\/\/[^@/]+@/, '//***@');
      throw new Error(`REQUIRE_TEST_DB=1 but the test database is not reachable at ${uri}: ${err.message}`);
    }
    return false;
  }
  try {
    assertTestDatabase();
  } catch (err) {
    await mongoose.disconnect();
    throw err;
  }
  return true;
}

// Removes all data so each test starts from an empty database.
export async function clearTestDB() {
  assertTestDatabase();
  await mongoose.connection.dropDatabase();
}

export async function disconnectTestDB() {
  await mongoose.disconnect();
}
