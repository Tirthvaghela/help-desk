import { User } from '../../src/models/User.js';
import { Category } from '../../src/models/Category.js';
import { Ticket } from '../../src/models/Ticket.js';
import { nextTicketNumber } from '../../src/models/Counter.js';
import { signToken } from '../../src/utils/token.js';

// Test data factories. They write real documents through the real models and sign real
// tokens with the test JWT secret from test/setup.js; nothing bypasses authentication.

let sequence = 0;
function uniqueSuffix() {
  sequence += 1;
  return `${process.pid}-${sequence}`;
}

// Users created here cannot log in: there is no login endpoint yet, and the hash is a
// placeholder. Use authHeader() to authenticate them.
export async function createUser({ role = 'customer', isActive = true, name, email } = {}) {
  const suffix = uniqueSuffix();
  return User.create({
    name: name ?? `Test ${role} ${suffix}`,
    email: email ?? `${role}.${suffix}@example.test`,
    passwordHash: 'placeholder-hash-not-valid-for-login',
    role,
    isActive,
  });
}

export async function createCategory({ name, isActive = true } = {}) {
  return Category.create({ name: name ?? `Category ${uniqueSuffix()}`, isActive });
}

// Creates a ticket with a real HD-number. The history starts with `open` by the creator;
// later steps are recorded as made by the assignee (or the creator when unassigned).
export async function createTicket({
  createdBy,
  category,
  assignedTo = null,
  status = 'open',
  priority = 'medium',
  subject = 'Unable to reset password',
  description = 'The reset link in the email says it has expired.',
  createdAt,
} = {}) {
  const owner = createdBy ?? (await createUser({ role: 'customer' }));
  const ticketCategory = category ?? (await createCategory());
  const actor = assignedTo ?? owner;

  const steps = ['open', 'in_progress', 'resolved'];
  const statusHistory = steps
    .slice(0, steps.indexOf(status) + 1)
    .map((step) => {
      const by = step === 'open' ? owner : actor;
      return { status: step, changedBy: by._id ?? by, changedAt: new Date() };
    });

  return Ticket.create({
    ticketNumber: await nextTicketNumber(),
    subject,
    description,
    category: ticketCategory._id ?? ticketCategory,
    priority,
    status,
    statusHistory,
    createdBy: owner._id ?? owner,
    assignedTo: assignedTo?._id ?? assignedTo,
    resolvedAt: status === 'resolved' ? new Date() : null,
    ...(createdAt ? { createdAt } : {}),
  });
}

export function authHeader(user) {
  return { Authorization: `Bearer ${signToken(user)}` };
}
