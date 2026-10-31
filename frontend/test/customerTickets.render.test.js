import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, expired, failure, renderApp, screen, serverError, setupRenderTests, storedToken, tokenFor, waitFor, within } from './helpers/renderApp.js';
import { agent, asDetail, customer, makeComment, makeTicket, otherCustomer, summary, ticketStore } from './helpers/fixtures.js';

// RT-5: the real MyTickets and TicketDetail pages, as a signed-in customer.

setupRenderTests();

function openList(tickets, routes = {}) {
  return renderApp('/tickets', { as: customer, routes: { ...ticketStore(tickets).routes(), ...routes } });
}

function openDetail(ticket, comments = [], routes = {}) {
  return renderApp(`/tickets/${ticket.id}`, { as: customer, routes: { ...ticketStore([ticket], { [ticket.id]: comments }).routes(), ...routes } });
}

const heading = /here are your tickets/;

describe('MyTickets', () => {
  it('shows a loading state, then the tickets', async () => {
    const answer = deferred();
    const ticket = makeTicket({ subject: 'Slow to arrive' });
    const store = ticketStore([ticket]).routes();
    openList([ticket], { 'GET /api/tickets/my': (request) => (request.query.limit === '1' ? store['GET /api/tickets/my'](request) : answer.promise) });

    assert.ok(await screen.findByRole('list', { name: 'Loading tickets' }));
    assert.equal(screen.queryByText('Slow to arrive'), null);

    answer.release(store['GET /api/tickets/my']({ query: { page: '1', limit: '10' }, token: tokenFor(customer) }));
    assert.ok(await screen.findByText('Slow to arrive'));
    assert.equal(screen.queryByRole('list', { name: 'Loading tickets' }), null);
  });

  it('lists each ticket with its number, subject, status, priority and category, linking to its details', async () => {
    const ticket = makeTicket({ subject: 'Invoice is wrong', status: 'in_progress', priority: 'high' });
    openList([ticket]);

    const link = await screen.findByRole('link', { name: /Invoice is wrong/ });
    assert.equal(link.getAttribute('href'), `/tickets/${ticket.id}`);
    const row = within(link);
    assert.ok(row.getByText(ticket.ticketNumber));
    assert.ok(row.getByText('Billing'));
    assert.match(link.textContent, /in progress/i);
    assert.match(link.textContent, /high/i);
  });

  it('asks only for this customer\'s tickets, and never shows a due date', async () => {
    const ticket = makeTicket({ subject: 'Mine' });
    const { api } = openList([ticket, makeTicket({ subject: 'Someone else', createdBy: summary(otherCustomer) })]);

    assert.ok(await screen.findByText('Mine'));
    assert.equal(screen.queryByText('Someone else'), null);
    assert.ok(api.calls('GET', '/api/tickets/my').length > 0);
    assert.equal(api.calls('GET', '/api/tickets').length, 0, 'the staff queue is never requested');
    assert.equal(screen.queryByText(/Due in|Overdue|No SLA/), null);
  });

  it('with no tickets at all, invites the customer to raise one', async () => {
    openList([]);

    assert.ok(await screen.findByRole('heading', { name: 'No tickets yet' }));
    assert.equal(screen.getByRole('link', { name: 'Raise your first ticket' }).getAttribute('href'), '/tickets/new');
    assert.equal(screen.queryByRole('group', { name: 'Filter tickets by status' }), null);
  });

  it('a filter shows matching tickets, counts them, and says when none match', async () => {
    const { user } = openList([makeTicket({ subject: 'Open one' })]);

    const filters = await screen.findByRole('group', { name: 'Filter tickets by status' });
    assert.match(within(filters).getByRole('button', { name: /^All/ }).textContent, /1/);
    await user.click(within(filters).getByRole('button', { name: /^Resolved/ }));

    assert.ok(await screen.findByText('No tickets with this status.'));
    assert.equal(screen.queryByText('Open one'), null);
    assert.equal(within(filters).getByRole('button', { name: /^Resolved/ }).getAttribute('aria-pressed'), 'true');
  });

  it('pages through tickets, and a filter returns to the first page', async () => {
    const tickets = Array.from({ length: 12 }, (_, index) => makeTicket({ subject: `Ticket ${index + 1} of twelve` }));
    const { api, user } = openList(tickets);

    assert.ok(await screen.findByText('Page 1 of 2'));
    assert.equal(screen.getByRole('button', { name: /Newer/ }).disabled, true);
    await user.click(screen.getByRole('button', { name: /Older/ }));

    assert.ok(await screen.findByText('Ticket 11 of twelve'));
    assert.ok(screen.getByText('Page 2 of 2'));

    await user.click(screen.getByRole('button', { name: /^Open/ }));
    await waitFor(() => assert.ok(api.calls('GET', '/api/tickets/my').some((request) => request.query.status === 'open' && request.query.page === '1')));
    assert.ok(await screen.findByText('Page 1 of 2'));
  });

  it('a failed load shows an error, without the empty message, and the retry works', async () => {
    const store = ticketStore([makeTicket({ subject: 'Back again' })]).routes();
    const { api, user } = openList([], {
      'GET /api/tickets/my': (request) => (request.query.limit === '1' ? store['GET /api/tickets/my'](request) : serverError()),
    });

    assert.match((await screen.findByRole('alert')).textContent, /The server had a problem/);
    assert.equal(screen.queryByText('No tickets yet'), null);

    api.on('GET /api/tickets/my', store['GET /api/tickets/my']);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    assert.ok(await screen.findByText('Back again'));
    assert.equal(screen.queryByRole('alert'), null);
  });

});

