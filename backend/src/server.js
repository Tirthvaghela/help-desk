import mongoose from 'mongoose';
import { env } from './config/env.js';
import { describeConfig } from './config/envRules.js';
import { connectDB, describeDBError } from './config/db.js';
import app from './app.js';
import { checkCategoryIndex } from './utils/categoryNameConflicts.js';
import { startServer } from './startServer.js';
import { waitForPendingEmails } from './services/email.js';

// Within the 10 s shutdown limit, emails still being sent get up to 5 s; any left are reported.
const EMAIL_DRAIN_MS = 5_000;
async function drainEmails() {
  const result = await waitForPendingEmails(EMAIL_DRAIN_MS);
  if (!result.settled) console.error(`Shutdown: ${result.pending} email(s) still being sent were abandoned.`);
}

// What this server will use, without the connection string or any secret.
for (const line of describeConfig(env)) console.log(line);

try {
  await connectDB(env.mongodbUri);
} catch (err) {
  console.error(`Could not connect to MongoDB: ${describeDBError(err)}`);
  process.exit(1);
}
// Not awaited, and never stops the server: without the index the API still works and still
// refuses duplicate names before saving; only two simultaneous creates could slip through.
// Refusing to start would take the whole help desk down over one admin-only edge case.
// The outcome (ready / conflicts / failed) is logged when the build finishes.
checkCategoryIndex().catch((err) =>
  console.error(`The category name index could not be checked, so it may NOT be in place: ${err.message}`),
);

// Reports a port that cannot be opened, and shuts down cleanly on SIGTERM / SIGINT.
startServer(app, { port: env.port, drain: drainEmails, disconnect: () => mongoose.disconnect() });
