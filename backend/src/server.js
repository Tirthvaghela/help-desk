import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';
import { checkCategoryIndex } from './utils/categoryNameConflicts.js';

try {
  await connectDB(env.mongodbUri);
} catch (err) {
  console.error(`Could not connect to MongoDB: ${err.message}`);
  process.exit(1);
}
// Not awaited, and never stops the server: without the index the API still works and still
// refuses duplicate names before saving; only two simultaneous creates could slip through.
// Refusing to start would take the whole help desk down over one admin-only edge case.
// The outcome (ready / conflicts / failed) is logged when the build finishes.
checkCategoryIndex().catch((err) =>
  console.error(`The category name index could not be checked, so it may NOT be in place: ${err.message}`),
);

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
