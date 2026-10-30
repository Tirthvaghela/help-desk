import { User } from '../models/User.js';
import { sendEmail, sendInBackground } from '../services/email.js';
import { ticketStatusChangedEmail } from '../services/emailTemplates.js';

// Ticket emails to customers. Called only after a change has been saved; the work runs in
// the background (services/email.js), so a slow or failing email server never delays or undoes
// the change. A failure is logged with its purpose and error codes only (safeErrorDetails),
// never the address, the link or the server's reply.

// After PATCH /api/tickets/:id/status: the ticket's own customer, if the account is active and
// is not the person who made the change. `ticket` is the saved ticket; `previousStatus` the
// status it had before. Returns the background task (tests wait for it).
export function emailStatusChange(ticket, previousStatus, actor) {
  const ticketId = ticket._id;
  const customerId = ticket.createdBy;
  const details = { ticketNumber: ticket.ticketNumber, subject: ticket.subject, status: ticket.status };

  return sendInBackground('ticket status', async () => {
    if (String(customerId) === String(actor._id)) return;
    const customer = await User.findOne({ _id: customerId, role: 'customer', isActive: true }).select('name email');
    if (!customer) return;
    await sendEmail({
      to: customer.email,
      ...ticketStatusChangedEmail({ name: customer.name, ticketId, previousStatus, ...details }),
    });
  });
}