describe('MyTickets: when only the counts fail', () => {
  const COUNT_ERROR = /couldn't load your ticket counts/;

  // Two open tickets and one resolved. The list always answers; `counts.answer` decides the counts
  // (the requests with limit=1), so a test can fail, delay or restore them.
  function openWithFailingCounts() {
    const tickets = [
      makeTicket({ subject: 'Still listed' }),
      makeTicket({ subject: 'Also listed' }),
      makeTicket({ subject: 'Already resolved', status: 'resolved', assignedTo: summary(agent), resolvedAt: '2026-10-21T09:00:00.000Z' }),
    ];
    const list = ticketStore(tickets).routes()['GET /api/tickets/my'];
    const counts = { answer: () => serverError(), real: list };
    const opened = openList([], { 'GET /api/tickets/my': (request) => (request.query.limit === '1' ? counts.answer(request) : list(request)) });
    const countCalls = () => opened.api.calls('GET', '/api/tickets/my').filter((request) => request.query.limit === '1');
    const listCalls = () => opened.api.calls('GET', '/api/tickets/my').filter((request) => request.query.limit !== '1');
    return { ...opened, counts, countCalls, listCalls };
  }

  const retryButton = () => screen.findByRole('button', { name: 'Retry counts' });
  const filterTexts = () =>
    within(screen.getByRole('group', { name: 'Filter tickets by status' }))
      .getAllByRole('button')
      .map((button) => button.textContent);

  it('keeps the tickets, shows the error, and never shows a false zero', async () => {
    openWithFailingCounts();

    assert.ok(await screen.findByText('Still listed'));
    assert.match((await screen.findByRole('alert')).textContent, COUNT_ERROR);
    assert.ok(screen.getByText('Also listed'));
    assert.deepEqual(filterTexts(), ['All—', 'Open—', 'In progress—', 'Resolved—']);
    assert.equal(screen.queryByText('No tickets yet'), null);
  });

  it('a lost connection is treated the same way', async () => {
    const { counts } = openWithFailingCounts();
    counts.answer = () => {
      throw new TypeError('fetch failed');
    };

    assert.ok(await screen.findByText('Still listed'));
    assert.match((await screen.findByRole('alert')).textContent, COUNT_ERROR);
  });

  it('a successful retry restores the correct counts and removes the error', async () => {
    const { counts, user } = openWithFailingCounts();
    await screen.findByText('Still listed');

    counts.answer = counts.real;
    await user.click(await retryButton());

    await waitFor(() => assert.deepEqual(filterTexts(), ['All3', 'Open2', 'In progress0', 'Resolved1']));
    assert.equal(screen.queryByRole('alert'), null);
    assert.equal(screen.queryByRole('button', { name: 'Retry counts' }), null);
    assert.ok(screen.getByText('Still listed'));
  });

  it('a failed retry keeps the error and a working retry, and the next one can succeed', async () => {
    const { counts, countCalls, user } = openWithFailingCounts();
    await screen.findByText('Still listed');
    const firstAttempt = countCalls().length;

    await user.click(await retryButton());
    await waitFor(() => assert.equal(countCalls().length, firstAttempt * 2));

    const again = await retryButton();
    assert.equal(again.disabled, false);
    assert.match(screen.getByRole('alert').textContent, COUNT_ERROR);
    assert.deepEqual(filterTexts(), ['All—', 'Open—', 'In progress—', 'Resolved—']);

    counts.answer = counts.real;
    await user.click(again);
    await waitFor(() => assert.deepEqual(filterTexts(), ['All3', 'Open2', 'In progress0', 'Resolved1']));
  });

  it('retrying does not fetch the ticket list again', async () => {
    const { counts, countCalls, listCalls, user } = openWithFailingCounts();
    await screen.findByText('Still listed');
    assert.equal(listCalls().length, 1);
    const before = countCalls().length;

    counts.answer = counts.real;
    await user.click(await retryButton());
    await waitFor(() => assert.deepEqual(filterTexts(), ['All3', 'Open2', 'In progress0', 'Resolved1']));

    assert.equal(listCalls().length, 1, 'the loaded list is left alone');
    assert.equal(countCalls().length, before * 2, 'each count is asked for once more');
  });

  it('while retrying the control is disabled and says so, and repeated clicks send nothing more', async () => {
    const { counts, countCalls, user } = openWithFailingCounts();
    await screen.findByText('Still listed');
    const before = countCalls().length;
    const answer = deferred();
    counts.answer = () => answer.promise;

    await user.dblClick(await retryButton());

    const retrying = await screen.findByRole('button', { name: 'Retrying…' });
    assert.equal(retrying.disabled, true);
    assert.equal(retrying.getAttribute('aria-busy'), 'true');
    assert.match(screen.getByRole('alert').textContent, COUNT_ERROR, 'the notice stays while waiting');
    await user.click(retrying);
    assert.equal(countCalls().length, before * 2, 'one round of count requests, however many clicks');

    answer.release(serverError());
    assert.equal((await retryButton()).disabled, false);
    assert.equal(countCalls().length, before * 2);
  });

  it('the chosen filter is usable while counts are missing, and survives a retry', async () => {
    const { api, counts, listCalls, user } = openWithFailingCounts();
    await screen.findByText('Still listed');

    await user.click(screen.getByRole('button', { name: /^Resolved/ }));
    assert.ok(await screen.findByText('Already resolved'));
    assert.equal(screen.queryByText('Still listed'), null);
    assert.ok(api.calls('GET', '/api/tickets/my').some((request) => request.query.status === 'resolved'));
    const before = listCalls().length;

    counts.answer = counts.real;
    await user.click(await retryButton());

    await waitFor(() => assert.deepEqual(filterTexts(), ['All3', 'Open2', 'In progress0', 'Resolved1']));
    assert.equal(screen.getByRole('button', { name: /^Resolved/ }).getAttribute('aria-pressed'), 'true');
    assert.ok(screen.getByText('Already resolved'));
    assert.equal(screen.queryByText('Still listed'), null);
    assert.equal(listCalls().length, before, 'no extra list request');
  });

  it('a filter with no matches keeps the filters, so the customer can switch back', async () => {
    const tickets = [makeTicket({ subject: 'Only open' })];
    const list = ticketStore(tickets).routes()['GET /api/tickets/my'];
    const { user } = openList([], { 'GET /api/tickets/my': (request) => (request.query.limit === '1' ? serverError() : list(request)) });
    await screen.findByText('Only open');

    await user.click(screen.getByRole('button', { name: /^Resolved/ }));

    assert.ok(await screen.findByText('No tickets with this status.'));
    await user.click(screen.getByRole('button', { name: /^All/ }));
    assert.ok(await screen.findByText('Only open'));
  });

  it('with no tickets listed, shows the error but no empty filters', async () => {
    const list = ticketStore([]).routes()['GET /api/tickets/my'];
    openList([], { 'GET /api/tickets/my': (request) => (request.query.limit === '1' ? serverError() : list(request)) });

    assert.ok(await screen.findByRole('heading', { name: 'No tickets yet' }));
    assert.match((await screen.findByRole('alert')).textContent, COUNT_ERROR);
    assert.equal(screen.queryByRole('group', { name: 'Filter tickets by status' }), null);
  });

  it('when list and counts both fail, each has its own retry', async () => {
    const { user, api } = openList([], { 'GET /api/tickets/my': () => serverError() });

    await waitFor(() => assert.equal(screen.getAllByRole('alert').length, 2));
    assert.ok(screen.getByRole('button', { name: 'Try again' }), 'the list retry');
    assert.ok(screen.getByRole('button', { name: 'Retry counts' }), 'the counts retry');

    const before = api.calls('GET', '/api/tickets/my').filter((request) => request.query.limit === '1').length;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Try again' });
    assert.equal(api.calls('GET', '/api/tickets/my').filter((request) => request.query.limit === '1').length, before, 'the list retry leaves the counts alone');
  });

  it('a retry rejected as an expired session signs out', async () => {
    const { counts, user, path } = openWithFailingCounts();
    await screen.findByText('Still listed');

    counts.answer = () => expired();
    await user.click(await retryButton());

    assert.ok(await screen.findByRole('heading', { name: 'Welcome back' }));
    assert.equal(path(), '/login');
    assert.equal(screen.queryByText('Still listed'), null);
    assert.equal(storedToken(), null);
  });
});

