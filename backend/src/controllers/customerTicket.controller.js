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
import { TicketSubmission } from "../models/TicketSubmission.js";
import { readIdempotencyKey, requestFingerprint, submissionId, submissionTiming } from "../utils/idempotency.js";
import { env } from "../config/env.js";
import { computeDueAt } from "../utils/sla.js";

// Customer ticket endpoints (API contract §7). Owner: Swatismita.

const DEFAULT_PRIORITY = "medium";

// POST /api/tickets — customer only. { subject, description, categoryId, priority? }
// `category` is accepted as an alias of `categoryId` for clients written before the
// contract was aligned. Priority defaults to "medium" when omitted.
// With an Idempotency-Key header, repeats of the same submission return the ticket it
// created (200, `Idempotent-Replayed: true`) instead of creating another one.
export async function createCustomerTicket(req, res) {
  const key = readIdempotencyKey(req);
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

  const priority =
    body.priority === undefined ? DEFAULT_PRIORITY : requireOneOf(body.priority, TICKET_PRIORITIES, "priority");

  // Only these fields are taken from the client; status, owner, assignee, number and
  // history are set by the server (contract §2).
  const fields = { subject, description, category: categoryId, priority };

  if (!key) {
    const ticket = await insertTicket(fields, req.user);
    return sendTicket(res, 201, ticket, req.user, { notify: true });
  }
  return createOnce(req, res, key, fields);
}

// The active-category check runs after any claim, so a retry still returns the original
// ticket if its category has since been deactivated.
async function assertActiveCategory(categoryId) {
  if (!(await Category.exists({ _id: categoryId, isActive: true }))) {
    throw ApiError.badRequest("categoryId must be an active category");
  }
}

async function insertTicket(fields, user) {
  await assertActiveCategory(fields.category);
  return Ticket.create({ ticketNumber: await nextTicketNumber(), ...fields, ...timestampsWithDueAt(fields.priority), createdBy: user._id });
}

// createdAt is set here (Mongoose keeps a given createdAt on insert) so the SLA due date is
// computed from exactly the stored creation time.
function timestampsWithDueAt(priority) {
  const createdAt = new Date();
  return { createdAt, dueAt: computeDueAt(createdAt, priority, env.sla) };
}

async function sendTicket(res, status, ticket, user, { notify = false, replayed = false } = {}) {
  if (notify) await notifyTicketCreated(ticket, user);
  await ticket.populate(TICKET_DETAIL_POPULATE);
  if (replayed) res.set("Idempotent-Replayed", "true");
  res.status(status).json({ ticket: serializeTicket(ticket, { detail: true }) });
}

// Creates the ticket for this key at most once. The claim (a TicketSubmission whose _id is
// user + key) is inserted first; MongoDB's unique _id lets exactly one concurrent request
// insert it. The others wait for the ticket and return it. Nothing else is notified for a repeat.
//
// Invariant: a claim names one ticket id for its whole life, and every request that inserts a
// ticket for it (the first one, or one taking over an abandoned claim) inserts exactly that id.
// The unique ticket _id is the final guard: whatever the timing, at most one ticket exists per
// claim. The claim's createdAt is its lease: a takeover moves it forward with a compare-and-set,
// and only a current lease holder may release or end it.
async function createOnce(req, res, key, fields) {
  const id = submissionId(req.user._id, key);
  const fingerprint = requestFingerprint(fields);

  // A second attempt only follows a claim released by a request that failed before inserting.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let lease;
    try {
      const claim = await TicketSubmission.create({ _id: id, ticket: new mongoose.Types.ObjectId(), fingerprint });
      lease = { ticket: claim.ticket, claimedAt: claim.createdAt, original: true };
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const outcome = await awaitClaim(id, fingerprint, req.user);
      if (outcome.ticket) return sendTicket(res, 200, outcome.ticket, req.user, { replayed: true });
      if (!outcome.lease) continue;
      lease = outcome.lease;
    }
    return createClaimedTicket(res, id, lease, fields, req.user);
  }
  throw inProgress();
}

// Inserts the claim's ticket. Failures before the insert wrote nothing; a failed insert may or
// may not have written the ticket, so it never releases the claim.
async function createClaimedTicket(res, id, lease, fields, user) {
  let ticketNumber;
  try {
    await assertActiveCategory(fields.category);
    ticketNumber = await nextTicketNumber();
  } catch (err) {
    // Release the key so the customer can retry, but only as the original claimant still holding
    // the lease. A request that took over an abandoned claim keeps it: the original request may
    // still be running and could yet insert the ticket.
    if (lease.original) {
      await TicketSubmission.deleteOne({ _id: id, ticket: lease.ticket, createdAt: lease.claimedAt }).catch(() => {});
    }
    throw err;
  }

  let ticket;
  try {
    ticket = await Ticket.create({
      _id: lease.ticket,
      ticketNumber,
      ...fields,
      ...timestampsWithDueAt(fields.priority),
      createdBy: user._id,
    });
  } catch (err) {
    // Another request for this claim inserted the ticket first: return it like any repeat.
    if (isDuplicateTicketId(err)) {
      const existing = await Ticket.findOne({ _id: lease.ticket, createdBy: user._id });
      if (existing) return sendTicket(res, 200, existing, user, { replayed: true });
    }
    // Unknown outcome: keep the claim and its ticket id, and end the lease so the next retry
    // finds the ticket or inserts that same id at once instead of waiting out the stale limit.
    await moveLease(id, lease.ticket, lease.claimedAt, new Date(0)).catch(() => {});
    throw err;
  }
  return sendTicket(res, 201, ticket, user, { notify: true });
}

function isDuplicateTicketId(err) {
  const keys = Object.keys(err?.keyPattern ?? {});
  return err?.code === 11000 && keys.length === 1 && keys[0] === "_id";
}

// Compare-and-set on the claim's lease (createdAt, which Mongoose treats as immutable, hence the
// driver call). True when this request moved it, i.e. nobody else had.
async function moveLease(id, ticket, from, to) {
  const result = await TicketSubmission.collection.updateOne({ _id: id, ticket, createdAt: from }, { $set: { createdAt: to } });
  return result.modifiedCount === 1;
}

// Waits briefly for the ticket of an existing claim. Returns { ticket } once it exists,
// { lease } when this request took over an abandoned claim (same ticket id), or {} when the
// claim was released, so the caller may claim the key itself.
async function awaitClaim(id, fingerprint, user) {
  const deadline = Date.now() + submissionTiming.waitMs;
  for (;;) {
    const claim = await TicketSubmission.findById(id).lean();
    if (!claim) return {};
    if (claim.fingerprint !== fingerprint) {
      throw ApiError.conflict(
        "This Idempotency-Key was already used for a different ticket. Use a new key for a new ticket.",
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const ticket = await Ticket.findOne({ _id: claim.ticket, createdBy: user._id });
    if (ticket) return { ticket };
    if (Date.now() - new Date(claim.createdAt).getTime() >= submissionTiming.staleMs) {
      const claimedAt = new Date();
      if (await moveLease(id, claim.ticket, claim.createdAt, claimedAt)) {
        return { lease: { ticket: claim.ticket, claimedAt, original: false } };
      }
      continue; // another request took it over or released it: look again
    }
    if (Date.now() >= deadline) throw inProgress();
    await new Promise((resolve) => setTimeout(resolve, submissionTiming.pollMs));
  }
}

function inProgress() {
  return ApiError.conflict("This ticket is still being submitted. Please try again in a moment.", "IDEMPOTENCY_KEY_IN_USE");
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
