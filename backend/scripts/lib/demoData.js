import bcrypt from 'bcryptjs';
import { User } from '../../src/models/User.js';
import { Category, CATEGORY_NAME_COLLATION } from '../../src/models/Category.js';
import { Ticket } from '../../src/models/Ticket.js';
import { TicketComment } from '../../src/models/TicketComment.js';
import { nextTicketNumber } from '../../src/models/Counter.js';
import { hashPassword } from '../../src/utils/password.js';
import { computeDueAt, readSlaPolicy } from '../../src/utils/sla.js';
import { DEFAULT_CATEGORIES } from './categories.js';

// Demo data for presentations (`npm run seed:demo`): a small, consistent Help Desk with
// staff, customers, and tickets in every status. Insert-only and safe to re-run: records are
// matched by email (users), name (categories), customer + subject (tickets) and ticket +
// author + message (comments); anything that already exists is kept exactly as it is.
// Names are fictional and emails use the reserved example.com domain.

// Demo-only password for every demo account (README "Demo data"). Never use it elsewhere.
export const DEMO_PASSWORD = 'HelpDeskDemo!2026';

export const DEMO_USERS = Object.freeze([
  { key: 'admin', name: 'Meera Iyer', email: 'admin.demo@example.com', role: 'admin' },
  { key: 'arjun', name: 'Arjun Mehta', email: 'arjun.agent.demo@example.com', role: 'agent' },
  { key: 'sara', name: 'Sara Thomas', email: 'sara.agent.demo@example.com', role: 'agent' },
  { key: 'rohan', name: 'Rohan Kapoor', email: 'rohan.demo@example.com', role: 'customer' },
  { key: 'ananya', name: 'Ananya Rao', email: 'ananya.demo@example.com', role: 'customer' },
  { key: 'daniel', name: 'Daniel Fernandes', email: 'daniel.demo@example.com', role: 'customer' },
]);

// Times are hours before the seed runs. `started`/`resolved` are the status changes, made by
// the assignee (D-10: in-progress and resolved tickets always have one). `assigned` is only
// needed for an open ticket that already has an assignee. With the default SLA targets
// (24 / 72 / 168 h) the tickets show every SLA state when seeded: due (1, 2, 5), due soon (3),
// overdue (4), missed (6) and met (7).
export const DEMO_TICKETS = Object.freeze([
  {
    customer: 'rohan',
    category: 'Account & Login',
    priority: 'high',
    subject: 'Locked out after resetting my password',
    description:
      'I reset my password this morning using the emailed link, but signing in with the new password says the email or password is incorrect. I have tried twice and I am worried the account will be locked. I need access today to approve my team’s requests.',
    opened: 5,
  },
  {
    customer: 'ananya',
    category: 'Billing',
    priority: 'medium',
    subject: 'Charged twice for the October subscription',
    description:
      'My card statement shows two charges of INR 1,499 on 1 October for the same subscription, but only one invoice appears on the billing page. Please refund the duplicate charge.',
    opened: 26,
  },
  {
    customer: 'daniel',
    category: 'Technical Support',
    priority: 'medium',
    subject: 'Mobile app closes immediately after login',
    description:
      'Since updating the Android app to version 4.2 yesterday, it closes as soon as I sign in. The website works normally with the same account. Phone: Pixel 7, Android 14.',
    opened: 60,
    assignee: 'sara',
    assigned: 50,
  },
  {
    customer: 'daniel',
    category: 'Technical Support',
    priority: 'high',
    subject: 'Exporting the monthly report to PDF fails',
    description:
      'When I export the September usage report to PDF, the page shows "Something went wrong" after about ten seconds. CSV export works. Our finance team needs the PDF by Friday.',
    opened: 72,
    assignee: 'arjun',
    started: 70,
    comments: [
      {
        by: 'arjun',
        at: 69,
        message:
          'Thanks, Daniel. I can reproduce this with reports longer than 50 pages and have raised it with our engineering team. As a workaround, exporting one month at a time works. I will update you here.',
      },
      {
        by: 'daniel',
        at: 66,
        message: 'Exporting one month at a time works for now, thank you. Please let me know when the full export is fixed.',
      },
    ],
  },
  {
    customer: 'rohan',
    category: 'General Inquiry',
    priority: 'low',
    subject: 'How do I add a teammate to our account?',
    description:
      'A new colleague joins our team next week. How can I give them access to our support tickets without sharing my own login?',
    opened: 50,
    assignee: 'sara',
    started: 46,
    comments: [
      {
        by: 'sara',
        at: 45,
        message:
          'Hi Rohan, shared team accounts are on our roadmap. For now your colleague can sign up with their own email and raise tickets themselves. I am checking whether we can link the two accounts and will confirm by tomorrow.',
      },
    ],
  },
  {
    customer: 'ananya',
    category: 'Billing',
    priority: 'medium',
    subject: 'Refund not received after cancelling my plan',
    description:
      'I cancelled my annual plan on 2 October and was told the refund would arrive within 5 to 7 working days. It has now been 9 working days and I have not received it.',
    opened: 192,
    assignee: 'arjun',
    started: 190,
    resolved: 110,
    comments: [
      {
        by: 'arjun',
        at: 189,
        message:
          'Hi Ananya, I checked with our payments team: the refund was issued on 4 October but was returned because the card on file had expired. We have re-issued it to your bank account today.',
      },
      { by: 'ananya', at: 115, message: 'The refund has arrived in my bank account. Thank you for sorting this out.' },
      { by: 'arjun', at: 111, message: 'Glad to hear it. I will mark this ticket as resolved.' },
    ],
  },
  {
    customer: 'daniel',
    category: 'Account & Login',
    priority: 'low',
    subject: 'Change the email address on my account',
    description:
      'I am moving to a new work email address. How do I change the email I sign in with without losing my ticket history?',
    opened: 240,
    assignee: 'sara',
    started: 238,
    resolved: 236,
    comments: [
      {
        by: 'sara',
        at: 237,
        message:
          'Hi Daniel, go to Profile, then Account security, then Change email. We send a confirmation link to the new address, and your tickets stay on your account. I will close this ticket, but reply here if you need anything else.',
      },
    ],
  },
]);

