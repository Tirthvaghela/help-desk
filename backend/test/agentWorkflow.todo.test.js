import { describe, it } from 'node:test';

// Remaining planned integration tests for the Agent Workflow & Conversations module.
//
// 43 of the original 44 TODOs are now real tests in agentWorkflow.test.js (queue 10,
// assignment 10, status 8, comments 7, statistics 4, HD-104 steps 2–5 in one scenario).
//
// What is left needs endpoints owned by another module (Swati: customer tickets, contract §7).
// It cannot run until POST /api/tickets and GET /api/tickets/my exist and her ticket router is
// mounted in app.js BEFORE agentTicketRoutes (contract D-7).
//
// When they exist, replace the it.todo below with this test in agentWorkflow.test.js, inside the
// existing 'HD-104 end-to-end scenario' describe (it uses that file's helpers and fixtures):
//
//   it('customer submits HD-104 and sees it as Open in their history', async (tc) => {
//     if (!requireDB(tc)) return;
//     await Counter.findOneAndUpdate({ _id: 'ticket' }, { seq: 103 }, { upsert: true });
//     const created = await api('post', '/api/tickets', u.customerA).send({
//       subject: 'Unable to reset password',
//       description: 'The reset link in the email says it has expired.',
//       categoryId: id(c.account),
//       priority: 'medium',
//     });
//     assert.equal(created.status, 201);
//     assert.equal(created.body.ticket.ticketNumber, 'HD-104');
//     assert.equal(created.body.ticket.status, 'open');
//     assert.equal(created.body.ticket.assignedTo, null);
//
//     const mine = await api('get', '/api/tickets/my', u.customerA);
//     assert.equal(mine.status, 200);
//     assert.ok(mine.body.tickets.some((ticket) => ticket.ticketNumber === 'HD-104' && ticket.status === 'open'));
//
//     // The agent can then find it in the queue (the rest of the flow is already tested).
//     const queue = await api('get', '/api/tickets?q=HD-104', u.agentX);
//     assert.deepEqual(queue.body.tickets.map((ticket) => ticket.ticketNumber), ['HD-104']);
//   });

describe('HD-104 end-to-end scenario (project brief)', () => {
  it.todo('customer submits "Unable to reset password" through POST /api/tickets and sees it as Open in GET /api/tickets/my');
});
