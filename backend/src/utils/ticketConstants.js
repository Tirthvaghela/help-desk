// Stored ticket values from the API contract (docs/API_CONTRACT.md §3).
// The Ticket model's enums should import these so validation and schema stay in sync.

export const TICKET_STATUSES = Object.freeze(['open', 'in_progress', 'resolved']);

export const TICKET_PRIORITIES = Object.freeze(['low', 'medium', 'high']);