// Users and categories date from before the oldest ticket.
const SETUP_HOURS_AGO = 24 * 14;

// The seed cannot continue without changing existing data (e.g. a demo email already
// belongs to an account with another role). Nothing has been written when it is thrown.
export class DemoSeedError extends Error {}

export function validateDemoPassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'The demo password must be at least 8 characters.';
  if (bcrypt.truncates(password)) return 'The demo password must be at most 72 bytes.';
  return null;
}

// Seeds the demo data into the connected database. Returns what was added and kept:
//   { users, categories, tickets, comments } each { added, kept }, plus `records` for printing.
// `slaSource`: where SLA_HOURS_* come from (process.env, which includes backend/.env), so demo
// due dates follow the same targets as the API. Invalid values stop the seed before any write.
export async function seedDemo({ password = DEMO_PASSWORD, now = new Date(), log = () => {}, slaSource = process.env } = {}) {
  const problem = validateDemoPassword(password);
  if (problem) throw new DemoSeedError(problem);
  const sla = readSlaPolicy(slaSource);
  if (sla.errors.length > 0) throw new DemoSeedError(`Not seeded: ${sla.errors.join('; ')}.`);
  const hoursAgo = (hours) => new Date(now.getTime() - hours * 3600 * 1000);
  const summary = { users: counts(), categories: counts(), tickets: counts(), comments: counts(), records: [] };
  const setupAt = hoursAgo(SETUP_HOURS_AGO);

  // Checked before any write: a demo email that belongs to an account with another role.
  const existing = await User.find({ email: { $in: DEMO_USERS.map((user) => user.email) } }).select('email role');
  const clashes = existing.filter((user) => DEMO_USERS.find((demo) => demo.email === user.email).role !== user.role);
  if (clashes.length > 0) {
    throw new DemoSeedError(
      `Not seeded: ${clashes.map((user) => `${user.email} already exists as ${user.role}`).join('; ')}. Nothing was changed.`,
    );
  }

  // One line per record for the command line: "added" or "kept", then what it is.
  const note = (kind, added, text) => {
    summary[kind][added ? 'added' : 'kept'] += 1;
    const line = `${added ? 'added' : 'kept '}  ${text}`;
    summary.records.push(line);
    log(`  ${line}`);
  };

  const users = {};
  for (const demo of DEMO_USERS) {
    let user = await User.findOne({ email: demo.email });
    const added = !user;
    if (added) {
      [user] = await User.create(
        [{ name: demo.name, email: demo.email, role: demo.role, isActive: true, passwordHash: await hashPassword(password), createdAt: setupAt, updatedAt: setupAt }],
        { timestamps: false },
      );
    }
    users[demo.key] = user;
    note('users', added, `${demo.role.padEnd(8)} ${demo.name} <${demo.email}>`);
  }

  const categories = {};
  for (const definition of DEFAULT_CATEGORIES) {
    let category = await Category.findOne({ name: definition.name }).collation(CATEGORY_NAME_COLLATION);
    const added = !category;
    if (added) {
      [category] = await Category.create([{ ...definition, createdAt: setupAt, updatedAt: setupAt }], { timestamps: false });
    }
    categories[definition.name] = category;
    note('categories', added, `category ${category.name}${category.isActive ? '' : ' (inactive)'}`);
  }

  for (const spec of DEMO_TICKETS) {
    const customer = users[spec.customer];
    let ticket = await Ticket.findOne({ createdBy: customer._id, subject: spec.subject });
    const added = !ticket;
    if (added) {
      [ticket] = await Ticket.create([buildTicket(spec, { customer, users, categories, hoursAgo, slaPolicy: sla.policy, number: await nextTicketNumber() })], {
        timestamps: false,
      });
    }
    note('tickets', added, `${ticket.ticketNumber.padEnd(6)} ${ticket.status.padEnd(11)} ${spec.subject}`);

    // Comments are counted, not listed, to keep the output short.
    for (const comment of spec.comments ?? []) {
      const author = users[comment.by];
      if (await TicketComment.exists({ ticket: ticket._id, author: author._id, message: comment.message })) {
        summary.comments.kept += 1;
        continue;
      }
      await TicketComment.create(
        [{ ticket: ticket._id, author: author._id, message: comment.message, createdAt: hoursAgo(comment.at) }],
        { timestamps: false },
      );
      summary.comments.added += 1;
    }
  }
  return summary;
}

