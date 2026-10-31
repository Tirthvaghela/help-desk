import { failure, reply, tokenFor } from './renderApp.js';

// Data in the shapes the backend returns (docs/API_CONTRACT.md §3, utils/ticketSerializers.js,
// utils/userSerializer.js), and a small stand-in for its ticket routes, so screens can load, change
// and reload tickets. It applies the access and assignment rules these tests rely on, and no others.

const CREATED = '2026-10-20T09:00:00.000Z';
const HOUR_MS = 60 * 60 * 1000;
const SLA_HOURS = { high: 24, medium: 72, low: 168 };

function makeUser(id, name, role) {
  return { id, name, email: `${name.split(' ')[0].toLowerCase()}@example.test`, role, isActive: true, createdAt: CREATED };
}

export const customer = makeUser('6718f0c2a1b2c3d4e5f60001', 'Asha Customer', 'customer');
export const otherCustomer = makeUser('6718f0c2a1b2c3d4e5f60004', 'Bela Customer', 'customer');
export const agent = makeUser('6718f0c2a1b2c3d4e5f60002', 'Ravi Agent', 'agent');
export const otherAgent = makeUser('6718f0c2a1b2c3d4e5f60005', 'Nina Agent', 'agent');
export const admin = makeUser('6718f0c2a1b2c3d4e5f60003', 'Dev Admin', 'admin');

const USERS = [customer, otherCustomer, agent, otherAgent, admin];

export const summary = (user) => (user ? { id: user.id, name: user.name, role: user.role } : null);

export const billing = { id: '6718f0c2a1b2c3d4e5f60100', name: 'Billing', description: 'Invoices and refunds', isActive: true };
export const accountLogin = { id: '6718f0c2a1b2c3d4e5f60101', name: 'Account & Login', description: '', isActive: true };
export const categories = [accountLogin, billing];

let nextTicket = 0;

// A stored ticket: everything the detail response can contain.
export function makeTicket(overrides = {}) {
  nextTicket += 1;
  const number = nextTicket;
  const priority = overrides.priority ?? 'medium';
  const createdAt = overrides.createdAt ?? CREATED;
  return {
    id: `6718f0c2a1b2c3d4e5f6${String(200 + number).padStart(4, '0')}`,
    ticketNumber: `HD-${number}`,
    subject: `Ticket subject ${number}`,
    description: `The full description of ticket ${number}.`,
    category: { id: billing.id, name: billing.name },
    priority,
    status: 'open',
    createdBy: summary(customer),
    assignedTo: null,
    statusHistory: [{ status: 'open', changedBy: summary(customer), changedAt: createdAt }],
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
    dueAt: new Date(new Date(createdAt).getTime() + SLA_HOURS[priority] * HOUR_MS).toISOString(),
    ...overrides,
  };
}

export const dueAtFor = (ticket, priority) => new Date(new Date(ticket.createdAt).getTime() + SLA_HOURS[priority] * HOUR_MS).toISOString();

// Lists leave out the description and history, and customers never get the due date.
export function asListItem(ticket, { staff = false } = {}) {
  const { description, statusHistory, dueAt, ...item } = ticket;
  return staff ? { ...item, dueAt } : item;
}

export function asDetail(ticket, { staff = false } = {}) {
  const { dueAt, ...detail } = ticket;
  return staff ? { ...detail, dueAt } : detail;
}

let nextComment = 0;

export function makeComment(ticket, author, message, createdAt = '2026-10-20T10:00:00.000Z') {
  nextComment += 1;
  return { id: `6718f0c2a1b2c3d4e5f6${String(3000 + nextComment).padStart(4, '0')}`, ticket: ticket.id, author: summary(author), message, createdAt };
}

export function statsFor(tickets = []) {
  const byStatus = { open: 0, in_progress: 0, resolved: 0 };
  const byPriority = { low: 0, medium: 0, high: 0 };
  for (const ticket of tickets) {
    byStatus[ticket.status] += 1;
    byPriority[ticket.priority] += 1;
  }
  return {
    total: tickets.length,
    byStatus,
    byCategory: [],
    byPriority,
    unresolvedByPriority: byPriority,
    unassigned: tickets.filter((ticket) => !ticket.assignedTo).length,
    byAssignee: [],
  };
}

const notFound = () => failure(404, 'NOT_FOUND', 'Ticket not found');
const forbidden = (message = 'You do not have access to this ticket') => failure(403, 'FORBIDDEN', message);

function page(tickets, query, shape) {
  const limit = Number(query.limit ?? 20);
  const pageNumber = Number(query.page ?? 1);
  const start = (pageNumber - 1) * limit;
  return { tickets: tickets.slice(start, start + limit).map(shape), page: pageNumber, limit, total: tickets.length };
}

