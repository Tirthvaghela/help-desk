import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act, deferred, failure, fireEvent, renderApp, screen, serverError, setupRenderTests, storedToken, tokenFor, waitFor, within } from './helpers/renderApp.js';
import { admin, adminRoutes, agent, customer, dueAtFor, makeComment, makeTicket, summary, ticketStore } from './helpers/fixtures.js';
import { slaDeadline } from '../src/components/staff/slaFormat.js';

// RT-7: the real AdminTickets screen and its private TicketModal, opened through the real page. The
// dialog is never recreated or simplified: it is reached by clicking Manage, as an admin would.

setupRenderTests();

const HOUR_MS = 60 * 60 * 1000;

function open(tickets, { comments = {}, routes = {} } = {}) {
  const store = ticketStore(tickets, comments);
  return { store, ...renderApp('/admin/dashboard?page=Tickets', { as: admin, routes: { ...adminRoutes(tickets), ...store.routes(), ...routes } }) };
}

async function openDialog(user, ticket) {
  const row = await screen.findByRole('row', { name: new RegExp(ticket.subject) });
  await user.click(within(row).getByRole('button', { name: 'Manage' }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('heading', { name: ticket.subject });
  return within(dialog);
}

const conversationOf = (dialog) => within(dialog.getByRole('region', { name: 'Conversation' }));

describe('the ticket list', () => {
  it('shows a loading state, then the tickets', async () => {
    const answer = deferred();
    const ticket = makeTicket({ subject: 'Listed for admin' });
    const store = ticketStore([ticket]).routes();
    open([ticket], { routes: { 'GET /api/tickets': () => answer.promise } });

    assert.ok(await screen.findByText('Loading tickets…'));
    answer.release(store['GET /api/tickets']({ query: {}, token: tokenFor(admin) }));

    assert.ok(await screen.findByRole('row', { name: /Listed for admin/ }));
    assert.equal(screen.queryByText('Loading tickets…'), null);
  });

  it('with no tickets, says so', async () => {
    open([]);

    assert.ok(await screen.findByText('No tickets yet.'));
  });

  it('a failed load shows an error and the retry works', async () => {
    const store = ticketStore([makeTicket({ subject: 'List is back' })]).routes();
    const { api, user } = open([], { routes: { 'GET /api/tickets': () => serverError() } });

    assert.match((await screen.findByRole('alert')).textContent, /The server had a problem/);
    api.on('GET /api/tickets', store['GET /api/tickets']);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    assert.ok(await screen.findByRole('row', { name: /List is back/ }));
    assert.equal(screen.queryByRole('alert'), null);
  });

  it('a filter asks the server and shows the filtered empty message', async () => {
    const { api, user } = open([makeTicket({ subject: 'Only open ones' })]);

    await screen.findByRole('row', { name: /Only open ones/ });
    await user.selectOptions(screen.getByLabelText('Status'), 'Resolved');

    assert.ok(await screen.findByText('No tickets match your search or filters.'));
    assert.ok(api.calls('GET', '/api/tickets').some((request) => request.query.status === 'resolved'));
  });
});

describe('opening the dialog', () => {
  it('Manage opens the real dialog, with the ticket\'s details', async () => {
    const ticket = makeTicket({ subject: 'Details please', description: 'All the details of it.' });
    const { user } = open([ticket]);

    const dialog = await openDialog(user, ticket);

    assert.ok(dialog.getByText(ticket.ticketNumber));
    assert.ok(dialog.getByText('All the details of it.'));
    assert.ok(dialog.getByText(customer.name));
    assert.ok(dialog.getByRole('heading', { name: 'Conversation' }));
    assert.equal(screen.getByRole('dialog').getAttribute('aria-modal'), 'true');
  });

  it('a link with ?ticket= opens it directly', async () => {
    const ticket = makeTicket({ subject: 'From a notification' });
    renderApp(`/admin/dashboard?ticket=${ticket.id}`, { as: admin, routes: { ...adminRoutes([ticket]), ...ticketStore([ticket]).routes() } });

    const dialog = within(await screen.findByRole('dialog'));
    assert.ok(await dialog.findByRole('heading', { name: 'From a notification' }));
  });

  it('a ticket that cannot load shows an error, and the retry works', async () => {
    const ticket = makeTicket({ subject: 'Temporarily away' });
    const store = ticketStore([ticket]).routes();
    const { api, user } = open([ticket], { routes: { 'GET /api/tickets/:id': () => serverError() } });

    await user.click(within(await screen.findByRole('row', { name: /Temporarily away/ })).getByRole('button', { name: 'Manage' }));
    const dialog = within(await screen.findByRole('dialog'));

    assert.ok(await dialog.findByRole('heading', { name: 'Ticket unavailable' }));
    assert.match(dialog.getByRole('alert').textContent, /The server had a problem/);

    api.on('GET /api/tickets/:id', store['GET /api/tickets/:id']);
    await user.click(dialog.getByRole('button', { name: 'Try again' }));
    assert.ok(await dialog.findByRole('heading', { name: 'Temporarily away' }));
  });

  it('Done, the close button and Escape all close it', async () => {
    const ticket = makeTicket({ subject: 'Open and close' });
    const { user } = open([ticket]);

    let dialog = await openDialog(user, ticket);
    await user.click(dialog.getByRole('button', { name: 'Done' }));
    await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));

    dialog = await openDialog(user, ticket);
    await user.click(dialog.getByRole('button', { name: 'Close ticket details' }));
    await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));

    await openDialog(user, ticket);
    await user.keyboard('{Escape}');
    await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  });
});

