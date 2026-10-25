// Response shapes from the API contract (§3). Fields are copied one by one, so a
// populated document can never leak anything else (e.g. passwordHash or other users' emails).

// Populate options that load only what the serializers below need.
export const USER_SUMMARY_FIELDS = 'name role';
export const TICKET_LIST_POPULATE = [
  { path: 'category', select: 'name' },
  { path: 'createdBy', select: USER_SUMMARY_FIELDS },
  { path: 'assignedTo', select: USER_SUMMARY_FIELDS },
];
export const TICKET_DETAIL_POPULATE = [
  ...TICKET_LIST_POPULATE,
  { path: 'statusHistory.changedBy', select: USER_SUMMARY_FIELDS },
];

function idOf(value) {
  if (value == null) return null;
  return String(value._id ?? value);
}

// UserSummary: { id, name, role }. Unpopulated references give { id } only.
export function serializeUserSummary(user) {
  if (user == null) return null;
  if (user.name === undefined) return { id: idOf(user) };
  return { id: idOf(user), name: user.name, role: user.role };
}

export function serializeCategorySummary(category) {
  if (category == null) return null;
  if (category.name === undefined) return { id: idOf(category) };
  return { id: idOf(category), name: category.name };
}

// Full ticket for detail and update responses; list items omit description and statusHistory.
export function serializeTicket(ticket, { detail = false } = {}) {
  const result = {
    id: idOf(ticket),
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
  };
  if (detail) result.description = ticket.description;
  Object.assign(result, {
    category: serializeCategorySummary(ticket.category),
    priority: ticket.priority,
    status: ticket.status,
    createdBy: serializeUserSummary(ticket.createdBy),
    assignedTo: serializeUserSummary(ticket.assignedTo),
  });
  if (detail) {
    result.statusHistory = (ticket.statusHistory ?? []).map((entry) => ({
      status: entry.status,
      changedBy: serializeUserSummary(entry.changedBy),
      changedAt: entry.changedAt,
    }));
  }
  Object.assign(result, {
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt ?? null,
  });
  return result;
}

export function serializeComment(comment) {
  return {
    id: idOf(comment),
    ticket: idOf(comment.ticket),
    author: serializeUserSummary(comment.author),
    message: comment.message,
    createdAt: comment.createdAt,
  };
}
