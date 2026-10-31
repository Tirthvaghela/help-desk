import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act, deferred, expired, failure, renderApp, reply, screen, serverError, setupRenderTests, storedToken, tokenFor, waitFor, within } from './helpers/renderApp.js';
import { customer } from './helpers/fixtures.js';

// The email section after a password change (contract §6a): the real AccountSecurity on the real
// /profile page, with real React in a real (jsdom) DOM. Only fetch is faked.

setupRenderTests();

const EMAIL_ROUTE = 'GET /api/auth/me/email';
const EMAIL_PATH = '/api/auth/me/email';
const PASSWORD_PATH = '/api/auth/me/password';
const OLD_TOKEN = tokenFor(customer);
const NEW_TOKEN = 'token-after-password-change';
const EXPIRES = '2026-11-01T10:00:00.000Z';
const WAITING = { pendingEmail: 'waiting@example.test', expiresAt: EXPIRES };
const NOTHING_WAITING = { pendingEmail: null, expiresAt: null };
const PASSWORDS = { currentPassword: 'old-pass-12', newPassword: 'new-pass-12', confirmPassword: 'new-pass-12' };
const CHECK_FAILED = /could not check whether an email change is waiting/i;
const OUT_OF_DATE = /could not refresh.*may be out of date/i;

const email = () => screen.getByRole('region', { name: 'Email address' });
const password = () => screen.getByRole('region', { name: 'Password' });
const banner = () => within(email()).queryByRole('status');
const emailAlert = () => within(email()).queryAllByRole('alert').map((alert) => alert.textContent).join(' ');
const retryButton = () => within(email()).queryByRole('button', { name: 'Try again' });
const noConnection = () => {
  throw new TypeError('fetch failed');
};

// Lets finished requests reach the screen, for when the expected result is that nothing appears.
const settle = () =>
  act(async () => {
    for (let round = 0; round < 5; round += 1) await new Promise((resolve) => setImmediate(resolve));
  });

async function open({ pending = WAITING, routes = {} } = {}) {
  const app = renderApp('/profile', {
    as: customer,
    routes: {
      [EMAIL_ROUTE]: () => pending,
      [`POST ${PASSWORD_PATH}`]: () => reply(200, { user: customer, token: NEW_TOKEN }),
      ...routes,
    },
  });
  await screen.findByRole('region', { name: 'Email address' });
  await settle();
  const emailLoads = () => app.api.calls('GET', EMAIL_PATH);
  const passwordPosts = () => app.api.calls('POST', PASSWORD_PATH);
  return { ...app, emailLoads, passwordPosts };
}

async function fillPassword(user, values = PASSWORDS) {
  const form = within(password());
  await user.type(form.getByLabelText('Current password'), values.currentPassword);
  await user.type(form.getByLabelText('New password'), values.newPassword);
  await user.type(form.getByLabelText('Confirm new password'), values.confirmPassword);
}

async function changePassword(user) {
  await fillPassword(user);
  await user.click(within(password()).getByRole('button', { name: 'Change password' }));
  await settle();
}

async function fillEmail(user, newEmail, currentPassword = 'old-pass-12') {
  const form = within(email());
  await user.type(form.getByLabelText('New email address'), newEmail);
  await user.type(form.getByLabelText('Current password'), currentPassword);
}

const sendEmailChange = (user) => user.click(within(email()).getByRole('button', { name: 'Send confirmation link' }));
const cancelEmailChange = (user) => user.click(within(email()).getByRole('button', { name: 'Cancel change' }));

