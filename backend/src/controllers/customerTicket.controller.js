import mongoose from "mongoose";
import { Ticket } from "../models/Ticket.js";
import { Category } from "../models/Category.js";
import { nextTicketNumber } from "../models/Counter.js";
import { ApiError } from "../utils/ApiError.js";
import { requireJsonBody, requireOneOf, requireString } from "../utils/validate.js";
import { TICKET_PRIORITIES } from "../utils/ticketConstants.js";
import { parseQueueQuery, withAccessScope } from "../utils/ticketQuery.js";
import { ticketScope } from "../utils/ticketAccess.js";
import { serializeTicket, TICKET_DETAIL_POPULATE, TICKET_LIST_POPULATE } from "../utils/ticketSerializers.js";
import { notifyTicketCreated } from "../utils/notifications.js";

// Customer ticket endpoints (API contract §7). Owner: Swatismita.

const DEFAULT_PRIORITY = "medium";

// POST /api/tickets — customer only. { subject, description, categoryId, priority? }
// `category` is accepted as an alias of `categoryId` for clients written before the
// contract was aligned. Priority defaults to "medium" when omitted.
export async function createCustomerTicket(req, res) {
  const body = requireJsonBody(req.body);
  const subject = requireString(body.subject, "subject", { min: 5, max: 120 });
  const description = requireString(body.description, "description", { min: 10, max: 5000 });

  const categoryId = body.categoryId ?? body.category;
  if (categoryId === undefined || categoryId === null || categoryId === "") {
    throw ApiError.badRequest("categoryId is required");
  }
  if (typeof categoryId !== "string" || !mongoose.isObjectIdOrHexString(categoryId)) {
    throw ApiError.badRequest("categoryId must be a valid id", "INVALID_ID");
  }
  if (!(await Category.exists({ _id: categoryId, isActive: true }))) {
    throw ApiError.badRequest("categoryId must be an active category");
  }

  const priority =
    body.priority === undefined ? DEFAULT_PRIORITY : requireOneOf(body.priority, TICKET_PRIORITIES, "priority");

  // Only these fields are taken from the client; status, owner, assignee, number and
  // history are set by the server (contract §2).
  const ticket = await Ticket.create({
    ticketNumber: await nextTicketNumber(),
    subject,
    description,
    category: categoryId,
    priority,
    createdBy: req.user._id,
  });

  await notifyTicketCreated(ticket, req.user);
  await ticket.populate(TICKET_DETAIL_POPULATE);
  res.status(201).json({ ticket: serializeTicket(ticket, { detail: true }) });
}

// GET /api/tickets/my — customer only. The caller's tickets, newest first.
// Query: status, priority, category, q, page (default 1), limit (default 20, max 100).
export async function getMyTickets(req, res) {
  // `assignee` is a staff queue filter and is not offered to customers.
  const query = { ...req.query };
  delete query.assignee;
  const { filter, page, limit, skip, sort } = parseQueueQuery(query, req.user._id);
  const scoped = withAccessScope(ticketScope(req.user), filter);

  const [tickets, total] = await Promise.all([
    Ticket.find(scoped)
      .select("-description -statusHistory")
      .sort({ ...sort, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate(TICKET_LIST_POPULATE),
    Ticket.countDocuments(scoped),
  ]);

  res.json({ tickets: tickets.map((ticket) => serializeTicket(ticket)), page, limit, total });
}