// Holds tickets and comments for one test, and answers the ticket routes from them.
export function ticketStore(tickets = [], comments = {}) {
  const store = { tickets: [...tickets], comments };
  const actorOf = (request) => USERS.find((user) => tokenFor(user) === request.token);
  const find = (id) => store.tickets.find((ticket) => ticket.id === id);
  const isStaff = (user) => user.role === 'agent' || user.role === 'admin';
  const canAccess = (user, ticket) => {
    if (user.role === 'admin') return true;
    if (user.role === 'agent') return !ticket.assignedTo || ticket.assignedTo.id === user.id;
    return ticket.createdBy.id === user.id;
  };
  const replace = (ticket, changes) => {
    const updated = { ...ticket, ...changes };
    store.tickets[store.tickets.indexOf(ticket)] = updated;
    return updated;
  };
  const accessible = (request) => {
    const actor = actorOf(request);
    const ticket = find(request.params.id);
    if (!ticket) return { error: notFound() };
    if (!canAccess(actor, ticket)) return { error: forbidden() };
    return { actor, ticket };
  };

  store.routes = () => ({
    'GET /api/tickets/my': (request) => {
      const actor = actorOf(request);
      const own = store.tickets.filter((ticket) => ticket.createdBy.id === actor.id && (!request.query.status || ticket.status === request.query.status));
      return page(own, request.query, (ticket) => asListItem(ticket));
    },
    'GET /api/tickets': (request) => {
      const actor = actorOf(request);
      const { status, priority, assignee, category, q } = request.query;
      const visible = store.tickets.filter((ticket) => {
        if (!canAccess(actor, ticket)) return false;
        if (status && ticket.status !== status) return false;
        if (priority && ticket.priority !== priority) return false;
        if (category && ticket.category.id !== category) return false;
        if (q && !`${ticket.ticketNumber} ${ticket.subject}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (assignee === 'unassigned') return !ticket.assignedTo;
        if (assignee === 'me') return ticket.assignedTo?.id === actor.id;
        if (assignee) return ticket.assignedTo?.id === assignee;
        return true;
      });
      return page(visible, request.query, (ticket) => asListItem(ticket, { staff: true }));
    },
    'GET /api/tickets/:id': (request) => {
      const { error, actor, ticket } = accessible(request);
      return error ?? { ticket: asDetail(ticket, { staff: isStaff(actor) }) };
    },
    'GET /api/tickets/:id/comments': (request) => {
      const { error, ticket } = accessible(request);
      return error ?? { comments: store.comments[ticket.id] ?? [] };
    },
    'POST /api/tickets/:id/comments': (request) => {
      const { error, actor, ticket } = accessible(request);
      if (error) return error;
      if (actor.role === 'agent' && ticket.assignedTo?.id !== actor.id) return forbidden('Assign this ticket to yourself to reply');
      const comment = makeComment(ticket, actor, request.body.message);
      store.comments[ticket.id] = [...(store.comments[ticket.id] ?? []), comment];
      return reply(201, { comment });
    },
    'PATCH /api/tickets/:id/assign': (request) => {
      const { error, actor, ticket } = accessible(request);
      if (error) return error;
      const changes = {};
      if ('assignedTo' in request.body) {
        changes.assignedTo = summary(USERS.find((user) => user.id === request.body.assignedTo));
      }
      if (request.body.priority) {
        changes.priority = request.body.priority;
        changes.dueAt = dueAtFor(ticket, request.body.priority);
      }
      return { ticket: asDetail(replace(ticket, changes), { staff: isStaff(actor) }) };
    },
    'PATCH /api/tickets/:id/status': (request) => {
      const { error, actor, ticket } = accessible(request);
      if (error) return error;
      const changedAt = '2026-10-21T09:00:00.000Z';
      const { status } = request.body;
      const updated = replace(ticket, {
        status,
        resolvedAt: status === 'resolved' ? changedAt : ticket.resolvedAt,
        statusHistory: [...ticket.statusHistory, { status, changedBy: summary(actor), changedAt }],
      });
      return { ticket: asDetail(updated, { staff: isStaff(actor) }) };
    },
  });
  return store;
}

// What the admin Tickets page loads besides the queue.
export function adminRoutes(tickets = []) {
  return {
    'GET /api/admin/stats': () => statsFor(tickets),
    'GET /api/admin/categories': () => ({ categories }),
    'GET /api/admin/users': (request) => {
      const users = USERS.filter((user) => !request.query.role || user.role === request.query.role);
      return { users: users.map((user) => ({ ...user, ticketCount: 0 })), page: 1, limit: 100, total: users.length };
    },
  };
}

export const categoryRoutes = () => ({ 'GET /api/categories': () => ({ categories }) });
