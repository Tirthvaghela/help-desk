// Resolution SLA (docs/API_CONTRACT.md §3, DATA_MODEL.md §3.3): every new ticket gets a due date
// by which it should be resolved, from its priority. Calendar hours (nights and weekends count);
// this is a resolution target, not a first-response target. Pure functions: the policy and the
// current time are always passed in, so callers and tests control them.

export const DEFAULT_SLA_HOURS = Object.freeze({ high: 24, medium: 72, low: 168 });

// The environment variable for each priority's target (whole hours).
export const SLA_HOURS_VARIABLES = Object.freeze({ high: 'SLA_HOURS_HIGH', medium: 'SLA_HOURS_MEDIUM', low: 'SLA_HOURS_LOW' });

// One year. Anything longer is almost certainly a typo (e.g. minutes instead of hours).
export const MAX_SLA_HOURS = 8760;

// "Due soon" once 25% or less of the ticket's own target is left.
export const DUE_SOON_SHARE = 0.25;

export const SLA_STATES = Object.freeze(['no_sla', 'due', 'due_soon', 'overdue', 'met', 'missed']);

const HOUR_MS = 60 * 60 * 1000;

// { policy: { high, medium, low }, errors: [] } from SLA_HOURS_* in `source` (e.g. process.env).
// Unset or empty → the default. Otherwise a whole number of hours from 1 to MAX_SLA_HOURS;
// anything else (text, decimals, 0, negatives, "Infinity", "1e3", spaces) is an error.
export function readSlaPolicy(source) {
  const errors = [];
  const policy = {};
  for (const [priority, name] of Object.entries(SLA_HOURS_VARIABLES)) {
    const raw = source?.[name];
    if (raw === undefined || raw === '') {
      policy[priority] = DEFAULT_SLA_HOURS[priority];
      continue;
    }
    const hours = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(hours) || hours < 1 || hours > MAX_SLA_HOURS) {
      errors.push(`${name} must be a whole number of hours from 1 to ${MAX_SLA_HOURS}`);
      policy[priority] = DEFAULT_SLA_HOURS[priority];
      continue;
    }
    policy[priority] = hours;
  }
  return { policy: Object.freeze(policy), errors };
}

// A Date for a valid Date, ISO string or timestamp; null for anything else (null, undefined,
// invalid dates). `new Date(null)` would be 1970, so null is rejected explicitly.
export function toValidDate(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime());
}

// dueAt = createdAt + the target for `priority`. Throws on an invalid date or a priority the
// policy does not cover (programming errors, not user input).
export function computeDueAt(createdAt, priority, policy) {
  const created = toValidDate(createdAt);
  if (!created) throw new TypeError('computeDueAt needs a valid createdAt');
  const hours = policy?.[priority];
  if (!Number.isSafeInteger(hours) || hours < 1) throw new TypeError(`No SLA target for priority "${priority}"`);
  return new Date(created.getTime() + hours * HOUR_MS);
}

// The SLA state of a ticket ({ status, createdAt, dueAt, resolvedAt }) at `now`:
//   no_sla    no valid dueAt (tickets from before SLAs), or resolved without a valid resolvedAt
//   met       resolved on or before dueAt          missed   resolved after dueAt
//   overdue   not resolved, now is after dueAt
//   due_soon  not resolved, 25% or less of the target left (dueAt itself included)
//   due       not resolved, more than 25% left
// The target is dueAt − createdAt, so it follows the ticket's own due date (also after a
// priority change). Without a valid createdAt before dueAt there is no "due soon", only "due".
export function slaState({ status, createdAt, dueAt, resolvedAt } = {}, now) {
  const at = toValidDate(now);
  if (!at) throw new TypeError('slaState needs a valid current time');
  const due = toValidDate(dueAt);
  if (!due) return 'no_sla';

  if (status === 'resolved') {
    const resolved = toValidDate(resolvedAt);
    if (!resolved) return 'no_sla';
    return resolved.getTime() <= due.getTime() ? 'met' : 'missed';
  }

  const remaining = due.getTime() - at.getTime();
  if (remaining < 0) return 'overdue';
  const created = toValidDate(createdAt);
  const target = created ? due.getTime() - created.getTime() : 0;
  if (target > 0 && remaining <= target * DUE_SOON_SHARE) return 'due_soon';
  return 'due';
}
