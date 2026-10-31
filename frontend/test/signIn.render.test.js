import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deferred, failure, renderApp, reply, screen, serverError, setupRenderTests, storedToken, waitFor } from './helpers/renderApp.js';
import { admin, agent, categoryRoutes, customer, statsFor, ticketStore } from './helpers/fixtures.js';

// RT-3: the real sign-in and sign-up pages, typing and clicking as a person would. No request leaves
// the test: fetch is the only thing faked.

setupRenderTests();

const TOKEN = 'token-from-the-api';
const signedIn = (user) => reply(200, { user, token: TOKEN });
const asReturnedUser = (user) => ({ 'GET /api/auth/me': () => ({ user }), 'GET /api/notifications/unread-count': () => ({ unreadCount: 0 }) });
const screens = () => ({ ...ticketStore([]).routes(), ...categoryRoutes(), 'GET /api/admin/stats': () => statsFor([]) });
const invalidOf = (field) => field.getAttribute('aria-invalid') === 'true';

async function fillCustomerLogin(user, email = 'asha@example.test', password = 'correct-horse-1') {
  await user.type(screen.getByLabelText('Email address'), email);
  await user.type(screen.getByLabelText('Password'), password);
}

describe('customer sign-in', () => {
  it('valid details sign in, store the token and open the tickets page', async () => {
    const { api, user, path } = renderApp('/login', { routes: { ...screens(), ...asReturnedUser(customer), 'POST /api/auth/login': () => signedIn(customer) } });

    await fillCustomerLogin(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    assert.ok(await screen.findByRole('heading', { name: /here are your tickets/ }));
    assert.equal(path(), '/tickets');
    assert.equal(storedToken(), TOKEN);
    assert.deepEqual(api.calls('POST', '/api/auth/login')[0].body, { email: 'asha@example.test', password: 'correct-horse-1' });
  });

  it('after signing in, the customer returns to the page that sent them here', async () => {
    const { user, path } = renderApp('/tickets/new', { routes: { ...screens(), ...asReturnedUser(customer), 'POST /api/auth/login': () => signedIn(customer) } });

    assert.ok(await screen.findByRole('heading', { name: 'Welcome back' }));
    await fillCustomerLogin(user);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    assert.ok(await screen.findByRole('heading', { name: 'Raise a ticket' }));
    assert.equal(path(), '/tickets/new');
  });

  it('empty fields show their errors, linked to the fields, and send nothing', async () => {
    const { api, user } = renderApp('/login');

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    assert.ok(await screen.findByText('Email is required.'));
    assert.ok(screen.getByText('Password is required.'));
    const email = screen.getByLabelText('Email address');
    assert.ok(invalidOf(email));
    assert.equal(email.getAttribute('aria-describedby'), 'customer-email-error');
    assert.deepEqual(api.requests, []);
  });

  it('an invalid email address is refused before sending', async () => {
    const { api, user } = renderApp('/login');

    await fillCustomerLogin(user, 'not-an-email');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    assert.ok(await screen.findByText('Enter a valid email address.'));
    assert.equal(screen.queryByText('Password is required.'), null);
    assert.deepEqual(api.requests, []);
  });

  const failures = [
    ['wrong details', () => failure(401, 'INVALID_CREDENTIALS', 'Invalid email or password'), 'Invalid email or password.'],
    ['a deactivated account', () => failure(403, 'ACCOUNT_DISABLED', 'This account has been deactivated'), 'This account has been deactivated. Contact support.'],
    ['too many attempts', () => failure(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait a few minutes and try again.'), 'Too many sign-in attempts. Please wait a few minutes and try again.'],
    ['a server failure', () => serverError(), 'The server had a problem. Please try again in a moment.'],
    ['no connection', () => { throw new TypeError('fetch failed'); }, 'Cannot reach the server. Check your connection and try again.'],
  ];

  for (const [name, route, message] of failures) {
    it(`${name} shows a message and keeps the form usable`, async () => {
      const { user, path } = renderApp('/login', { routes: { 'POST /api/auth/login': route } });

      await fillCustomerLogin(user);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      assert.equal((await screen.findByRole('alert')).textContent, message);
      assert.equal(path(), '/login');
      assert.equal(storedToken(), null);
      assert.equal(screen.getByLabelText('Email address').value, 'asha@example.test');
      assert.equal(screen.getByRole('button', { name: /sign in/i }).disabled, false);
    });
  }

  it('a staff account is refused here, with a link to the staff sign-in, and no session starts', async () => {
    const { user, path } = renderApp('/login', { routes: { 'POST /api/auth/login': () => signedIn(agent) } });

    await fillCustomerLogin(user, 'ravi@example.test');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    assert.match(alert.textContent, /This sign-in is for customers/);
    assert.ok(alert.querySelector('a[href="/staff/login"]'));
    assert.equal(storedToken(), null);
    assert.equal(path(), '/login');
  });

  it('while signing in the form is locked, and a second click sends nothing', async () => {
    const answer = deferred();
    const { api, user } = renderApp('/login', { routes: { ...screens(), ...asReturnedUser(customer), 'POST /api/auth/login': () => answer.promise } });

    await fillCustomerLogin(user);
    const button = screen.getByRole('button', { name: /sign in/i });
    await user.click(button);

    assert.ok(await screen.findByRole('button', { name: 'Signing in…' }));
    assert.equal(button.disabled, true);
    assert.equal(screen.getByLabelText('Email address').disabled, true);
    await user.click(button);
    await user.keyboard('{Enter}');
    assert.equal(api.calls('POST', '/api/auth/login').length, 1);

    answer.release(signedIn(customer));
    assert.ok(await screen.findByRole('heading', { name: /here are your tickets/ }));
    assert.equal(api.calls('POST', '/api/auth/login').length, 1);
  });

  it('wrong details submitted with Enter show the message and send one request', async () => {
    const { api, user } = renderApp('/login', { routes: { 'POST /api/auth/login': () => failure(401, 'INVALID_CREDENTIALS', 'Invalid email or password') } });

    await fillCustomerLogin(user);
    await user.keyboard('{Enter}');

    assert.equal((await screen.findByRole('alert')).textContent, 'Invalid email or password.');
    assert.equal(api.calls('POST', '/api/auth/login').length, 1, 'Enter submits the form once');
  });
});

describe('customer sign-up', () => {
  async function fillSignup(user, overrides = {}) {
    const values = { name: 'Asha Customer', email: 'asha@example.test', password: 'correct-horse-1', confirm: 'correct-horse-1', ...overrides };
    if (values.name) await user.type(screen.getByLabelText('Full name'), values.name);
    if (values.email) await user.type(screen.getByLabelText('Email address'), values.email);
    if (values.password) await user.type(screen.getByLabelText('Password'), values.password);
    if (values.confirm) await user.type(screen.getByLabelText('Confirm password'), values.confirm);
  }

  it('valid details create the account, sign in and open the tickets page', async () => {
    const { api, user, path } = renderApp('/signup', {
      routes: { ...screens(), ...asReturnedUser(customer), 'POST /api/auth/register': () => reply(201, { user: customer, token: TOKEN }) },
    });

    await fillSignup(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    assert.ok(await screen.findByRole('heading', { name: /here are your tickets/ }));
    assert.equal(path(), '/tickets');
    assert.equal(storedToken(), TOKEN);
    assert.deepEqual(api.calls('POST', '/api/auth/register')[0].body, { name: 'Asha Customer', email: 'asha@example.test', password: 'correct-horse-1' });
  });

  it('empty fields show their errors and send nothing', async () => {
    const { api, user } = renderApp('/signup');

    await user.click(screen.getByRole('button', { name: /create account/i }));

    assert.ok(await screen.findByText('Name is required.'));
    assert.ok(screen.getByText('Email is required.'));
    assert.ok(screen.getByText('Password is required.'));
    assert.ok(invalidOf(screen.getByLabelText('Full name')));
    assert.deepEqual(api.requests, []);
  });

  it('a short password and a mismatched confirmation are refused', async () => {
    const { api, user } = renderApp('/signup');

    await fillSignup(user, { password: 'short', confirm: 'short' });
    await user.click(screen.getByRole('button', { name: /create account/i }));
    assert.ok(await screen.findByText('Password must be at least 8 characters.'));

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'correct-horse-1');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    assert.ok(await screen.findByText('Passwords do not match.'));
    assert.deepEqual(api.requests, []);
  });

  it('a taken email shows its message and keeps what was typed', async () => {
    const { user, path } = renderApp('/signup', { routes: { 'POST /api/auth/register': () => failure(409, 'EMAIL_TAKEN', 'Email is already registered') } });

    await fillSignup(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    assert.equal((await screen.findByRole('alert')).textContent, 'An account with this email already exists. Sign in instead.');
    assert.equal(screen.getByLabelText('Full name').value, 'Asha Customer');
    assert.equal(path(), '/signup');
    assert.equal(storedToken(), null);
  });

  it('while creating the account a second click sends nothing', async () => {
    const answer = deferred();
    const { api, user } = renderApp('/signup', { routes: { ...screens(), ...asReturnedUser(customer), 'POST /api/auth/register': () => answer.promise } });

    await fillSignup(user);
    const button = screen.getByRole('button', { name: /create account/i });
    await user.dblClick(button);

    assert.ok(await screen.findByRole('button', { name: 'Creating account…' }));
    assert.equal(api.calls('POST', '/api/auth/register').length, 1);

    answer.release(reply(201, { user: customer, token: TOKEN }));
    assert.ok(await screen.findByRole('heading', { name: /here are your tickets/ }));
  });
});

describe('staff sign-in', () => {
  async function fillStaffLogin(user, email, password = 'correct-horse-1') {
    await user.type(screen.getByLabelText('Email address'), email);
    await user.type(screen.getByLabelText('Password'), password);
  }

  for (const [staff, heading, destination] of [
    [agent, 'Agent navigation', '/agent/dashboard'],
    [admin, 'Admin navigation', '/admin/dashboard'],
  ]) {
    it(`${staff.role} lands on their own dashboard`, async () => {
      const { user, path } = renderApp('/staff/login', { routes: { ...screens(), ...asReturnedUser(staff), 'POST /api/auth/login': () => signedIn(staff) } });

      await fillStaffLogin(user, staff.email);
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      assert.ok(await screen.findByRole('navigation', { name: heading }));
      assert.equal(path(), destination);
      assert.equal(storedToken(), TOKEN);
    });
  }

  it('the workspace toggle does not decide where the user lands', async () => {
    const { user, path } = renderApp('/staff/login', { routes: { ...screens(), ...asReturnedUser(agent), 'POST /api/auth/login': () => signedIn(agent) } });

    await user.click(screen.getByRole('button', { name: 'admin' }));
    await fillStaffLogin(user, agent.email);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => assert.equal(path(), '/agent/dashboard'));
  });

  it('a blank password is refused before sending', async () => {
    const { api, user } = renderApp('/staff/login');

    await fillStaffLogin(user, agent.email, '   ');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    assert.equal((await screen.findByRole('alert')).textContent, 'Please enter your email and password.');
    assert.deepEqual(api.requests, []);
  });

  it('a customer account is refused, and no session starts', async () => {
    const { user, path } = renderApp('/staff/login', { routes: { 'POST /api/auth/login': () => signedIn(customer) } });

    await fillStaffLogin(user, customer.email);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    assert.match((await screen.findByRole('alert')).textContent, /This sign-in is for authorized support staff/);
    assert.equal(storedToken(), null);
    assert.equal(path(), '/staff/login');
  });

  it('wrong details show a message and unlock the form', async () => {
    const { user } = renderApp('/staff/login', { routes: { 'POST /api/auth/login': () => failure(401, 'INVALID_CREDENTIALS', 'Invalid email or password') } });

    await fillStaffLogin(user, agent.email);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    assert.equal((await screen.findByRole('alert')).textContent, 'Invalid email or password.');
    assert.equal(screen.getByLabelText('Email address').disabled, false);
  });

  it('while signing in a second click sends nothing', async () => {
    const answer = deferred();
    const { api, user } = renderApp('/staff/login', { routes: { ...screens(), ...asReturnedUser(agent), 'POST /api/auth/login': () => answer.promise } });

    await fillStaffLogin(user, agent.email);
    await user.dblClick(screen.getByRole('button', { name: /sign in/i }));

    assert.ok(await screen.findByRole('button', { name: 'Signing in…' }));
    assert.equal(api.calls('POST', '/api/auth/login').length, 1);

    answer.release(signedIn(agent));
    assert.ok(await screen.findByRole('navigation', { name: 'Agent navigation' }));
  });
});
