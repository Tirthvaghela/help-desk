import { capitalize, formatIsoDate, STATUS_LABELS } from "./staffFormat.js";

const HEADINGS = ["Ticket ID", "Subject", "Customer", "Category", "Priority", "Status", "Assigned Agent", "Created"];

// Quotes every cell and doubles embedded quotes. Cells that a spreadsheet would read as a
// formula (=, +, -, @ at the start) get a leading apostrophe, so exported text can't run.
export function escapeCsvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// CSV text (CRLF line endings) for the admin report export.
export function buildTicketCsv(tickets) {
  const rows = tickets.map((ticket) => [
    ticket.ticketNumber,
    ticket.subject,
    ticket.createdBy?.name ?? "",
    ticket.category?.name ?? "",
    capitalize(ticket.priority),
    STATUS_LABELS[ticket.status] ?? ticket.status,
    ticket.assignedTo?.name ?? "Unassigned",
    formatIsoDate(ticket.createdAt),
  ]);
  return [HEADINGS, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

// Start of a report period, or null for all time.
export function periodStart(period, now = new Date()) {
  const days = { "Last 7 Days": 7, "Last 30 Days": 30 }[period];
  return days ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : null;
}
