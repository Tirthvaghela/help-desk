import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Category } from '../src/models/Category.js';
import { checkCategoryIndex, describeCategoryNameConflicts, findCategoryNameConflicts } from '../src/utils/categoryNameConflicts.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';

// Category names that differ only in case stop the unique name index from being built.
// The preflight finds them (read-only), seed:categories refuses to continue, check:categories
// reports them, and server startup logs them instead of running silently without the index.

let connected = false;

before(async () => {
  connected = await connectTestDB();
});

beforeEach(async () => {
  if (!connected) return;
  await resetTestDB();
  // An index that is not in the schema: must survive every script (no syncIndexes()).
  await Category.collection.createIndex({ isActive: 1, createdAt: -1 }, { name: 'custom_ops_index' });
});

after(async () => {
  if (connected) await clearTestDB();
  await disconnectTestDB();
});

function requireDB(testContext) {
  if (!connected) testContext.skip('MongoDB is not reachable at MONGODB_URI_TEST');
  return connected;
}

// Data from before the index existed: drop it, then insert directly.
async function insertLegacyCategories(names) {
  await Category.collection.dropIndex('name_1');
  const { insertedIds } = await Category.collection.insertMany(names.map((name) => ({ name, isActive: true, description: '' })));
  return Object.values(insertedIds).map(String);
}

const backendDir = new URL('..', import.meta.url);
function run(args) {
  return spawnSync(process.execPath, args, {
    cwd: backendDir,
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
  });
}
const indexNames = async () => (await Category.collection.indexes()).map((index) => index.name).sort();

describe('category name conflicts', () => {
  it('finds names that differ only in case, with every id; distinct names are not conflicts', async (t) => {
    if (!requireDB(t)) return;
    const [billing, lower, upper, refunds, other] = await insertLegacyCategories(['Billing', 'billing', 'BILLING', 'Refunds', 'Other']);
    await Category.collection.insertOne({ name: 'refunds', isActive: false, description: '' });

    const conflicts = await findCategoryNameConflicts();
    assert.equal(conflicts.length, 2);
    const billingGroup = conflicts.find((c) => c.names.includes('Billing'));
    assert.deepEqual([...billingGroup.ids].sort(), [billing, lower, upper].sort());
    assert.deepEqual([...billingGroup.names].sort(), ['BILLING', 'Billing', 'billing']);
    assert.ok(conflicts.find((c) => c.names.includes('Refunds')).ids.includes(refunds));
    assert.ok(!conflicts.some((c) => c.ids.includes(other)));

    const text = describeCategoryNameConflicts(conflicts);
    assert.match(text, /2 names are used more than once/);
    assert.ok(text.includes(`"billing" (id ${lower})`));
    assert.match(text, /Rename all but one/);
    assert.match(text, /Nothing has been changed automatically/);
  });

  it('reports no conflicts for a clean collection', async (t) => {
    if (!requireDB(t)) return;
    await Category.create([{ name: 'Billing' }, { name: 'Refunds' }]);
    assert.deepEqual(await findCategoryNameConflicts(), []);
  });

  it('seed:categories stops before writing when names clash, and keeps every existing index', async (t) => {
    if (!requireDB(t)) return;
    const ids = await insertLegacyCategories(['Billing', 'billing']);
    const before = await indexNames();

    const result = run(['scripts/seed-categories.js']);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(ids.every((id) => result.stderr.includes(id)), result.stderr);
    assert.equal(await Category.countDocuments(), 2, 'no default categories were added');
    assert.deepEqual(await indexNames(), before, 'no index created or dropped');
  });

  it('seed:categories on a clean database builds the name index, adds defaults and keeps other indexes', async (t) => {
    if (!requireDB(t)) return;
    await Category.collection.dropIndex('name_1');

    const result = run(['scripts/seed-categories.js']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await Category.countDocuments(), 4);
    assert.deepEqual(await indexNames(), ['_id_', 'custom_ops_index', 'name_1']);
  });

  it('check:categories is read-only: exit 1 with the conflicts, exit 0 when clean', async (t) => {
    if (!requireDB(t)) return;
    const ids = await insertLegacyCategories(['General Inquiry', 'general inquiry']);
    const before = await indexNames();

    const conflict = run(['scripts/check-categories.js']);
    assert.equal(conflict.status, 1, conflict.stderr);
    assert.ok(ids.every((id) => conflict.stderr.includes(id)));
    assert.match(conflict.stdout, /read-only/);
    assert.deepEqual(await indexNames(), before);
    assert.equal(await Category.countDocuments(), 2);

    await Category.collection.deleteOne({ name: 'general inquiry' });
    const clean = run(['scripts/check-categories.js']);
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /No conflicting category names/);
  });

  // Startup as server.js runs it, in a fresh process (the model builds its index once per process).
  const startupScript = [
    "const { default: mongoose } = await import('mongoose');",
    "const { checkCategoryIndex } = await import('./src/utils/categoryNameConflicts.js');",
    'await mongoose.connect(process.env.MONGODB_URI);',
    'const result = await checkCategoryIndex();',
    'console.log(`status=${result.status}`);',
    'await mongoose.disconnect();',
  ].join('\n');

  it('server startup reports conflicts (not "ready") instead of silently running without the index', async (t) => {
    if (!requireDB(t)) return;
    const ids = await insertLegacyCategories(['Billing', 'billing']);

    const result = run(['--input-type=module', '-e', startupScript]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /status=conflicts/);
    assert.doesNotMatch(result.stdout, /index ready/);
    assert.ok(ids.every((id) => result.stderr.includes(id)), result.stderr);
    assert.ok(!(await indexNames()).includes('name_1'), 'the index is still missing; nothing was changed');
  });

  it('server startup on a clean collection builds the index and only then reports ready', async (t) => {
    if (!requireDB(t)) return;
    await Category.collection.dropIndex('name_1');

    const result = run(['--input-type=module', '-e', startupScript]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Category name index ready/);
    assert.match(result.stdout, /status=ready/);
    assert.equal(result.stderr, '');
    assert.ok((await indexNames()).includes('name_1'));
  });
});