describe('after a successful password change', () => {
  it('loads the email status once more, with the new token', async () => {
    const { api, emailLoads, passwordPosts, user } = await open();
    assert.equal(emailLoads().length, 1);
    assert.equal(emailLoads()[0].token, OLD_TOKEN);

    await changePassword(user);

    assert.equal(passwordPosts().length, 1);
    assert.equal(emailLoads().length, 2, 'exactly one refresh');
    assert.equal(emailLoads()[1].token, NEW_TOKEN);
    assert.equal(storedToken(), NEW_TOKEN);
    assert.ok(api.requests.indexOf(emailLoads()[1]) > api.requests.indexOf(passwordPosts()[0]), 'after the change');
  });

  it('removes "waiting for confirmation" when the server has cancelled the change', async () => {
    const { api, user } = await open();
    assert.match(banner().textContent, /Waiting for confirmation of waiting@example\.test/);

    api.on(EMAIL_ROUTE, () => NOTHING_WAITING);
    await changePassword(user);

    assert.equal(banner(), null);
    assert.equal(within(email()).queryByRole('button', { name: 'Cancel change' }), null);
    assert.equal(emailAlert(), '');
  });

  it("shows the server's latest pending change when one is still waiting", async () => {
    const { api, user } = await open({ pending: NOTHING_WAITING });
    assert.equal(banner(), null);

    api.on(EMAIL_ROUTE, () => ({ pendingEmail: 'latest@example.test', expiresAt: EXPIRES }));
    await changePassword(user);

    assert.match(banner().textContent, /Waiting for confirmation of latest@example\.test/);
    assert.ok(within(email()).getByRole('button', { name: 'Cancel change' }));
  });

  it('leaves what is typed in the email form alone, and clears the password form', async () => {
    const { user } = await open();
    await fillEmail(user, 'typing@example.test', 'still-typing');

    await changePassword(user);

    assert.equal(within(email()).getByLabelText('New email address').value, 'typing@example.test');
    assert.equal(within(email()).getByLabelText('Current password').value, 'still-typing');
    assert.equal(within(password()).getByLabelText('Current password').value, '');
    assert.equal(within(password()).getByLabelText('New password').value, '');
    assert.ok(within(password()).getByText(/Your password was changed/));
  });

  it('a second submit in flight sends one change and one refresh', async () => {
    const answer = deferred();
    const { emailLoads, passwordPosts, user } = await open({ routes: { [`POST ${PASSWORD_PATH}`]: () => answer.promise } });

    await fillPassword(user);
    await user.dblClick(within(password()).getByRole('button', { name: 'Change password' }));

    assert.ok(await within(password()).findByRole('button', { name: 'Saving…' }));
    assert.equal(passwordPosts().length, 1);

    answer.release(reply(200, { user: customer, token: NEW_TOKEN }));
    assert.ok(await within(password()).findByText(/Your password was changed/));
    await settle();
    assert.equal(passwordPosts().length, 1);
    assert.equal(emailLoads().length, 2);
  });

  it('ignores a late answer to the load sent with the old token', async () => {
    const answer = deferred();
    const { api, emailLoads, user } = await open({ routes: { [EMAIL_ROUTE]: () => answer.promise } });
    assert.equal(emailLoads().length, 1);

    api.on(EMAIL_ROUTE, () => NOTHING_WAITING);
    await changePassword(user);
    assert.equal(banner(), null);

    answer.release(WAITING);
    await settle();
    assert.equal(banner(), null);
    assert.equal(emailLoads().length, 2);
  });
});

describe('when the password change fails', () => {
  const failures = [
    ['wrong current password', () => failure(400, 'INVALID_CURRENT_PASSWORD', 'Your current password is incorrect'), /current password is incorrect/],
    ['server error', () => serverError(), /server had a problem/],
    ['no connection', noConnection, /Cannot reach the server/],
  ];

  for (const [name, route, message] of failures) {
    it(`does not refresh the email status (${name})`, async () => {
      const { emailLoads, passwordPosts, user } = await open({ routes: { [`POST ${PASSWORD_PATH}`]: route } });

      await changePassword(user);

      assert.equal(passwordPosts().length, 1);
      assert.equal(emailLoads().length, 1);
      assert.match(within(password()).getByRole('alert').textContent, message);
      assert.match(banner().textContent, /waiting@example\.test/);
      assert.equal(storedToken(), OLD_TOKEN);
      assert.equal(within(password()).getByLabelText('New password').value, PASSWORDS.newPassword);
    });
  }

  it('sends nothing when the form is invalid', async () => {
    const { emailLoads, passwordPosts, user } = await open();

    await fillPassword(user, { ...PASSWORDS, confirmPassword: 'different-12' });
    await user.click(within(password()).getByRole('button', { name: 'Change password' }));

    assert.ok(await within(password()).findByText('The passwords do not match.'));
    assert.equal(passwordPosts().length, 0);
    assert.equal(emailLoads().length, 1);
  });
});