describe('ticket details: loading and failing', () => {
  it('shows a loading state, then the ticket', async () => {
    const ticket = makeTicket({ subject: 'Detail on the way' });
    const answer = deferred();
    openDetail(ticket, [], { 'GET /api/tickets/:id': () => answer.promise });

    assert.ok(await screen.findByText('Loading ticket…'));
    assert.equal(screen.queryByRole('heading', { name: 'Detail on the way' }), null);

    answer.release({ ticket: asDetail(ticket) });
    assert.ok(await screen.findByRole('heading', { name: 'Detail on the way' }));
    assert.equal(screen.queryByText('Loading ticket…'), null);
  });

  const permanent = [
    ['another customer\'s ticket (403)', () => failure(403, 'FORBIDDEN', 'You do not have access to this ticket'), 'You do not have access to this ticket.'],
    ['a ticket that does not exist (404)', () => failure(404, 'NOT_FOUND', 'Ticket not found'), 'This ticket could not be found.'],
    ['a malformed id (400)', () => failure(400, 'INVALID_ID', 'Invalid ticket id'), 'This ticket could not be found.'],
  ];

  for (const [name, route, message] of permanent) {
    it(`${name} shows a message, offers no retry, and stays signed in`, async () => {
      const ticket = makeTicket({ subject: 'Must stay hidden' });
      openDetail(ticket, [], { 'GET /api/tickets/:id': route });

      assert.equal((await screen.findByRole('alert')).textContent, message);
      assert.equal(screen.queryByRole('button', { name: 'Try again' }), null);
      assert.equal(screen.queryByText('Must stay hidden'), null);
      assert.ok(screen.getByRole('link', { name: /Back to my tickets/ }));
      assert.equal(storedToken(), tokenFor(customer));
    });
  }

  it('the real access rule: another customer\'s ticket is refused', async () => {
    const ticket = makeTicket({ subject: 'Bela only', createdBy: summary(otherCustomer) });
    openDetail(ticket);

    assert.equal((await screen.findByRole('alert')).textContent, 'You do not have access to this ticket.');
    assert.equal(screen.queryByText('Bela only'), null);
  });

  it('a server failure offers a retry that works', async () => {
    const ticket = makeTicket({ subject: 'Second time lucky' });
    const store = ticketStore([ticket]).routes();
    const { api, user } = openDetail(ticket, [], { 'GET /api/tickets/:id': () => serverError() });

    assert.match((await screen.findByRole('alert')).textContent, /The server had a problem/);
    api.on('GET /api/tickets/:id', store['GET /api/tickets/:id']);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    assert.ok(await screen.findByRole('heading', { name: 'Second time lucky' }));
    assert.equal(screen.queryByRole('alert'), null);
  });
});