// checkCategoryIndex outcomes with a stand-in model: no database involved.
describe('checkCategoryIndex results', () => {
  const NAME_INDEX = { name: 'name_1', key: { name: 1 }, unique: true, collation: { locale: 'en', strength: 2, caseLevel: false } };
  function fakeModel({ initError, conflicts = [], indexes = [{ name: '_id_', key: { _id: 1 } }, NAME_INDEX] } = {}) {
    return {
      init: async () => {
        if (initError) throw initError;
      },
      aggregate: () => ({
        collation: async () => conflicts.map((c) => ({ _id: c.names[0], names: c.names, ids: c.ids, count: c.names.length })),
      }),
      collection: { indexes: async () => indexes },
    };
  }
  async function check(options) {
    const logs = { info: [], error: [] };
    const result = await checkCategoryIndex({
      model: fakeModel(options),
      info: (text) => logs.info.push(text),
      error: (text) => logs.error.push(text),
    });
    return { result, logs };
  }
  const duplicateKey = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

  it('ready only when init succeeded and the unique case-insensitive index exists', async () => {
    const { result, logs } = await check();
    assert.deepEqual(result, { status: 'ready' });
    assert.match(logs.info.join(), /index ready/);
    assert.deepEqual(logs.error, []);
  });

  it('conflicts: lists the clashing names and ids, never says ready', async () => {
    const conflicts = [{ names: ['Billing', 'billing'], ids: ['a1', 'b2'] }];
    const { result, logs } = await check({ initError: duplicateKey, conflicts });
    assert.equal(result.status, 'conflicts');
    assert.deepEqual(result.conflicts, conflicts);
    assert.match(logs.error.join(), /"billing" \(id b2\)/);
    assert.deepEqual(logs.info, []);
  });

  it('a duplicate-key failure whose conflicts are gone is a failure, not "0 names clash"', async () => {
    const { result, logs } = await check({ initError: duplicateKey, conflicts: [] });
    assert.equal(result.status, 'failed');
    assert.match(logs.error.join(), /NOT in place/);
    assert.doesNotMatch(logs.error.join(), /0 names/);
    assert.deepEqual(logs.info, []);
  });

  it('any other build error is a failure that says the index is not in place', async () => {
    const optionsConflict = Object.assign(new Error('An existing index has the same name with different options'), { code: 85 });
    const { result, logs } = await check({ initError: optionsConflict });
    assert.deepEqual(result, { status: 'failed', reason: optionsConflict.message });
    assert.match(logs.error.join(), /NOT in place.*different options/);
    assert.deepEqual(logs.info, []);
  });

  it('init succeeding without the index (autoIndex off, or the wrong index) is a failure', async () => {
    const caseSensitive = { name: 'name_1', key: { name: 1 }, unique: true };
    const notUnique = { ...NAME_INDEX, unique: undefined };
    for (const indexes of [[{ name: '_id_', key: { _id: 1 } }], [caseSensitive], [notUnique]]) {
      const { result, logs } = await check({ indexes });
      assert.equal(result.status, 'failed', JSON.stringify(indexes));
      assert.match(logs.error.join(), /NOT in place/);
      assert.deepEqual(logs.info, []);
    }
  });

  it('an unexpected error in the check itself rejects, so server.js logs that the index may be missing', async () => {
    const broken = { ...fakeModel(), init: async () => { throw duplicateKey; }, aggregate: () => ({ collation: async () => { throw new Error('connection lost'); } }) };
    await assert.rejects(checkCategoryIndex({ model: broken, info() {}, error() {} }), /connection lost/);
  });
});