describe('when the email status cannot be loaded', () => {
  for (const [name, route] of [['server error', serverError], ['no connection', noConnection]]) {
    it(`keeps the last known change and says it may be out of date (${name})`, async () => {
      const { api, emailLoads, user } = await open();

      api.on(EMAIL_ROUTE, route);
      await changePassword(user);

      assert.equal(emailLoads().length, 2);
      assert.match(banner().textContent, /waiting@example\.test/);
      assert.match(emailAlert(), OUT_OF_DATE);
      assert.ok(within(password()).getByText(/Your password was changed/), 'the password change still succeeded');
      assert.equal(storedToken(), NEW_TOKEN);
    });
  }

  it('does not claim nothing is waiting when nothing was ever loaded', async () => {
    await open({ routes: { [EMAIL_ROUTE]: serverError } });

    assert.equal(banner(), null);
    assert.match(emailAlert(), CHECK_FAILED);
  });

  it('"Try again" loads once more and shows the server\'s answer', async () => {
    const { api, emailLoads, user } = await open();
    api.on(EMAIL_ROUTE, serverError);
    await changePassword(user);

    api.on(EMAIL_ROUTE, () => NOTHING_WAITING);
    await user.click(retryButton());
    await settle();

    assert.equal(emailLoads().length, 3);
    assert.equal(banner(), null);
    assert.equal(emailAlert(), '');
  });

  it('a change the user already cancelled does not come back', async () => {
    const { api, user } = await open({ routes: { [`DELETE ${EMAIL_PATH}`]: () => NOTHING_WAITING } });
    await cancelEmailChange(user);
    await settle();

    api.on(EMAIL_ROUTE, serverError);
    await changePassword(user);

    assert.equal(banner(), null);
    assert.match(emailAlert(), CHECK_FAILED);
  });

  it('a later answer from the server replaces the warning', async () => {
    const { api, user } = await open();
    api.on(EMAIL_ROUTE, serverError);
    await changePassword(user);
    assert.match(emailAlert(), OUT_OF_DATE);

    api.on(`POST ${EMAIL_PATH}`, () => reply(202, { pendingEmail: 'next@example.test', expiresAt: EXPIRES }));
    await fillEmail(user, 'next@example.test', 'new-pass-12');
    await sendEmailChange(user);
    await settle();

    assert.match(banner().textContent, /next@example\.test/);
    assert.equal(emailAlert(), '');
  });

  it('a rejected token ends the session', async () => {
    const { api, path, user } = await open();

    api.on(EMAIL_ROUTE, () => expired());
    await changePassword(user);

    assert.ok(await screen.findByRole('heading', { name: 'Welcome back' }));
    assert.equal(screen.getByRole('alert').textContent, 'Your session has expired. Please sign in again.');
    assert.equal(storedToken(), null);
    assert.equal(path(), '/login');
    assert.equal(screen.queryByRole('region', { name: 'Email address' }), null, 'the signed-in screen is gone');
  });

  it('a retry that fails again keeps the warning, the banner and a working retry', async () => {
    const { api, emailLoads, user } = await open();
    api.on(EMAIL_ROUTE, serverError);
    await changePassword(user);

    await user.click(retryButton());
    await settle();

    assert.equal(emailLoads().length, 3);
    assert.match(emailAlert(), OUT_OF_DATE);
    assert.match(banner().textContent, /waiting@example\.test/);
    assert.ok(retryButton());

    api.on(EMAIL_ROUTE, () => NOTHING_WAITING);
    await user.click(retryButton());
    await settle();
    assert.equal(emailLoads().length, 4);
    assert.equal(emailAlert(), '');
    assert.equal(banner(), null);
  });

  it('a retry answered with 401 signs the user out', async () => {
    const { api, path, user } = await open();
    api.on(EMAIL_ROUTE, serverError);
    await changePassword(user);

    api.on(EMAIL_ROUTE, () => expired());
    await user.click(retryButton());

    assert.ok(await screen.findByRole('heading', { name: 'Welcome back' }));
    assert.equal(screen.getByRole('alert').textContent, 'Your session has expired. Please sign in again.');
    assert.equal(storedToken(), null);
    assert.equal(path(), '/login');
    assert.equal(screen.queryByText(/waiting@example\.test/), null, 'nothing from the signed-in screen stays');
  });

  // Production shows no loading indicator during a retry: the warning and its button are removed
  // until the answer arrives. This records that behaviour, and that it blocks a second request.
  it('while a retry is running the warning and its button are gone, the banner stays, and nothing more is sent', async () => {
    const { api, emailLoads, user } = await open();
    api.on(EMAIL_ROUTE, serverError);
    await changePassword(user);

    const answer = deferred();
    api.on(EMAIL_ROUTE, () => answer.promise);
    await user.click(retryButton());

    await waitFor(() => assert.equal(emailLoads().length, 3));
    assert.equal(emailAlert(), '');
    assert.equal(retryButton(), null, 'there is no control left to click again');
    assert.match(banner().textContent, /waiting@example\.test/);
    await settle();
    assert.equal(emailLoads().length, 3);

    answer.release(NOTHING_WAITING);
    await settle();
    assert.equal(banner(), null);
    assert.equal(emailLoads().length, 3);
  });

  it('an account deactivated during a refresh is signed out and told why', async () => {
    const { api, path, user } = await open();

    api.on(EMAIL_ROUTE, () => failure(403, 'ACCOUNT_DISABLED', 'This account has been deactivated'));
    await changePassword(user);

    assert.ok(await screen.findByRole('heading', { name: 'Welcome back' }));
    assert.equal(screen.getByRole('alert').textContent, 'This account has been deactivated. Contact an administrator.');
    assert.equal(storedToken(), null);
    assert.equal(path(), '/login');
    assert.equal(screen.queryByRole('region', { name: 'Email address' }), null);
  });

  it('a rapid double click on the retry sends one request', async () => {
    const { api, emailLoads, user } = await open();
    api.on(EMAIL_ROUTE, serverError);
    await changePassword(user);

    const answer = deferred();
    api.on(EMAIL_ROUTE, () => answer.promise);
    await user.dblClick(retryButton());
    await settle();

    assert.equal(emailLoads().length, 3, 'the status is requested once for the double click');

    answer.release(WAITING);
    await settle();
    assert.equal(emailLoads().length, 3);
    assert.equal(emailAlert(), '');
  });
});

