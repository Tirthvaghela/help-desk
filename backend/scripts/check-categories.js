// Read-only check, e.g. before deploying: are there category names that differ only in case?
// Such names stop the unique name index from being built (the server then starts without it).
//
//   npm run check:categories          (database from MONGODB_URI; remote databases allowed)
//
// Exit 0: no conflicts. Exit 1: conflicts listed with their ids. Nothing is ever written, and
// no index is created or dropped.
import mongoose from 'mongoose';
import { requireSafeTarget } from './lib/target.js';
import { describeCategoryNameConflicts, findCategoryNameConflicts } from '../src/utils/categoryNameConflicts.js';

const uri = requireSafeTarget(process.argv.slice(2), { readOnly: true });
await mongoose.connect(uri, { autoIndex: false });
try {
  const conflicts = await findCategoryNameConflicts();
  if (conflicts.length > 0) {
    console.error(describeCategoryNameConflicts(conflicts));
    process.exitCode = 1;
  } else {
    console.log('No conflicting category names: the unique name index can be built.');
  }
} finally {
  await mongoose.disconnect();
}
