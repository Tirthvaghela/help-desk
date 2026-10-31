import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, expired, failure, renderApp, screen, setupRenderTests, storedToken, tokenFor, waitFor, within } from './helpers/renderApp.js';
import { admin, adminRoutes, agent, categoryRoutes, customer, makeTicket, ticketStore } from './helpers/fixtures.js';

// RT-2: a session rejected while a screen is in use. The backend's 401 ends it; the user sees the
// sign-in page with a notice, and nothing from the protected screen stays on the page.

setupRenderTests();

const EXPIRED_NOTICE = 'Your session has expired. Please sign in again.';
const disabled = () => failure(403, 'ACCOUNT_DISABLED', 'This account has been deactivated');

async function assertSignedOut(path, { signIn, secret }) {
  assert.ok(await screen.findByText(signIn));
  assert.equal(path(), signIn === 'Welcome back' ? '/login' : '/staff/login');
  assert.equal(storedToken(), null, 'the token is gone');
  if (secret) assert.equal(screen.queryByText(secret), null, 'protected text is gone');
}

const customerSignIn = { signIn: 'Welcome back' };
const staffSignIn = { signIn: 'Sign in to access your support workspace.' };

describe('while a customer screen loads', () => {
  it('the ticket list goes from loading to the sign-in page', async () => {
    const answer = deferred();
    const { path } = renderApp('/tickets', { as: customer, routes: { 'GET /api/tickets/my': () => answer.promise } });

    assert.ok(await screen.findByRole('list', { name: 'Loading tickets' }));
    answer.release(expired());

    await assertSignedOut(path, customerSignIn);
    assert.equal(screen.getByRole('alert').textContent, EXPIRED_NOTICE);
    assert.equal(screen.queryByRole('list', { name: 'Loading tickets' }), null);
  });

  it('ticket details go to the sign-in page', async () => {
    const ticket = makeTicket({ subject: 'Secret subject' });
    const { path } = renderApp(`/tickets/${ticket.id}`, {
      as: customer,
      routes: { ...ticketStore([ticket]).routes(), 'GET /api/tickets/:id/comments': () => expired() },
    });

    await assertSignedOut(path, { ...customerSignIn, secret: 'Secret subject' });
    assert.equal(screen.getByRole('alert').textContent, EXPIRED_NOTICE);
  });

  it('a 401 on the unread count alone also ends the session', async () => {
    const { path } = renderApp('/tickets', {
      as: customer,
      routes: { ...ticketStore([makeTicket({ subject: 'Secret subject' })]).routes(), 'GET /api/notifications/unread-count': () => expired() },
    });

    await assertSignedOut(path, { ...customerSignIn, secret: 'Secret subject' });
  });
});

describe('while a customer acts', () => {
  it('submitting a new ticket goes to the sign-in page, not an error on the form', async () => {
    const { user, path } = renderApp('/tickets/new', { as: customer, routes: { ...categoryRoutes(), 'POST /api/tickets': () => expired() } });

    await screen.findByRole('option', { name: 'Billing' });
    await user.type(screen.getByLabelText('Subject'), 'Cannot reach my invoices');
    await user.selectOptions(screen.getByLabelText('Category'), 'Billing');
    await user.type(screen.getByLabelText('Description'), 'The invoices page stays blank.');
    await user.click(screen.getByRole('button', { name: 'Submit ticket' }));

    await assertSignedOut(path, customerSignIn);
    assert.equal(screen.getByRole('alert').textContent, EXPIRED_NOTICE);
    assert.equal(screen.queryByLabelText('Subject'), null);
  });

  it('sending a reply goes to the sign-in page', async () => {
    const ticket = makeTicket({ subject: 'Secret subject' });
    const { user, path } = renderApp(`/tickets/${ticket.id}`, {
      as: customer,
      routes: { ...ticketStore([ticket]).routes(), 'POST /api/tickets/:id/comments': () => expired() },
    });

    await user.type(await screen.findByLabelText('Your reply'), 'Any news?');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    await assertSignedOut(path, { ...customerSignIn, secret: 'Secret subject' });
  });

  it('a deactivated account is told why', async () => {
    const ticket = makeTicket();
    const { user, path } = renderApp(`/tickets/${ticket.id}`, {
      as: customer,
      routes: { ...ticketStore([ticket]).routes(), 'POST /api/tickets/:id/comments': () => disabled() },
    });

    await user.type(await screen.findByLabelText('Your reply'), 'Any news?');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    await assertSignedOut(path, customerSignIn);
    assert.equal(screen.getByRole('alert').textContent, 'This account has been deactivated. Contact an administrator.');
  });
});