describe('existing account flows', () => {
  it('requests an email change: one POST, banner from the answer, its fields cleared, no extra load', async () => {
    const { api, emailLoads, user } = await open({
      pending: NOTHING_WAITING,
      routes: { [`POST ${EMAIL_PATH}`]: () => reply(202, { pendingEmail: 'next@example.test', expiresAt: EXPIRES }) },
    });

    await fillEmail(user, 'next@example.test');
    await sendEmailChange(user);
    await settle();

    const posts = api.calls('POST', EMAIL_PATH);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].body, { newEmail: 'next@example.test', currentPassword: 'old-pass-12' });
    assert.match(banner().textContent, /next@example\.test/);
    assert.equal(within(email()).getByLabelText('New email address').value, '');
    assert.equal(within(email()).getByLabelText('Current password').value, '');
    assert.equal(emailLoads().length, 1);
  });

  it('a failed email request shows its message and keeps the typed values and banner', async () => {
    const { user } = await open({ routes: { [`POST ${EMAIL_PATH}`]: () => failure(409, 'EMAIL_TAKEN', 'Email is already registered') } });

    await fillEmail(user, 'taken@example.test');
    await sendEmailChange(user);
    await settle();

    assert.match(emailAlert(), /already registered/);
    assert.equal(within(email()).getByLabelText('New email address').value, 'taken@example.test');
    assert.match(banner().textContent, /waiting@example\.test/);
  });

  it('cancelling removes the banner; a failed cancel keeps it', async () => {
    const { api, emailLoads, user } = await open({ routes: { [`DELETE ${EMAIL_PATH}`]: serverError } });

    await cancelEmailChange(user);
    await settle();
    assert.match(banner().textContent, /waiting@example\.test/);
    assert.match(emailAlert(), /server had a problem/);

    api.on(`DELETE ${EMAIL_PATH}`, () => NOTHING_WAITING);
    await cancelEmailChange(user);
    await settle();
    assert.equal(banner(), null);
    assert.equal(emailAlert(), '');
    assert.equal(emailLoads().length, 1);
  });

  it('a password change sends only the current and new password', async () => {
    const { passwordPosts, user } = await open();

    await changePassword(user);

    assert.deepEqual(passwordPosts()[0].body, {
      currentPassword: PASSWORDS.currentPassword,
      newPassword: PASSWORDS.newPassword,
    });
    assert.equal(passwordPosts()[0].token, OLD_TOKEN);
  });
});
