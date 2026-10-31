import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, expired, failure, renderApp, reply, screen, serverError, setupRenderTests, storedToken, tokenFor, waitFor } from './helpers/renderApp.js';
import { admin, agent, customer, makeTicket, statsFor, ticketStore } from './helpers/fixtures.js';

// RT-1: who can reach which screen, with the real App, route guards and AuthProvider in a real DOM.

setupRenderTests();

const customerHeading = /here are your tickets/;
const staffSignIn = 'Sign in to access your support workspace.';

const emailStatus = { 'GET /api/auth/me/email': () => ({ pendingEmail: null, expiresAt: null }) };
const screens = (tickets = []) => ({ ...ticketStore(tickets).routes(), 'GET /api/admin/stats': () => statsFor(tickets), ...emailStatus });

describe('signed-out visitors', () => {
  for (const path of ['/tickets', '/tickets/new', '/tickets/6718f0c2a1b2c3d4e5f60200', '/profile']) {
    it(`${path} goes to the customer sign-in, with no request`, async () => {
      const { api, path: current } = renderApp(path);

      assert.ok(await screen.findByRole('heading', { name: 'Welcome back' }));
      assert.equal(current(), '/login');
      assert.deepEqual(api.requests, []);
    });
  }

  for (const path of ['/agent/dashboard', '/admin/dashboard', '/staff/account']) {
    it(`${path} goes to the staff sign-in, with no request`, async () => {
      const { api, path: current } = renderApp(path);

      assert.ok(await screen.findByText(staffSignIn));
      assert.equal(current(), '/staff/login');
      assert.deepEqual(api.requests, []);
    });
  }
});

describe('the right role reaches its screen', () => {
  it('a customer sees their tickets', async () => {
    const { path } = renderApp('/tickets', { as: customer, routes: screens([makeTicket({ subject: 'My printer is on fire' })]) });

    assert.ok(await screen.findByRole('heading', { name: customerHeading }));
    assert.ok(await screen.findByText('My printer is on fire'));
    assert.equal(path(), '/tickets');
  });

  it('an agent sees the agent dashboard', async () => {
    const { path } = renderApp('/agent/dashboard', { as: agent, routes: screens() });

    assert.ok(await screen.findByRole('navigation', { name: 'Agent navigation' }));
    assert.ok(await screen.findByRole('heading', { name: 'Overview' }));
    assert.equal(path(), '/agent/dashboard');
  });

  it('an admin sees the admin dashboard', async () => {
    const { path } = renderApp('/admin/dashboard', { as: admin, routes: screens() });

    assert.ok(await screen.findByRole('navigation', { name: 'Admin navigation' }));
    assert.ok(await screen.findByRole('heading', { name: 'Overview' }));
    assert.equal(path(), '/admin/dashboard');
  });

  for (const staff of [agent, admin]) {
    it(`${staff.role} reaches the staff account page`, async () => {
      const { path } = renderApp('/staff/account', { as: staff, routes: screens() });

      assert.ok(await screen.findByRole('heading', { name: 'Password' }));
      assert.equal(path(), '/staff/account');
    });
  }
});

describe('the wrong role is sent to its own area', () => {
  const cases = [
    ['customer', customer, '/agent/dashboard', '/tickets'],
    ['customer', customer, '/admin/dashboard', '/tickets'],
    ['customer', customer, '/staff/account', '/tickets'],
    ['agent', agent, '/admin/dashboard', '/agent/dashboard'],
    ['agent', agent, '/tickets', '/agent/dashboard'],
    ['admin', admin, '/agent/dashboard', '/admin/dashboard'],
    ['admin', admin, '/profile', '/admin/dashboard'],
  ];

  for (const [role, user, from, to] of cases) {
    it(`${role} at ${from} lands on ${to}`, async () => {
      const { api, path } = renderApp(from, { as: user, routes: screens() });

      await waitFor(() => assert.equal(path(), to));
      // The target screen rendered; nothing from the refused one did.
      assert.ok(await screen.findByRole('navigation', { name: role === 'customer' ? 'Customer navigation' : `${role === 'agent' ? 'Agent' : 'Admin'} navigation` }));
      assert.equal(api.calls('GET', '/api/admin/stats').length, role === 'admin' ? 1 : 0, 'no admin data is requested for anyone else');
    });
  }

  it('signed-in users skip the sign-in pages', async () => {
    const { path } = renderApp('/login', { as: customer, routes: screens() });

    assert.ok(await screen.findByRole('heading', { name: customerHeading }));
    assert.equal(path(), '/tickets');
  });
});

