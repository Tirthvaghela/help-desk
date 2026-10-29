import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { canAccessTicket } from './ticketAccess.js';

// Creates in-app notifications for ticket activity. Called by the ticket controllers after
// a change has been saved. Rules:
//   - the person who did the action is never notified about it;
//   - every recipient must be an active user who can access the ticket right now
//     (contract OPEN-1 / D-5), so a notification never reveals a ticket to someone else;
//   - one action gives each recipient at most one notification (e.g. an assignment that
//     also changes the priority is one notification).
// Failures are logged and swallowed: a notification problem never undoes the ticket change.

const STATUS_LABELS = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

const idOf = (value) => (value == null ? null : String(value._id ?? value));
const label = (ticket) => `${ticket.ticketNumber} "${truncate(ticket.subject, 60)}"`;

function truncate(text = '', max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Loads candidate recipients and keeps those who are active, are not the actor, and can
// access the ticket. Returns a Map of id → user.
async function eligible(ticket, candidateIds, actorId) {
  const ids = [...new Set(candidateIds.filter(Boolean).map(String))].filter((id) => id !== String(actorId));
  if (ids.length === 0) return new Map();
  const users = await User.find({ _id: { $in: ids }, isActive: true }).select('name role');
  return new Map(users.filter((user) => canAccessTicket(user, ticket)).map((user) => [String(user._id), user]));
}

async function create(ticket, entries) {
  if (entries.length === 0) return;
  await Notification.insertMany(entries.map((entry) => ({ ...entry, ticket: ticket._id })));
}

// A customer created `ticket`: every active agent and admin can pick it up (unassigned).
export async function notifyTicketCreated(ticket, actor) {
  try {
    const staff = await User.find({ role: { $in: ['agent', 'admin'] }, isActive: true }).select('_id');
    const recipients = await eligible(ticket, staff.map((user) => user._id), actor._id);
    await create(ticket, [...recipients.keys()].map((recipient) => ({
      recipient,
      type: 'ticket_created',
      title: `New ticket ${ticket.ticketNumber}`,
      message: `${actor.name} raised ${label(ticket)}.`,
    })));
  } catch (err) {
    console.error(`Notifications (ticket created) failed: ${err?.message ?? err}`);
  }
}

// After PATCH /assign. `before` has the previous assignedTo and priority; `ticket` is saved.
export async function notifyAssignmentChange(before, ticket, actor) {
  try {
    const assigneeChanged = idOf(before.assignedTo) !== idOf(ticket.assignedTo);
    const priorityChanged = before.priority !== ticket.priority;
    if (!assigneeChanged && !priorityChanged) return;

    const newAssignee = idOf(ticket.assignedTo);
    const recipients = await eligible(ticket, [ticket.createdBy, ticket.assignedTo], actor._id);
    const priorityText = `Priority is now ${PRIORITY_LABELS[ticket.priority]}.`;
    const entries = [];

    for (const [id, user] of recipients) {
      if (assigneeChanged && id === newAssignee) {
        entries.push({
          recipient: id,
          type: 'ticket_assigned',
          title: `${ticket.ticketNumber} assigned to you`,
          message: `${actor.name} assigned ${label(ticket)} to you.${priorityChanged ? ` ${priorityText}` : ''}`,
        });
      } else if (assigneeChanged && newAssignee && user.role === 'customer') {
        const assigneeName = recipients.get(newAssignee)?.name ?? (await User.findById(newAssignee).select('name'))?.name ?? 'An agent';
        entries.push({
          recipient: id,
          type: 'ticket_assigned',
          title: `${ticket.ticketNumber} is being handled`,
          message: `${assigneeName} is now handling ${label(ticket)}.${priorityChanged ? ` ${priorityText}` : ''}`,
        });
      } else if (priorityChanged) {
        entries.push({
          recipient: id,
          type: 'priority_changed',
          title: `${ticket.ticketNumber} priority changed`,
          message: `${actor.name} changed the priority of ${label(ticket)} to ${PRIORITY_LABELS[ticket.priority]}.`,
        });
      }
    }
    await create(ticket, entries);
  } catch (err) {
    console.error(`Notifications (assignment) failed: ${err?.message ?? err}`);
  }
}

// After PATCH /status. Resolving gets its own type so the customer can tell at a glance.
export async function notifyStatusChange(ticket, actor) {
  try {
    const resolved = ticket.status === 'resolved';
    const recipients = await eligible(ticket, [ticket.createdBy, ticket.assignedTo], actor._id);
    await create(ticket, [...recipients.keys()].map((recipient) => ({
      recipient,
      type: resolved ? 'ticket_resolved' : 'status_changed',
      title: resolved ? `${ticket.ticketNumber} resolved` : `${ticket.ticketNumber} is ${STATUS_LABELS[ticket.status]}`,
      message: `${actor.name} changed ${label(ticket)} to ${STATUS_LABELS[ticket.status]}.`,
    })));
  } catch (err) {
    console.error(`Notifications (status) failed: ${err?.message ?? err}`);
  }
}

// After a new reply: the customer and the assigned agent, except the author.
export async function notifyComment(ticket, comment, actor) {
  try {
    const recipients = await eligible(ticket, [ticket.createdBy, ticket.assignedTo], actor._id);
    await create(ticket, [...recipients.keys()].map((recipient) => ({
      recipient,
      type: 'comment_added',
      title: `New reply on ${ticket.ticketNumber}`,
      message: `${actor.name}: ${truncate(comment.message.replace(/\s+/g, ' '), 140)}`,
    })));
  } catch (err) {
    console.error(`Notifications (comment) failed: ${err?.message ?? err}`);
  }
}