describe('ticket details: what the customer sees', () => {
  it('shows the ticket, its history and its conversation, oldest first', async () => {
    const ticket = makeTicket({
      subject: 'Refund not received',
      description: 'I was promised a refund last week.',
      status: 'in_progress',
      assignedTo: summary(agent),
      statusHistory: [
        { status: 'open', changedBy: summary(customer), changedAt: '2026-10-20T09:00:00.000Z' },
        { status: 'in_progress', changedBy: summary(agent), changedAt: '2026-10-20T10:00:00.000Z' },
      ],
    });
    openDetail(ticket, [
      makeComment(ticket, customer, 'First, from me', '2026-10-20T10:00:00.000Z'),
      makeComment(ticket, agent, 'Second, from support', '2026-10-20T11:00:00.000Z'),
    ]);

    assert.ok(await screen.findByRole('heading', { name: 'Refund not received' }));
    assert.ok(screen.getByText(ticket.ticketNumber));
    assert.ok(screen.getByText('I was promised a refund last week.'));
    assert.match(screen.getByText('Assigned to').parentElement.textContent, /Ravi Agent/);
    assert.ok(screen.getByRole('heading', { name: 'Status history' }));

    const conversation = within(screen.getByRole('region', { name: 'Conversation' }));
    const messages = conversation.getAllByRole('listitem').map((item) => item.textContent);
    assert.match(messages[0], /You.*First, from me/);
    assert.match(messages[1], /Ravi Agent.*Support.*Second, from support/);
  });

  it('never shows the SLA or due date', async () => {
    const ticket = makeTicket({ subject: 'No deadlines here' });
    const { api } = openDetail(ticket);

    assert.ok(await screen.findByRole('heading', { name: 'No deadlines here' }));
    assert.equal(screen.queryByText(/Due in|Overdue|Due soon|No SLA/), null);
    assert.equal(screen.queryByText('Due'), null);
    assert.ok(api.calls('GET', /\/api\/tickets\/[^/]+$/).length > 0);
  });

  it('with no replies, says so', async () => {
    const ticket = makeTicket();
    openDetail(ticket);

    assert.ok(await screen.findByText('No replies yet. Our support team will respond here.'));
  });

  it('message text is shown as text, not run as HTML', async () => {
    const ticket = makeTicket();
    openDetail(ticket, [makeComment(ticket, agent, '<img src=x onerror="alert(1)"> hello')]);

    assert.ok(await screen.findByText('<img src=x onerror="alert(1)"> hello'));
    assert.equal(document.querySelector('img[src="x"]'), null);
  });
});