function counts() {
  return { added: 0, kept: 0 };
}

// A ticket document whose status, assignee, history and dates agree with each other (D-10).
function buildTicket(spec, { customer, users, categories, hoursAgo, slaPolicy, number }) {
  const assignee = spec.assignee ? users[spec.assignee] : null;
  const history = [{ status: 'open', changedBy: customer._id, changedAt: hoursAgo(spec.opened) }];
  if (spec.started !== undefined) history.push({ status: 'in_progress', changedBy: assignee._id, changedAt: hoursAgo(spec.started) });
  if (spec.resolved !== undefined) history.push({ status: 'resolved', changedBy: assignee._id, changedAt: hoursAgo(spec.resolved) });
  const last = history.at(-1);
  // The latest change to the ticket itself: a status change or the assignment.
  const updatedHours = Math.min(spec.opened, spec.started ?? Infinity, spec.resolved ?? Infinity, spec.assigned ?? Infinity);

  return {
    ticketNumber: number,
    subject: spec.subject,
    description: spec.description,
    category: categories[spec.category]._id,
    priority: spec.priority,
    status: last.status,
    statusHistory: history,
    createdBy: customer._id,
    assignedTo: assignee?._id ?? null,
    resolvedAt: last.status === 'resolved' ? last.changedAt : null,
    // Same rule as the API (utils/sla.js): created + the target for the priority.
    dueAt: computeDueAt(hoursAgo(spec.opened), spec.priority, slaPolicy),
    createdAt: hoursAgo(spec.opened),
    updatedAt: hoursAgo(updatedHours),
  };
}
