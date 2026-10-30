// Adds the default ticket categories to a database that is missing them.
//
//   npm run seed:categories                 (local database from MONGODB_URI)
//   npm run seed:categories -- --allow-remote
//
// Safe to run again: a category is only inserted when no category with the same name
// (ignoring case) exists. Existing categories, including deactivated ones, are never
// changed. Admins manage categories afterwards in the admin dashboard.
// If existing names already differ only in case, it lists them and stops (exit 1) without
// writing anything, since the unique name index could not be built.
import mongoose from 'mongoose';
import { requireSafeTarget } from './lib/target.js';
import { Category, CATEGORY_NAME_COLLATION } from '../src/models/Category.js';
import { describeCategoryNameConflicts, findCategoryNameConflicts } from '../src/utils/categoryNameConflicts.js';
import { DEFAULT_CATEGORIES } from './lib/categories.js';

const uri = requireSafeTarget(process.argv.slice(2));
// autoIndex off: the index is built below, only after checking that it can be.
await mongoose.connect(uri, { autoIndex: false });
try {
  // Names that differ only in case would make the unique index fail to build. List them
  // and stop before writing anything.
  const conflicts = await findCategoryNameConflicts();
  if (conflicts.length > 0) {
    console.error(describeCategoryNameConflicts(conflicts));
    process.exitCode = 1;
  } else {
    // Builds the case-insensitive unique name index if it is missing. Unlike syncIndexes(),
    // this never drops an index, so running the seed cannot remove anything from the database.
    await Category.createIndexes();
    let added = 0;
    for (const category of DEFAULT_CATEGORIES) {
      const exists = await Category.exists({ name: category.name }).collation(CATEGORY_NAME_COLLATION);
      if (exists) {
        console.log(`  kept    ${category.name}`);
        continue;
      }
      await Category.create(category);
      added += 1;
      console.log(`  added   ${category.name}`);
    }
    const active = await Category.countDocuments({ isActive: true });
    console.log(`Done: ${added} added, ${active} active categor${active === 1 ? 'y' : 'ies'} in total.`);
  }
} finally {
  await mongoose.disconnect();
}
