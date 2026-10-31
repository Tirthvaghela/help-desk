import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, failure, renderApp, reply, screen, serverError, setupRenderTests, waitFor } from './helpers/renderApp.js';
import { accountLogin, asDetail, billing, categories, categoryRoutes, customer, makeTicket, ticketStore } from './helpers/fixtures.js';

// RT-4: the real New Ticket form, signed in as a real customer session.

setupRenderTests();

const SUBJECT = 'Cannot download my invoice';
const DESCRIPTION = 'The download button does nothing on the billing page.';

function created(overrides = {}) {
  return makeTicket({ subject: SUBJECT, description: DESCRIPTION, ...overrides });
}

function open(routes = {}) {
  return renderApp('/tickets/new', { as: customer, routes: { ...categoryRoutes(), ...routes } });
}

// The priority options are lowercase in the DOM; CSS capitalizes them on screen.
async function fillForm(user, { subject = SUBJECT, description = DESCRIPTION, category = 'Billing', priority = 'high' } = {}) {
  await screen.findByRole('option', { name: 'Billing' });
  await user.type(screen.getByLabelText('Subject'), subject);
  if (category) await user.selectOptions(screen.getByLabelText('Category'), category);
  if (priority) await user.selectOptions(screen.getByLabelText('Priority'), priority);
  await user.type(screen.getByLabelText('Description'), description);
}

const submit = (user) => user.click(screen.getByRole('button', { name: 'Submit ticket' }));