describe('while staff act', () => {
  it('an agent changing a ticket goes to the staff sign-in', async () => {
    const ticket = makeTicket({ subject: 'Secret queue subject' });
    const { user, path } = renderApp('/agent/dashboard?page=Inbox', {
      as: agent,
      routes: { ...categoryRoutes(), ...ticketStore([ticket]).routes(), 'PATCH /api/tickets/:id/assign': () => expired() },
    });

    await user.selectOptions(await screen.findByLabelText(/^Assignee/), 'You (Agent)');

    await assertSignedOut(path, { ...staffSignIn, secret: 'Secret queue subject' });
    assert.equal(screen.getByRole('alert').textContent, EXPIRED_NOTICE);
  });

  it('an admin changing a priority goes to the staff sign-in, and the dialog is gone', async () => {
    const ticket = makeTicket({ subject: 'Secret admin subject' });
    const { user, path } = renderApp(`/admin/dashboard?ticket=${ticket.id}`, {
      as: admin,
      routes: { ...adminRoutes([ticket]), ...ticketStore([ticket]).routes(), 'PATCH /api/tickets/:id/assign': () => expired() },
    });

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(await within(dialog).findByLabelText(/^Priority/), 'High');

    await assertSignedOut(path, { ...staffSignIn, secret: 'Secret admin subject' });
    assert.equal(screen.queryByRole('dialog'), null);
  });

  it('an admin sending a reply goes to the staff sign-in', async () => {
    const ticket = makeTicket();
    const { user, path } = renderApp(`/admin/dashboard?ticket=${ticket.id}`, {
      as: admin,
      routes: { ...adminRoutes([ticket]), ...ticketStore([ticket]).routes(), 'POST /api/tickets/:id/comments': () => expired() },
    });

    const dialog = await screen.findByRole('dialog');
    await user.type(await within(dialog).findByLabelText('Your reply'), 'Looking into it.');
    await user.click(within(dialog).getByRole('button', { name: 'Send reply' }));

    await assertSignedOut(path, staffSignIn);
  });
});

describe('errors that are not about the session', () => {
  it('403 FORBIDDEN keeps the user signed in and shows the refusal', async () => {
    const ticket = makeTicket({ assignedTo: { id: agent.id, name: agent.name, role: agent.role } });
    const { user, path } = renderApp('/agent/dashboard?page=Inbox', {
      as: agent,
      routes: { ...categoryRoutes(), ...ticketStore([ticket]).routes(), 'PATCH /api/tickets/:id/status': () => failure(403, 'FORBIDDEN', 'Not allowed') },
    });

    await user.selectOptions(await screen.findByLabelText(/^Status/), 'In Progress');

    assert.equal((await screen.findByRole('alert')).textContent, 'You do not have access to this ticket.');
    assert.equal(storedToken(), tokenFor(agent));
    assert.equal(path(), '/agent/dashboard?page=Inbox');
  });

  it('a server error keeps the user signed in', async () => {
    const { path } = renderApp('/tickets', { as: customer, routes: { 'GET /api/tickets/my': () => failure(500, 'INTERNAL_ERROR', 'Something went wrong') } });

    await waitFor(() => assert.ok(screen.getAllByRole('alert').length > 0));
    assert.equal(storedToken(), tokenFor(customer));
    assert.equal(path(), '/tickets');
  });
});
