import { formatDateTime, toDate } from "./staffFormat.js";

// Display of a ticket's SLA for the staff views. The API returns only `dueAt` (null on tickets
// from before SLAs), so the state is worked out here with the same rules as the backend
// (backend/src/utils/sla.js, docs/API_CONTRACT.md §3). A due date is never calculated here.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// "Due soon" once 25% or less of the ticket's own target is left.
const DUE_SOON_SHARE = 0.25;

// A real date only: `new Date(true)` would be 1970.
function slaDate(value) {
  return typeof value === "boolean" ? null : toDate(value);
}

// no_sla | due | due_soon | overdue | met | missed, for { status, createdAt, dueAt, resolvedAt }
// at `now`. Anything unusable (no dueAt, an invalid date, resolved with no resolvedAt) is no_sla.
export function slaState({ status, createdAt, dueAt, resolvedAt } = {}, now = new Date()) {
  const due = slaDate(dueAt);
  const at = slaDate(now);
  if (!due || !at) return "no_sla";

  if (status === "resolved") {
    const resolved = slaDate(resolvedAt);
    if (!resolved) return "no_sla";
    return resolved.getTime() <= due.getTime() ? "met" : "missed";
  }

  const remaining = due.getTime() - at.getTime();
  if (remaining < 0) return "overdue";
  const created = slaDate(createdAt);
  const target = created ? due.getTime() - created.getTime() : 0;
  if (target > 0 && remaining <= target * DUE_SOON_SHARE) return "due_soon";
  return "due";
}

// A length of time, rounded down: "2d 4h", "2d", "5h", "45m", or "<1m" under a minute.
export function formatSlaDuration(ms) {
  const length = Math.abs(Number(ms)) || 0;
  if (length < MINUTE_MS) return "<1m";
  if (length < HOUR_MS) return `${Math.floor(length / MINUTE_MS)}m`;
  if (length < DAY_MS) return `${Math.floor(length / HOUR_MS)}h`;
  const days = Math.floor(length / DAY_MS);
  const hours = Math.floor((length % DAY_MS) / HOUR_MS);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

// "Oct 25, 2026 · 10:42 AM", or null when the ticket has no valid due date.
export function slaDeadline(ticket) {
  const due = slaDate(ticket?.dueAt);
  return due ? formatDateTime(due) : null;
}

// What the badge shows: { state, label, title }. `title` gives the exact times.
export function slaDisplay(ticket, now = new Date()) {
  const state = slaState(ticket ?? {}, now);
  const deadline = slaDeadline(ticket);
  if (state === "no_sla") {
    return {
      state,
      label: "No SLA",
      title: deadline ? "No resolution time recorded for this ticket" : "This ticket has no due date",
    };
  }
  if (state === "met" || state === "missed") {
    return {
      state,
      label: state === "met" ? "Met" : "Missed",
      title: `Due ${deadline}; resolved ${formatDateTime(ticket.resolvedAt)}`,
    };
  }

  const remaining = slaDate(ticket.dueAt).getTime() - slaDate(now).getTime();
  const left = formatSlaDuration(remaining);
  const labels = {
    due: remaining > 0 ? `Due in ${left}` : "Due now",
    due_soon: remaining > 0 ? `Due soon · in ${left}` : "Due soon · now",
    overdue: `Overdue by ${left}`,
  };
  return { state, label: labels[state], title: `Due ${deadline}` };
}