describe('checking a stored token', () => {
  it('shows only a holding screen until the backend answers', async () => {
    const answer = deferred();
    renderApp('/tickets', { as: customer, routes: { ...screens([makeTicket({ subject: 'Hidden until confirmed' })]), 'GET /api/auth/me': () => answer.promise } });

    assert.ok(await screen.findByRole('status'));
    assert.ok(screen.getByText('Checking your session…'));
    assert.equal(screen.queryByText('Hidden until confirmed'), null);
    assert.equal(screen.queryByRole('heading', { name: customerHeading }), null);

    answer.release({ user: customer });
    assert.ok(await screen.findByRole('heading', { name: customerHeading }));
  });

  it('a rejected token is forgotten, with a notice on the sign-in page', async () => {
    const { path } = renderApp('/tickets', { as: customer, routes: { ...screens(), 'GET /api/auth/me': () => expired() } });

    assert.ok(await screen.findByRole('heading', { name: 'Welcome back' }));
    assert.equal(screen.getByRole('alert').textContent, 'Your session has expired. Please sign in again.');
    assert.equal(storedToken(), null);
    assert.equal(path(), '/login');
  });

  it('a rejected staff token goes to the staff sign-in', async () => {
    const { path } = renderApp('/admin/dashboard', { as: admin, routes: { ...screens(), 'GET /api/auth/me': () => expired() } });

    assert.ok(await screen.findByText(staffSignIn));
    assert.equal(screen.getByRole('alert').textContent, 'Your session has expired. Please sign in again.');
    assert.equal(path(), '/staff/login');
  });

  it('a deactivated account is signed out and told why', async () => {
    renderApp('/tickets', {
      as: customer,
      routes: { ...screens(), 'GET /api/auth/me': () => failure(403, 'ACCOUNT_DISABLED', 'This account has been deactivated') },
    });

    assert.ok(await screen.findByRole('heading', { name: 'Welcome back' }));
    assert.equal(screen.getByRole('alert').textContent, 'This account has been deactivated. Contact an administrator.');
    assert.equal(storedToken(), null);
  });

  it('a server failure keeps the token and offers a retry that works', async () => {
    const { api, user } = renderApp('/tickets', { as: customer, routes: { ...screens(), 'GET /api/auth/me': () => serverError() } });

    assert.ok(await screen.findByText("We couldn't check your session. The server may be unavailable."));
    assert.equal(storedToken(), tokenFor(customer), 'an outage is not a sign-out');
    assert.equal(screen.queryByRole('heading', { name: customerHeading }), null);

    api.on('GET /api/auth/me', () => ({ user: customer }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    assert.ok(await screen.findByRole('heading', { name: customerHeading }));
  });

  it('no connection behaves like a server failure', async () => {
    renderApp('/agent/dashboard', {
      as: agent,
      routes: {
        ...screens(),
        'GET /api/auth/me': () => {
          throw new TypeError('fetch failed');
        },
      },
    });

    assert.ok(await screen.findByText("We couldn't check your session. The server may be unavailable."));
    assert.equal(storedToken(), tokenFor(agent));
  });

  it('the role comes from the backend: a token whose user is now an agent is treated as one', async () => {
    const { path } = renderApp('/tickets', {
      as: customer,
      routes: { ...screens(), 'GET /api/auth/me': () => reply(200, { user: { ...customer, role: 'agent' } }) },
    });

    await waitFor(() => assert.equal(path(), '/agent/dashboard'));
  });

  it('works under StrictMode, as main.jsx renders it', async () => {
    renderApp('/tickets', { as: customer, routes: screens([makeTicket({ subject: 'Strict subject' })]), strict: true });

    assert.ok(await screen.findByRole('heading', { name: customerHeading }));
    assert.ok(await screen.findByText('Strict subject'));
  });
});
