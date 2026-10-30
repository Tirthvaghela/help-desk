// Adds the demo data (staff, customers, categories, tickets with replies) to a LOCAL
// development or test database, for presentations. See README "Demo data".
//
//   MONGODB_URI=mongodb://127.0.0.1:27017/helpdesk_demo npm run seed:demo
//   PowerShell: $env:MONGODB_URI='mongodb://127.0.0.1:27017/helpdesk_demo'; npm run seed:demo
//
// Refuses any remote database (there is no override), any database whose name does not end
// in _demo, _dev or _test, and NODE_ENV=production. Insert-only and safe to re-run: existing
// records are kept unchanged. Every demo account gets the demo-only password from
// DEMO_PASSWORD, or HelpDeskDemo!2026 when it is not set; it is never printed.
import mongoose from 'mongoose';
import { requireDemoTarget } from './lib/target.js';
import { DEMO_PASSWORD, DemoSeedError, seedDemo, validateDemoPassword } from './lib/demoData.js';

const password = process.env.DEMO_PASSWORD?.trim() || DEMO_PASSWORD;
const problem = validateDemoPassword(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const uri = requireDemoTarget();
await mongoose.connect(uri);
try {
  const summary = await seedDemo({ password, log: console.log });
  const total = (kind) => `${summary[kind].added} added, ${summary[kind].kept} kept`;
  console.log(
    `Done. Users: ${total('users')}. Categories: ${total('categories')}. Tickets: ${total('tickets')}. Replies: ${total('comments')}.`,
  );
} catch (err) {
  if (!(err instanceof DemoSeedError)) throw err;
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
