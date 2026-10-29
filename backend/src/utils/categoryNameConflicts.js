import { Category, CATEGORY_NAME_COLLATION } from '../models/Category.js';

// Category names must be unique ignoring case, enforced by a unique index with the same
// collation. That index cannot be built while existing names already clash ("Billing" and
// "billing"), so these helpers find and describe such clashes. Read-only: nothing is
// changed, merged or deleted; an admin decides what to rename.

// [{ names: ['Billing', 'billing'], ids: ['…', '…'] }], one entry per clashing name.
// `model` is replaceable for tests only.
export async function findCategoryNameConflicts(model = Category) {
  const groups = await model.aggregate([
    { $sort: { _id: 1 } },
    { $group: { _id: '$name', names: { $push: '$name' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
  ]).collation(CATEGORY_NAME_COLLATION);
  return groups.map((group) => ({ names: group.names, ids: group.ids.map(String) }));
}

// True when `indexes` (from collection.indexes()) has the unique, case-insensitive name index.
export function hasCategoryNameIndex(indexes) {
  return indexes.some(
    (index) =>
      index.unique === true &&
      Object.keys(index.key ?? {}).join() === 'name' &&
      index.collation?.locale === CATEGORY_NAME_COLLATION.locale &&
      index.collation?.strength === CATEGORY_NAME_COLLATION.strength,
  );
}

// For server startup. Mongoose builds the index in the background (autoIndex) and, when it
// fails, only emits an event nobody hears: the server would run without the index. This
// waits for that build and reports one of:
//   { status: 'ready' }                    the index exists (checked, not assumed)
//   { status: 'conflicts', conflicts }     names differing only in case block it
//   { status: 'failed', reason }           anything else; the index is NOT in place
// Only 'ready' is logged as ready. The server keeps running either way (see server.js).
// `model` is replaceable for tests only.
export async function checkCategoryIndex({ model = Category, info = console.log, error = console.error } = {}) {
  const notBuilt = 'The category name index is NOT in place: category names are only checked before saving,';
  try {
    await model.init();
  } catch (err) {
    if (err?.code === 11000) {
      const conflicts = await findCategoryNameConflicts(model);
      if (conflicts.length > 0) {
        error(describeCategoryNameConflicts(conflicts));
        return { status: 'conflicts', conflicts };
      }
      // The names clashed when the build ran but no longer do (renamed meanwhile).
      const reason = 'duplicate names when the index was built, none now';
      error(`${notBuilt} so simultaneous duplicates are possible (${reason}). Restart the server or run \`npm run seed:categories\` to build it.`);
      return { status: 'failed', reason };
    }
    const reason = err?.message ?? String(err);
    error(`${notBuilt} so simultaneous duplicates are possible. Index build error: ${reason}`);
    return { status: 'failed', reason };
  }

  // init() also succeeds when autoIndex is off, without building anything: look, don't assume.
  if (!hasCategoryNameIndex(await model.collection.indexes())) {
    const reason = 'index missing after startup (is autoIndex disabled?)';
    error(`${notBuilt} so simultaneous duplicates are possible (${reason}). Run \`npm run seed:categories\` to build it.`);
    return { status: 'failed', reason };
  }
  info('Category name index ready (unique, case-insensitive).');
  return { status: 'ready' };
}

// Text for logs and scripts: what clashes, and how to fix it.
export function describeCategoryNameConflicts(conflicts) {
  const lines = conflicts.map(
    (conflict) => `  - ${conflict.names.map((name, i) => `"${name}" (id ${conflict.ids[i]})`).join(', ')}`,
  );
  return [
    `Category names must be unique ignoring case, but ${conflicts.length} name${conflicts.length === 1 ? ' is' : 's are'} used more than once:`,
    ...lines,
    'The unique index on category names cannot be built until these are resolved. Rename all but one in each',
    'group (admin dashboard → Categories, or PATCH /api/admin/categories/:id), then run `npm run seed:categories`',
    'or restart the server. Nothing has been changed automatically.',
  ].join('\n');
}