describe('conversation in the dialog', () => {
  it('appears inside the dialog, oldest first, marking the admin\'s own replies', async () => {
    const ticket = makeTicket({ subject: 'Has a thread' });
    const { user } = open([ticket], {
      comments: {
        [ticket.id]: [
          makeComment(ticket, customer, 'First message', '2026-10-20T10:00:00.000Z'),
          makeComment(ticket, agent, 'Second message', '2026-10-20T11:00:00.000Z'),
          makeComment(ticket, admin, 'Third message', '2026-10-20T12:00:00.000Z'),
        ],
      },
    });

    const conversation = conversationOf(await openDialog(user, ticket));
    assert.ok(await conversation.findByText('First message'));
    const messages = conversation.getAllByRole('listitem').map((item) => item.textContent);
    assert.match(messages[0], /Asha Customer · Customer.*First message/);
    assert.match(messages[1], /Ravi Agent · Agent.*Second message/);
    assert.match(messages[2], /You · Admin.*Third message/);
  });

  it('shows a loading state, then the replies', async () => {
    const ticket = makeTicket({ subject: 'Slow thread' });
    const answer = deferred();
    const { user } = open([ticket], { routes: { 'GET /api/tickets/:id/comments': () => answer.promise } });

    const conversation = conversationOf(await openDialog(user, ticket));
    assert.ok(conversation.getByText('Loading conversation…'));
    assert.equal(conversation.queryByText('No replies yet.'), null);

    answer.release({ comments: [makeComment(ticket, customer, 'Arrived')] });
    assert.ok(await conversation.findByText('Arrived'));
    assert.equal(conversation.queryByText('Loading conversation…'), null);
  });

  it('with no replies, says so', async () => {
    const ticket = makeTicket({ subject: 'Empty thread' });
    const { user } = open([ticket]);

    const conversation = conversationOf(await openDialog(user, ticket));
    assert.ok(await conversation.findByText('No replies yet.'));
  });

  it('a failed load shows an error, not the empty message, and the retry works', async () => {
    const ticket = makeTicket({ subject: 'Broken thread' });
    const { api, user } = open([ticket], { routes: { 'GET /api/tickets/:id/comments': () => serverError() } });

    const conversation = conversationOf(await openDialog(user, ticket));
    assert.match((await conversation.findByRole('alert')).textContent, /The server had a problem/);
    assert.equal(conversation.queryByText('No replies yet.'), null);

    api.on('GET /api/tickets/:id/comments', () => ({ comments: [makeComment(ticket, customer, 'Thread is back')] }));
    await user.click(conversation.getByRole('button', { name: 'Try again' }));

    assert.ok(await conversation.findByText('Thread is back'));
    assert.equal(conversation.queryByRole('alert'), null);
  });

  it('a 404 for the thread offers no retry', async () => {
    const ticket = makeTicket({ subject: 'Gone thread' });
    const { user } = open([ticket], { routes: { 'GET /api/tickets/:id/comments': () => failure(404, 'NOT_FOUND', 'Ticket not found') } });

    const conversation = conversationOf(await openDialog(user, ticket));
    assert.match((await conversation.findByRole('alert')).textContent, /This ticket could not be found/);
    assert.equal(conversation.queryByRole('button', { name: 'Try again' }), null);
  });
});

