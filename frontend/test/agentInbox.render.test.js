import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, failure, renderApp, screen, serverError, setupRenderTests, storedToken, tokenFor, waitFor, within } from './helpers/renderApp.js';
import { agent, categoryRoutes, customer, makeComment, makeTicket, otherAgent, summary, ticketStore } from './helpers/fixtures.js';

// RT-6: the real AgentInbox, reached through the real dashboard, as a signed-in agent.

setupRenderTests();

const INBOX = '/agent/dashboard?page=Inbox';
const REPLY_HINT = 'Assign this ticket to yourself to reply.';

const mine = (overrides = {}) => makeTicket({ assignedTo: summary(agent), ...overrides });

function open(tickets, { comments = {}, routes = {}, path = INBOX } = {}) {
  const store = ticketStore(tickets, comments);
  return { store, ...renderApp(path, { as: agent, routes: { ...categoryRoutes(), ...store.routes(), ...routes } }) };
}

const statusSelect = () => screen.findByLabelText(/^Status/);
const prioritySelect = () => screen.findByLabelText(/^Priority/);
const assigneeSelect = () => screen.findByLabelText(/^Assignee/);
const replyBox = () => screen.findByLabelText('Your Reply');
const sendButton = () => screen.getByRole('button', { name: /Send Reply|Sending/ });
const optionNamed = (select, name) => within(select).getByRole('option', { name });