describe('ticket details: replying', () => {
  it('a reply appears in the conversation, trimmed, and the box clears', async () => {
    const ticket = makeTicket();
    const { api, user } = openDetail(ticket);

    const box = await screen.findByLabelText('Your reply');
    await user.type(box, '   Any news on this?   ');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    assert.ok(await screen.findByText('Any news on this?'));
    assert.equal(box.value, '');
    assert.deepEqual(api.calls('POST', `/api/tickets/${ticket.id}/comments`)[0].body, { message: 'Any news on this?' });
    assert.equal(screen.queryByText('No replies yet. Our support team will respond here.'), null);
  });

  it('an empty reply shows an error and sends nothing', async () => {
    const ticket = makeTicket();
    const { api, user } = openDetail(ticket);

    await screen.findByLabelText('Your reply');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    assert.ok(await screen.findByText('Message is required.'));
    assert.equal(api.calls('POST', `/api/tickets/${ticket.id}/comments`).length, 0);
  });

  it('a reply over the limit is refused, and the counter shows it', async () => {
    const ticket = makeTicket();
    const { api, user } = openDetail(ticket);

    await user.click(await screen.findByLabelText('Your reply'));
    await user.paste('x'.repeat(2001));
    assert.ok(screen.getByText('2001/2000'));
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    assert.ok(await screen.findByText('Message must be at most 2000 characters.'));
    assert.equal(api.calls('POST', `/api/tickets/${ticket.id}/comments`).length, 0);
  });

  it('a failed reply shows an error and keeps the text', async () => {
    const ticket = makeTicket();
    const { user } = openDetail(ticket, [], { 'POST /api/tickets/:id/comments': () => serverError() });

    const box = await screen.findByLabelText('Your reply');
    await user.type(box, 'Please keep this');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    assert.match((await screen.findByRole('alert')).textContent, /The server had a problem/);
    assert.equal(box.value, 'Please keep this');
    assert.equal(screen.getByRole('button', { name: 'Send reply' }).disabled, false);
  });

  it('while sending the form is locked, and a second click sends nothing', async () => {
    const ticket = makeTicket();
    const answer = deferred();
    const { api, user } = openDetail(ticket, [], { 'POST /api/tickets/:id/comments': () => answer.promise });

    await user.type(await screen.findByLabelText('Your reply'), 'Only once');
    await user.dblClick(screen.getByRole('button', { name: 'Send reply' }));

    assert.ok(await screen.findByRole('button', { name: 'Sending…' }));
    assert.equal(api.calls('POST', `/api/tickets/${ticket.id}/comments`).length, 1);

    answer.release(failure(500, 'INTERNAL_ERROR', 'Something went wrong'));
    assert.ok(await screen.findByRole('alert'));
  });

  it('on a resolved ticket the customer is told replying will not reopen it, and can still reply', async () => {
    const ticket = makeTicket({ status: 'resolved', assignedTo: summary(agent), resolvedAt: '2026-10-21T09:00:00.000Z' });
    const { user } = openDetail(ticket);

    assert.ok(await screen.findByText('This ticket is resolved. You can still reply, but replying does not reopen it.'));
    await user.type(screen.getByLabelText('Your reply'), 'Thanks, it works now');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    assert.ok(await screen.findByText('Thanks, it works now'));
  });

  it('Refresh loads newer replies', async () => {
    const ticket = makeTicket();
    const { api, user } = openDetail(ticket);

    assert.ok(await screen.findByText('No replies yet. Our support team will respond here.'));
    api.on('GET /api/tickets/:id/comments', () => ({ comments: [makeComment(ticket, agent, 'Replied meanwhile')] }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    assert.ok(await screen.findByText('Replied meanwhile'));
  });
});