describe('replying in the dialog', () => {
  it('a reply is sent, trimmed, appears, and the box clears', async () => {
    const ticket = makeTicket({ subject: 'Reply here' });
    const { api, user } = open([ticket]);

    const conversation = conversationOf(await openDialog(user, ticket));
    const box = await conversation.findByLabelText('Your reply');
    await user.type(box, '  We are looking into this.  ');
    await user.click(conversation.getByRole('button', { name: 'Send reply' }));

    assert.ok(await conversation.findByText('We are looking into this.'));
    assert.ok(conversation.getByText('Reply sent.'));
    assert.equal(box.value, '');
    assert.deepEqual(api.calls('POST', `/api/tickets/${ticket.id}/comments`)[0].body, { message: 'We are looking into this.' });
    assert.equal(screen.queryByText('No replies yet.'), null);
  });

  it('after sending, the thread is reloaded from the server, without duplicating the reply', async () => {
    const ticket = makeTicket({ subject: 'Reload after' });
    const { api, user } = open([ticket]);

    const conversation = conversationOf(await openDialog(user, ticket));
    await conversation.findByText('No replies yet.');
    const loadsBefore = api.calls('GET', `/api/tickets/${ticket.id}/comments`).length;
    await user.type(conversation.getByLabelText('Your reply'), 'Just once on screen');
    await user.click(conversation.getByRole('button', { name: 'Send reply' }));

    await conversation.findByText('Reply sent.');
    await waitFor(() => assert.equal(api.calls('GET', `/api/tickets/${ticket.id}/comments`).length, loadsBefore + 1));
    await waitFor(() => assert.equal(conversation.getByRole('button', { name: 'Refresh' }).disabled, false));
    assert.equal(conversation.getAllByText('Just once on screen').length, 1);
  });

  it('an empty reply shows an error and sends nothing', async () => {
    const ticket = makeTicket({ subject: 'Empty reply' });
    const { api, user } = open([ticket]);

    const conversation = conversationOf(await openDialog(user, ticket));
    await conversation.findByLabelText('Your reply');
    await user.click(conversation.getByRole('button', { name: 'Send reply' }));

    assert.ok(await conversation.findByText('Message is required.'));
    assert.equal(api.calls('POST', `/api/tickets/${ticket.id}/comments`).length, 0);
  });

  it('a failed reply shows an error and keeps the text', async () => {
    const ticket = makeTicket({ subject: 'Failed reply' });
    const { user } = open([ticket], { routes: { 'POST /api/tickets/:id/comments': () => serverError() } });

    const conversation = conversationOf(await openDialog(user, ticket));
    const box = await conversation.findByLabelText('Your reply');
    await user.type(box, 'Do not lose me');
    await user.click(conversation.getByRole('button', { name: 'Send reply' }));

    assert.match((await conversation.findByRole('alert')).textContent, /The server had a problem/);
    assert.equal(box.value, 'Do not lose me');
    assert.equal(conversation.queryByText('Reply sent.'), null);
    assert.equal(storedToken(), tokenFor(admin));
  });

  it('while sending the form is locked, and a second click sends nothing', async () => {
    const ticket = makeTicket({ subject: 'Double click' });
    const answer = deferred();
    const { api, user } = open([ticket], { routes: { 'POST /api/tickets/:id/comments': () => answer.promise } });

    const conversation = conversationOf(await openDialog(user, ticket));
    const box = await conversation.findByLabelText('Your reply');
    await user.type(box, 'Only one please');
    await user.dblClick(conversation.getByRole('button', { name: 'Send reply' }));

    const sending = await conversation.findByRole('button', { name: 'Sending…' });
    assert.equal(sending.disabled, true);
    assert.equal(box.disabled, true);
    assert.equal(api.calls('POST', `/api/tickets/${ticket.id}/comments`).length, 1);

    answer.release(serverError());
    assert.ok(await conversation.findByRole('alert'));
    assert.equal(api.calls('POST', `/api/tickets/${ticket.id}/comments`).length, 1);
  });

  it('two submits in the same moment, before React re-renders, still send once', async () => {
    const ticket = makeTicket({ subject: 'Same moment' });
    const answer = deferred();
    const { api, user } = open([ticket], { routes: { 'POST /api/tickets/:id/comments': () => answer.promise } });

    const conversation = conversationOf(await openDialog(user, ticket));
    const box = await conversation.findByLabelText('Your reply');
    await user.type(box, 'Only one please');

    // userEvent always lets React re-render between events; this is the one case that needs no gap.
    act(() => {
      fireEvent.submit(box.closest('form'));
      fireEvent.submit(box.closest('form'));
    });

    assert.equal(api.calls('POST', `/api/tickets/${ticket.id}/comments`).length, 1);
    answer.release(serverError());
    assert.ok(await conversation.findByRole('alert'));
  });
});