describe('the queue', () => {
  it('shows a loading state, then the tickets, opening the first', async () => {
    const answer = deferred();
    const ticket = makeTicket({ subject: 'First in the queue', description: 'Queue details here.' });
    const store = ticketStore([ticket]).routes();
    open([ticket], { routes: { 'GET /api/tickets': (request) => (request.query.limit === '1' ? store['GET /api/tickets'](request) : answer.promise) } });

    assert.ok(await screen.findByText('Loading tickets…'));
    answer.release(store['GET /api/tickets']({ query: { limit: '25', page: '1' }, token: tokenFor(agent) }));

    assert.ok(await screen.findByRole('button', { name: /First in the queue/ }));
    assert.ok(await screen.findByRole('heading', { name: 'First in the queue' }), 'the first ticket opens');
    assert.ok(await screen.findByText('Queue details here.'));
    assert.equal(screen.queryByText('Loading tickets…'), null);
  });

  it('with no tickets, says so and has nothing to open', async () => {
    const { api } = open([]);

    assert.ok(await screen.findByText('No tickets found'));
    assert.ok(screen.getByText('New customer tickets will appear here.'));
    assert.equal(api.calls('GET', /\/api\/tickets\/[^/]+$/).length, 0);
    assert.equal(screen.queryByLabelText('Your Reply'), null);
  });

  it('a failed load shows an error and the retry works', async () => {
    const store = ticketStore([makeTicket({ subject: 'Recovered queue' })]).routes();
    const { api, user } = open([], { routes: { 'GET /api/tickets': () => serverError() } });

    assert.match((await screen.findByRole('alert')).textContent, /The server had a problem/);
    assert.equal(screen.queryByText('No tickets found'), null);

    api.on('GET /api/tickets', store['GET /api/tickets']);
    api.on('GET /api/tickets/:id', store['GET /api/tickets/:id']);
    api.on('GET /api/tickets/:id/comments', store['GET /api/tickets/:id/comments']);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    assert.ok(await screen.findByRole('button', { name: /Recovered queue/ }));
  });

  it('never lists a ticket assigned to another agent', async () => {
    open([makeTicket({ subject: 'Free to take' }), makeTicket({ subject: 'Belongs to Nina', assignedTo: summary(otherAgent) })]);

    assert.ok(await screen.findByRole('button', { name: /Free to take/ }));
    assert.equal(screen.queryByText('Belongs to Nina'), null);
  });

  it('a status filter asks the server and shows only what it returns', async () => {
    const { api, user } = open([makeTicket({ subject: 'Waiting' }), mine({ subject: 'Done', status: 'resolved', resolvedAt: '2026-10-21T09:00:00.000Z' })]);

    assert.ok(await screen.findByRole('button', { name: /Waiting/ }));
    await user.click(screen.getByRole('button', { name: /^Resolved/ }));

    await waitFor(() => assert.equal(screen.queryByRole('button', { name: /Waiting/ }), null));
    assert.ok(screen.getByRole('button', { name: /Done/ }));
    assert.ok(api.calls('GET', '/api/tickets').some((request) => request.query.status === 'resolved' && request.query.limit === '25'));
  });

  it('search waits for the typing to stop and shows the empty state with a hint', async () => {
    const { api, user } = open([makeTicket({ subject: 'Printer jam' })]);

    assert.ok(await screen.findByRole('button', { name: /Printer jam/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'zzz');

    assert.ok(await screen.findByText('Try changing your search or filters.'));
    const searches = api.calls('GET', '/api/tickets').filter((request) => request.query.q && request.query.limit === '25');
    assert.deepEqual(searches.map((request) => request.query.q), ['zzz'], 'one request for the finished text');
  });
});

describe('opening a ticket', () => {
  it('shows a loading state, then its details, conversation and history', async () => {
    const ticket = mine({ subject: 'Open me', description: 'The original request.' });
    const answer = deferred();
    open([ticket], {
      comments: { [ticket.id]: [makeComment(ticket, customer, 'Hello from the customer')] },
      routes: { 'GET /api/tickets/:id/comments': () => answer.promise },
    });

    assert.ok(await screen.findByText('Loading ticket…'));
    answer.release({ comments: [makeComment(ticket, customer, 'Hello from the customer')] });

    assert.ok(await screen.findByRole('heading', { name: 'Open me' }));
    assert.ok(screen.getByText('The original request.'));
    assert.ok(screen.getByText('Hello from the customer'));
    assert.ok(screen.getByText('Assigned to you'));
    assert.ok(screen.getByText('Status history'));
  });

  it('a failure shows an error and the retry works', async () => {
    const ticket = mine({ subject: 'Comes back' });
    const store = ticketStore([ticket]).routes();
    const { api, user } = open([ticket], { routes: { 'GET /api/tickets/:id': () => serverError() } });

    assert.match((await screen.findByRole('alert')).textContent, /The server had a problem/);
    api.on('GET /api/tickets/:id', store['GET /api/tickets/:id']);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    assert.ok(await screen.findByRole('heading', { name: 'Comes back' }));
  });

  it('a link to another agent\'s ticket is refused, and the agent stays signed in', async () => {
    const ticket = makeTicket({ subject: 'Not yours', assignedTo: summary(otherAgent) });
    open([ticket], { path: `/agent/dashboard?ticket=${ticket.id}` });

    assert.equal((await screen.findByRole('alert')).textContent.includes('You do not have access to this ticket.'), true);
    assert.equal(screen.queryByRole('heading', { name: 'Not yours' }), null);
    assert.equal(storedToken(), tokenFor(agent));
  });

  it('choosing another ticket opens it and clears the reply box', async () => {
    const first = mine({ subject: 'First ticket' });
    const second = mine({ subject: 'Second ticket' });
    const { user } = open([first, second]);

    await user.type(await replyBox(), 'Half a thought');
    await user.click(screen.getByRole('button', { name: /Second ticket/ }));

    assert.ok(await screen.findByRole('heading', { name: 'Second ticket' }));
    assert.equal((await replyBox()).value, '');
  });
});

describe('an unassigned ticket', () => {
  it('cannot be replied to until claimed, and says so', async () => {
    const ticket = makeTicket();
    const { api, user } = open([ticket]);

    assert.ok(await screen.findByText(REPLY_HINT));
    assert.equal((await assigneeSelect()).value, 'unassigned');
    await user.type(await replyBox(), 'Trying to reply');

    assert.equal(sendButton().disabled, true, 'text alone does not enable sending');
    await user.click(sendButton());
    assert.equal(api.calls('POST', `/api/tickets/${ticket.id}/comments`).length, 0);
  });

  it('cannot change status until assigned, and says so', async () => {
    open([makeTicket()]);

    assert.equal((await statusSelect()).disabled, true);
    assert.ok(screen.getByText('Assign the ticket before starting work.'));
  });

  it('claiming sends the agent\'s own id, then allows replies and status changes', async () => {
    const ticket = makeTicket();
    const { api, user } = open([ticket]);

    await user.selectOptions(await assigneeSelect(), 'You (Agent)');

    assert.ok(await screen.findByText('Assigned to you'));
    assert.deepEqual(api.calls('PATCH', `/api/tickets/${ticket.id}/assign`)[0].body, { assignedTo: agent.id });
    assert.equal(screen.queryByText(REPLY_HINT), null);
    assert.equal((await statusSelect()).disabled, false);

    await user.type(await replyBox(), 'On it now');
    assert.equal(sendButton().disabled, false);
  });

  it('a claim the server refuses leaves everything as it was and shows why', async () => {
    const { user } = open([makeTicket()], { routes: { 'PATCH /api/tickets/:id/assign': () => failure(409, 'CONFLICT', 'The ticket changed while it was being updated; please retry') } });

    await user.selectOptions(await assigneeSelect(), 'You (Agent)');

    assert.equal((await screen.findByRole('alert')).textContent, 'This ticket was changed by someone else. Refresh and try again.');
    assert.equal((await assigneeSelect()).value, 'unassigned');
    assert.ok(screen.getByText('Not assigned yet'));
    assert.ok(screen.getByText(REPLY_HINT));
  });
});

describe('a ticket assigned to the agent', () => {
  it('a reply is sent, appears, and the box clears', async () => {
    const ticket = mine();
    const { api, user } = open([ticket]);

    const box = await replyBox();
    assert.equal(sendButton().disabled, true, 'nothing typed yet');
    await user.type(box, '  Looking into this.  ');
    await user.click(sendButton());

    assert.ok(await screen.findByText('Looking into this.'));
    assert.equal(box.value, '');
    assert.deepEqual(api.calls('POST', `/api/tickets/${ticket.id}/comments`)[0].body, { message: 'Looking into this.' });
    assert.equal(screen.queryByText(REPLY_HINT), null);
  });

  it('a reply over the limit cannot be sent', async () => {
    const { user } = open([mine()]);

    await user.click(await replyBox());
    await user.paste('x'.repeat(2001));

    assert.ok(screen.getByText('2001/2000'));
    assert.equal(sendButton().disabled, true);
  });

  it('a failed reply shows an error and keeps the text', async () => {
    const { user } = open([mine()], { routes: { 'POST /api/tickets/:id/comments': () => serverError() } });

    const box = await replyBox();
    await user.type(box, 'Please keep this');
    await user.click(sendButton());

    assert.match((await screen.findByRole('alert')).textContent, /The server had a problem/);
    assert.equal(box.value, 'Please keep this');
    assert.equal(sendButton().disabled, false);
  });

  it('a reply the backend refuses because the ticket moved on shows the refusal', async () => {
    const { user } = open([mine()], { routes: { 'POST /api/tickets/:id/comments': () => failure(403, 'FORBIDDEN', 'Assign this ticket to yourself to reply') } });

    const box = await replyBox();
    await user.type(box, 'Too late');
    await user.click(sendButton());

    assert.equal((await screen.findByRole('alert')).textContent, 'You do not have access to this ticket.');
    assert.equal(box.value, 'Too late');
    assert.equal(storedToken(), tokenFor(agent));
  });

  it('while a reply is sending, a second click sends nothing and the controls lock', async () => {
    const ticket = mine();
    const answer = deferred();
    const { api, user } = open([ticket], { routes: { 'POST /api/tickets/:id/comments': () => answer.promise } });

    await user.type(await replyBox(), 'Only once');
    await user.dblClick(sendButton());

    assert.ok(await screen.findByRole('button', { name: 'Sending…' }));
    assert.equal(api.calls('POST', `/api/tickets/${ticket.id}/comments`).length, 1);
    assert.equal((await statusSelect()).disabled, true);
    assert.equal((await prioritySelect()).disabled, true);

    answer.release(serverError());
    assert.ok(await screen.findByRole('alert'));
    assert.equal((await statusSelect()).disabled, false);
  });

  it('status moves one step forward at a time', async () => {
    const ticket = mine();
    const { api, user } = open([ticket]);

    const select = await statusSelect();
    assert.equal(optionNamed(select, 'Resolved').disabled, true, 'cannot skip a step');
    await user.selectOptions(select, 'In Progress');

    await waitFor(() => assert.equal(select.value, 'in_progress'));
    assert.deepEqual(api.calls('PATCH', `/api/tickets/${ticket.id}/status`)[0].body, { status: 'in_progress' });
    assert.equal(optionNamed(select, 'Open').disabled, true, 'cannot go back');
    assert.equal(optionNamed(select, 'Resolved').disabled, false);
  });

  it('an open ticket can be released; an in-progress one cannot', async () => {
    const open1 = mine({ subject: 'Open and mine' });
    const { user } = open([open1]);

    const select = await assigneeSelect();
    assert.equal(optionNamed(select, 'Unassigned').disabled, false);
    await user.selectOptions(select, 'You (Agent)');

    await user.selectOptions(await statusSelect(), 'In Progress');
    await waitFor(() => assert.equal(optionNamed(select, 'Unassigned').disabled, true));
  });

  it('releasing a ticket sends null and brings the reply hint back', async () => {
    const ticket = mine();
    const { api, user } = open([ticket]);

    await user.selectOptions(await assigneeSelect(), 'Unassigned');

    assert.ok(await screen.findByText(REPLY_HINT));
    assert.deepEqual(api.calls('PATCH', `/api/tickets/${ticket.id}/assign`)[0].body, { assignedTo: null });
    assert.ok(screen.getByText('Not assigned yet'));
  });

  it('a status change the server refuses keeps the saved status and shows its message', async () => {
    const message = 'Cannot change status from open to in_progress';
    const { user } = open([mine()], { routes: { 'PATCH /api/tickets/:id/status': () => failure(400, 'INVALID_STATUS_TRANSITION', message) } });

    const select = await statusSelect();
    await user.selectOptions(select, 'In Progress');

    assert.equal((await screen.findByRole('alert')).textContent, message);
    assert.equal(select.value, 'open');
    assert.equal(select.disabled, false, 'the controls unlock again');
  });

  it('a priority change sends the new value and updates the ticket', async () => {
    const ticket = mine();
    const { api, user } = open([ticket]);

    const select = await prioritySelect();
    await user.selectOptions(select, 'High');

    await waitFor(() => assert.equal(select.value, 'high'));
    assert.deepEqual(api.calls('PATCH', `/api/tickets/${ticket.id}/assign`)[0].body, { priority: 'high' });
  });

  it('a priority change that fails shows the saved value and the error', async () => {
    const { user } = open([mine()], { routes: { 'PATCH /api/tickets/:id/assign': () => serverError() } });

    const select = await prioritySelect();
    await user.selectOptions(select, 'High');

    assert.match((await screen.findByRole('alert')).textContent, /The server had a problem/);
    assert.equal(select.value, 'medium');
  });
});

describe('a resolved ticket', () => {
  const resolved = (overrides = {}) => mine({ status: 'resolved', resolvedAt: '2026-10-21T09:00:00.000Z', ...overrides });

  it('locks status, priority and assignee, and says why', async () => {
    open([resolved()]);

    assert.equal((await statusSelect()).disabled, true);
    assert.equal((await prioritySelect()).disabled, true);
    assert.equal((await assigneeSelect()).disabled, true);
    assert.ok(screen.getByText('Resolved tickets are final and can no longer be changed.'));
  });

  it('its assigned agent can still reply, and the status stays resolved', async () => {
    const { user } = open([resolved()]);

    await user.type(await replyBox(), 'Glad that worked.');
    await user.click(sendButton());

    assert.ok(await screen.findByText('Glad that worked.'));
    assert.equal((await statusSelect()).value, 'resolved');
  });
});