describe('loading the categories', () => {
  it('the form is locked until they arrive, then lists them', async () => {
    const answer = deferred();
    open({ 'GET /api/categories': () => answer.promise });

    assert.ok(await screen.findByRole('option', { name: 'Loading categories…' }));
    assert.equal(screen.getByLabelText('Subject').disabled, true);
    assert.equal(screen.getByRole('button', { name: 'Submit ticket' }).disabled, true);

    answer.release({ categories });
    assert.ok(await screen.findByRole('option', { name: 'Billing' }));
    assert.ok(screen.getByRole('option', { name: 'Account & Login' }));
    assert.equal(screen.getByLabelText('Subject').disabled, false);
  });

  it('a failure shows a retry, which works', async () => {
    const { api, user } = open({ 'GET /api/categories': () => serverError() });

    assert.match((await screen.findByRole('alert')).textContent, /The server had a problem/);
    assert.equal(screen.getByRole('button', { name: 'Submit ticket' }).disabled, true);

    api.on('GET /api/categories', () => ({ categories }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    assert.ok(await screen.findByRole('option', { name: 'Billing' }));
    assert.equal(screen.queryByRole('alert'), null);
  });

  it('with no active category the form explains itself and stays locked', async () => {
    open({ 'GET /api/categories': () => ({ categories: [] }) });

    assert.ok(await screen.findByText(/No ticket categories are available right now/));
    assert.equal(screen.getByLabelText('Description').disabled, true);
    assert.equal(screen.getByRole('button', { name: 'Submit ticket' }).disabled, true);
  });
});

describe('validation', () => {
  it('empty fields show their errors, linked to the fields, and send nothing', async () => {
    const { api, user } = open();

    await screen.findByRole('option', { name: 'Billing' });
    await submit(user);

    assert.ok(await screen.findByText('Subject is required.'));
    assert.ok(screen.getByText('Description is required.'));
    assert.ok(screen.getByText('Choose a category.'));
    const subject = screen.getByLabelText('Subject');
    assert.equal(subject.getAttribute('aria-invalid'), 'true');
    assert.equal(subject.getAttribute('aria-describedby'), 'ticket-subject-error');
    assert.equal(api.calls('POST', '/api/tickets').length, 0);
  });

  it('text that is too short is refused', async () => {
    const { api, user } = open();

    await fillForm(user, { subject: 'Hi', description: 'Too short' });
    await submit(user);

    assert.ok(await screen.findByText('Subject must be at least 5 characters.'));
    assert.ok(screen.getByText('Description must be at least 10 characters.'));
    assert.equal(api.calls('POST', '/api/tickets').length, 0);
  });

  it('a missing category alone is refused, and choosing one clears the way', async () => {
    const ticket = created();
    const { api, user } = open(ticketStore([ticket]).routes());
    api.on('POST /api/tickets', () => reply(201, { ticket: asDetail(ticket) }));

    await fillForm(user, { category: null });
    await submit(user);
    assert.ok(await screen.findByText('Choose a category.'));
    assert.equal(api.calls('POST', '/api/tickets').length, 0);

    await user.selectOptions(screen.getByLabelText('Category'), 'Billing');
    await submit(user);
    await waitFor(() => assert.equal(api.calls('POST', '/api/tickets').length, 1));
    assert.ok(await screen.findByRole('heading', { name: SUBJECT }));
  });

  it('the counter follows what is typed', async () => {
    const { user } = open();

    await screen.findByRole('option', { name: 'Billing' });
    assert.ok(screen.getByText('0/120'));
    await user.type(screen.getByLabelText('Subject'), 'Hello');
    assert.ok(screen.getByText('5/120'));
  });
});

describe('submitting', () => {
  it('sends the chosen values and opens the new ticket with a notice', async () => {
    const ticket = created({ priority: 'high' });
    const { api, user, path } = open(ticketStore([ticket]).routes());
    api.on('POST /api/tickets', () => reply(201, { ticket: asDetail(ticket) }));

    await fillForm(user);
    await submit(user);

    assert.ok(await screen.findByRole('heading', { name: SUBJECT }));
    assert.equal(path(), `/tickets/${ticket.id}`);
    assert.ok(screen.getByText(`${ticket.ticketNumber} was created. Our team will reply here.`));
    assert.ok(screen.getByText(DESCRIPTION));

    const [request] = api.calls('POST', '/api/tickets');
    assert.deepEqual(request.body, { subject: SUBJECT, description: DESCRIPTION, categoryId: billing.id, priority: 'high' });
    assert.match(request.headers['Idempotency-Key'], /^[A-Za-z0-9_-]{8,128}$/);
  });

  it('priority stays medium unless changed, and a different category is sent', async () => {
    const ticket = created();
    const { api, user } = open(ticketStore([ticket]).routes());
    api.on('POST /api/tickets', () => reply(201, { ticket: asDetail(ticket) }));

    assert.equal((await screen.findByLabelText('Priority')).value, 'medium');
    // By value: selectOptions compares option text as HTML, where "&" is "&amp;".
    await fillForm(user, { category: accountLogin.id, priority: null });
    await submit(user);

    await waitFor(() => assert.equal(api.calls('POST', '/api/tickets').length, 1));
    assert.equal(api.calls('POST', '/api/tickets')[0].body.priority, 'medium');
    assert.equal(api.calls('POST', '/api/tickets')[0].body.categoryId, accountLogin.id);
    assert.ok(await screen.findByRole('heading', { name: SUBJECT }));
  });

  it('text is trimmed before sending', async () => {
    const ticket = created();
    const { api, user } = open(ticketStore([ticket]).routes());
    api.on('POST /api/tickets', () => reply(201, { ticket: asDetail(ticket) }));

    await fillForm(user, { subject: `   ${SUBJECT}   ` });
    await submit(user);

    await waitFor(() => assert.equal(api.calls('POST', '/api/tickets').length, 1));
    assert.equal(api.calls('POST', '/api/tickets')[0].body.subject, SUBJECT);
    assert.ok(await screen.findByRole('heading', { name: SUBJECT }));
  });

  it('while submitting the form is locked, and a second click creates nothing', async () => {
    const ticket = created();
    const answer = deferred();
    const { api, user } = open(ticketStore([ticket]).routes());
    api.on('POST /api/tickets', () => answer.promise);

    await fillForm(user);
    const button = screen.getByRole('button', { name: 'Submit ticket' });
    await user.dblClick(button);

    assert.ok(await screen.findByRole('button', { name: 'Submitting…' }));
    assert.equal(button.disabled, true);
    assert.equal(screen.getByLabelText('Subject').disabled, true);
    await user.click(button);
    assert.equal(api.calls('POST', '/api/tickets').length, 1);

    answer.release(reply(201, { ticket: asDetail(ticket) }));
    assert.ok(await screen.findByRole('heading', { name: SUBJECT }));
    assert.equal(api.calls('POST', '/api/tickets').length, 1);
  });
});

describe('when the API refuses or fails', () => {
  const failures = [
    ['a server failure', () => serverError(), /The server had a problem/],
    ['a validation message', () => failure(400, 'VALIDATION_ERROR', 'subject must be at most 120 characters'), /subject must be at most 120 characters/],
    ['no connection', () => { throw new TypeError('fetch failed'); }, /Cannot reach the server/],
  ];

  for (const [name, route, message] of failures) {
    it(`${name} shows a message and keeps everything typed`, async () => {
      const { user, path } = open({ 'POST /api/tickets': route });

      await fillForm(user);
      await submit(user);

      assert.match((await screen.findByRole('alert')).textContent, message);
      assert.equal(path(), '/tickets/new');
      assert.equal(screen.getByLabelText('Subject').value, SUBJECT);
      assert.equal(screen.getByLabelText('Description').value, DESCRIPTION);
      assert.equal(screen.getByLabelText('Category').value, billing.id);
      assert.equal(screen.getByLabelText('Priority').value, 'high');
      assert.equal(screen.getByRole('button', { name: 'Submit ticket' }).disabled, false);
    });
  }

  it('retrying unchanged content reuses the key, and changed content gets a new one', async () => {
    const { api, user } = open({ 'POST /api/tickets': () => serverError() });

    await fillForm(user);
    await submit(user);
    await screen.findByRole('alert');
    await submit(user);
    await waitFor(() => assert.equal(api.calls('POST', '/api/tickets').length, 2));
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Submit ticket' }).disabled, false));

    await user.type(screen.getByLabelText('Subject'), ' again');
    await submit(user);
    await waitFor(() => assert.equal(api.calls('POST', '/api/tickets').length, 3));
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Submit ticket' }).disabled, false));

    const [first, retry, changed] = api.calls('POST', '/api/tickets').map((request) => request.headers['Idempotency-Key']);
    assert.equal(retry, first, 'a retry cannot create a second ticket');
    assert.notEqual(changed, first);
  });

  it('a category deactivated meanwhile clears the choice, says so and reloads the list', async () => {
    const { api, user } = open({ 'POST /api/tickets': () => failure(400, 'VALIDATION_ERROR', 'categoryId must be an active category') });

    await fillForm(user);
    api.on('GET /api/categories', () => ({ categories: [accountLogin] }));
    await submit(user);

    assert.ok(await screen.findByText('That category is no longer available. Choose another one.'));
    assert.equal(screen.getByLabelText('Category').value, '');
    await waitFor(() => assert.equal(screen.queryByRole('option', { name: 'Billing' }), null));
    assert.ok(screen.getByRole('option', { name: 'Account & Login' }));
    assert.equal(screen.getByLabelText('Subject').value, SUBJECT);
    assert.equal(screen.queryByRole('alert'), null);
  });
});