describe('changing priority', () => {
  // Created 30 hours ago: a 72-hour medium target is 42 hours away, and a 24-hour high target has passed.
  const recent = (subject) => makeTicket({ subject, createdAt: new Date(Date.now() - 30 * HOUR_MS).toISOString() });

  it('sends only the priority, once, and shows the returned priority, due date and SLA badge', async () => {
    const ticket = recent('Getting urgent');
    const { api, user } = open([ticket]);

    const dialog = await openDialog(user, ticket);
    const select = dialog.getByLabelText(/^Priority/);
    assert.equal(select.value, 'medium');
    assert.ok(dialog.getByText(/^Due in 1d/));
    assert.ok(dialog.getByText(slaDeadline(ticket)));

    await user.selectOptions(select, 'High');

    assert.ok(await dialog.findByText('Priority updated.'));
    assert.equal(select.value, 'high');
    assert.ok(dialog.getByText(/^Overdue by 6h/), 'the badge follows the returned due date');
    const expected = slaDeadline({ dueAt: dueAtFor(ticket, 'high') });
    assert.ok(dialog.getByText(expected), 'the due date follows the response');
    assert.equal(dialog.queryByText(slaDeadline(ticket)), null);

    const calls = api.calls('PATCH', `/api/tickets/${ticket.id}/assign`);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { priority: 'high' });
    assert.equal(api.calls('GET', `/api/tickets/${ticket.id}`).length, 1, 'no extra request for the new due date');
  });

  it('the list behind the dialog refreshes after the change', async () => {
    const ticket = recent('List follows');
    const { user } = open([ticket]);

    const dialog = await openDialog(user, ticket);
    await user.selectOptions(dialog.getByLabelText(/^Priority/), 'High');
    await dialog.findByText('Priority updated.');

    const row = await screen.findByRole('row', { name: /List follows/, hidden: true });
    await waitFor(() => assert.ok(within(row).getByText('High')));
  });

  it('shows saving while waiting, locks the controls, and a second change sends nothing', async () => {
    const ticket = recent('Saving state');
    const answer = deferred();
    const { api, store, user } = open([ticket], { routes: { 'PATCH /api/tickets/:id/assign': () => answer.promise } });

    const dialog = await openDialog(user, ticket);
    const select = dialog.getByLabelText(/^Priority/);
    await user.selectOptions(select, 'High');

    assert.ok(await dialog.findByLabelText('Priority · saving…'));
    assert.equal(select.disabled, true);
    assert.equal(select.getAttribute('aria-busy'), 'true');
    assert.equal(dialog.getByLabelText(/^Assign Agent/).disabled, true);
    assert.equal(dialog.getByLabelText(/^Ticket Status/).disabled, true);
    await user.selectOptions(select, 'Low');
    assert.equal(api.calls('PATCH', `/api/tickets/${ticket.id}/assign`).length, 1);

    answer.release(store.routes()['PATCH /api/tickets/:id/assign']({ params: { id: ticket.id }, body: { priority: 'high' }, token: tokenFor(admin) }));
    assert.ok(await dialog.findByText('Priority updated.'));
    assert.equal(select.disabled, false);
  });

  const failures = [
    ['a refused priority', () => failure(400, 'VALIDATION_ERROR', 'priority must be one of: low, medium, high'), /priority must be one of/],
    ['a ticket resolved meanwhile', () => failure(400, 'TICKET_RESOLVED', 'This ticket is resolved and can no longer be changed'), /This ticket is resolved/],
    ['a permission failure', () => failure(403, 'FORBIDDEN', 'Not allowed'), /You do not have access to this ticket/],
    ['a ticket that no longer exists', () => failure(404, 'NOT_FOUND', 'Ticket not found'), /This ticket could not be found/],
    ['a concurrent change', () => failure(409, 'CONFLICT', 'The ticket changed'), /changed by someone else/],
    ['a server failure', () => serverError(), /The server had a problem/],
    ['no connection', () => { throw new TypeError('fetch failed'); }, /Cannot reach the server/],
  ];

  for (const [name, route, message] of failures) {
    it(`${name} shows its message and keeps the saved priority, due date and badge`, async () => {
      const ticket = recent(`Fails ${name}`);
      const { user } = open([ticket], { routes: { 'PATCH /api/tickets/:id/assign': route } });

      const dialog = await openDialog(user, ticket);
      const select = dialog.getByLabelText(/^Priority/);
      await user.selectOptions(select, 'High');

      assert.match((await dialog.findByRole('alert')).textContent, message);
      assert.equal(select.value, 'medium');
      assert.equal(select.disabled, false);
      assert.ok(dialog.getByText(/^Due in 1d/));
      assert.ok(dialog.getByText(slaDeadline(ticket)));
      assert.equal(dialog.queryByText('Priority updated.'), null);
      assert.equal(storedToken(), tokenFor(admin));
    });
  }
});

