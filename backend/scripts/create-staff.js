// Creates an agent or admin account, e.g. the first admin of a new database (sign-up only
// creates customers). After that, admins can promote users in the admin dashboard.
//
//   STAFF_ROLE=admin STAFF_NAME="Ada Admin" STAFF_EMAIL=ada@example.com STAFF_PASSWORD=... \
//     npm run create:staff            (add -- --allow-remote for a remote database)
//
// The password is read from the environment, never from the command line, and is never
// printed. An existing email is never overwritten.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { requireSafeTarget } from './lib/target.js';
import { User } from '../src/models/User.js';
import { EMAIL_PATTERN } from '../src/utils/validate.js';
import { hashPassword } from '../src/utils/password.js';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const role = process.env.STAFF_ROLE;
const name = process.env.STAFF_NAME?.trim();
const email = process.env.STAFF_EMAIL?.trim().toLowerCase();
const password = process.env.STAFF_PASSWORD?.trim();

if (!['agent', 'admin'].includes(role)) fail('STAFF_ROLE must be agent or admin.');
if (!name || name.length < 2 || name.length > 80) fail('STAFF_NAME must be 2–80 characters.');
if (!email || !EMAIL_PATTERN.test(email)) fail('STAFF_EMAIL must be a valid email address.');
if (!password || password.length < 8) fail('STAFF_PASSWORD must be at least 8 characters.');
if (bcrypt.truncates(password)) fail('STAFF_PASSWORD must be at most 72 bytes.');

const uri = requireSafeTarget(process.argv.slice(2));
await mongoose.connect(uri);
try {
  if (await User.exists({ email })) {
    fail(`Not created: ${email} already exists.`);
  }
  await User.create({ name, email, role, isActive: true, passwordHash: await hashPassword(password) });
  console.log(`Created ${role}: ${email}`);
} finally {
  await mongoose.disconnect();
}