describe('a resolved ticket in the dialog', () => {
  const resolved = (subject) => makeTicket({ subject, status: 'resolved', assignedTo: summary(agent), resolvedAt: '2026-10-21T09:00:00.000Z' });

  it('locks priority, assignee and status, and explains why', async () => {
    const ticket = resolved('Closed for changes');
    const { api, user } = open([ticket]);

    const dialog = await openDialog(user, ticket);

    assert.equal(dialog.getByLabelText(/^Priority/).disabled, true);
    assert.equal(dialog.getByLabelText(/^Assign Agent/).disabled, true);
    assert.equal(dialog.getByLabelText(/^Ticket Status/).disabled, true);
    assert.ok(dialog.getByText('Priority cannot be changed after a ticket is resolved.'));
    assert.ok(dialog.getByText('Resolved tickets are final and can no longer be changed.'));

    await user.selectOptions(dialog.getByLabelText(/^Priority/), 'High');
    assert.equal(api.calls('PATCH', `/api/tickets/${ticket.id}/assign`).length, 0);
  });

  it('still allows a reply, and says it will not reopen the ticket', async () => {
    const ticket = resolved('Reply after resolving');
    const { user } = open([ticket]);

    const dialog = await openDialog(user, ticket);
    const conversation = conversationOf(dialog);
    assert.ok(await conversation.findByText('This ticket is resolved. You can still reply, but replying does not reopen it.'));
    await user.type(conversation.getByLabelText('Your reply'), 'Closing the loop');
    await user.click(conversation.getByRole('button', { name: 'Send reply' }));

    assert.ok(await conversation.findByText('Closing the loop'));
    assert.equal(dialog.getByLabelText(/^Ticket Status/).value, 'resolved');
  });

  it('other tickets show neither note', async () => {
    const ticket = makeTicket({ subject: 'Still open' });
    const { user } = open([ticket]);

    const dialog = await openDialog(user, ticket);
    await conversationOf(dialog).findByText('No replies yet.');

    assert.equal(dialog.queryByText('Priority cannot be changed after a ticket is resolved.'), null);
    assert.equal(dialog.queryByText(/does not reopen it/), null);
    assert.equal(dialog.getByLabelText(/^Priority/).disabled, false);
  });
});

describe('other changes in the dialog', () => {
  it('assigning an agent sends their id and shows them, and the status then becomes available', async () => {
    const ticket = makeTicket({ subject: 'Needs an owner' });
    const { api, user } = open([ticket]);

    const dialog = await openDialog(user, ticket);
    assert.equal(dialog.getByLabelText(/^Ticket Status/).disabled, true);
    assert.ok(dialog.getByText('Assign the ticket before starting work.'));

    const assign = dialog.getByLabelText(/^Assign Agent/);
    await within(assign).findByRole('option', { name: 'Ravi Agent (Agent)' });
    await user.selectOptions(assign, 'Ravi Agent (Agent)');

    await waitFor(() => assert.equal(assign.value, agent.id));
    assert.deepEqual(api.calls('PATCH', `/api/tickets/${ticket.id}/assign`)[0].body, { assignedTo: agent.id });
    assert.equal(dialog.getByLabelText(/^Ticket Status/).disabled, false);
  });

  it('a status change the server refuses keeps the saved status', async () => {
    const message = 'Assign the ticket before starting work';
    const ticket = makeTicket({ subject: 'Refused status', assignedTo: summary(agent) });
    const { user } = open([ticket], { routes: { 'PATCH /api/tickets/:id/status': () => failure(400, 'ASSIGNEE_REQUIRED', message) } });

    const dialog = await openDialog(user, ticket);
    const status = dialog.getByLabelText(/^Ticket Status/);
    await user.selectOptions(status, 'In Progress');

    assert.equal((await dialog.findByRole('alert')).textContent, message);
    assert.equal(status.value, 'open');
  });
});
