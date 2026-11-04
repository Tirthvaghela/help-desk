import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EmailDeliveryError, RESEND_API_URL, RESEND_TIMEOUT_MS, safeErrorDetails, sendWithResend } from '../src/services/email.js';

// The Resend HTTP API transport (services/email.js). fetch is replaced by a fake, so no request
// leaves this machine and no real email is sent. The key below is made up.

const FAKE_KEY = 're_test_NOT_A_REAL_KEY_123';
const ADDRESS = 'private.person@example.test';
const MESSAGE = {
  from: 'Help Desk <no-reply@helpdesk.example.test>',
  to: ADDRESS,
  subject: 'Reset your Help Desk password',
  text: 'Reset: https://app.example.test/reset-password?token=one-time-secret',
  html: '<p><a href="https://app.example.test/reset-password?token=one-time-secret">Reset</a></p>',
};
// Nothing in a log line or an error may include any of these.
const SECRETS = [FAKE_KEY, ADDRESS, 'one-time-secret', 'Reset your Help Desk password'];

const realFetch = globalThis.fetch;
let calls;
let respond;

beforeEach(() => {
  calls = [];
  respond = async () => new Response(JSON.stringify({ id: 'email-id' }), { status: 200 });
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const errorOf = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail('expected the send to fail');
};

function assertNothingSecret(text) {
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `"${secret}" leaked into: ${text}`);
}

describe('sendWithResend: the request', () => {
  it('POSTs to the Resend emails endpoint with the API key as a Bearer token', async () => {
    await sendWithResend(MESSAGE, { apiKey: FAKE_KEY });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(RESEND_API_URL, 'https://api.resend.com/emails');
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(calls[0].init.headers, { Authorization: `Bearer ${FAKE_KEY}`, 'Content-Type': 'application/json' });
  });

  it('sends the sender, recipient, subject, HTML and text', async () => {
    await sendWithResend(MESSAGE, { apiKey: FAKE_KEY });
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      from: MESSAGE.from,
      to: [ADDRESS],
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
  });

  it('a 200 answer is success', async () => {
    assert.equal(await sendWithResend(MESSAGE, { apiKey: FAKE_KEY }), undefined);
  });
});

describe('sendWithResend: time limit', () => {
  it('the default limit is 10 seconds, applied with an abort signal', async () => {
    assert.equal(RESEND_TIMEOUT_MS, 10_000);
    await sendWithResend(MESSAGE, { apiKey: FAKE_KEY });
    assert.ok(calls[0].init.signal instanceof AbortSignal);
    assert.equal(calls[0].init.signal.aborted, false);
  });

  it('a request with no answer in time is abandoned as RESEND_TIMEOUT', async () => {
    respond = (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
    // AbortSignal.timeout does not keep Node running by itself (a real request's open socket
    // would); this timer stands in for that socket until the send gives up.
    const keepAlive = setInterval(() => {}, 1_000);
    const started = Date.now();
    const err = await errorOf(sendWithResend(MESSAGE, { apiKey: FAKE_KEY, timeoutMs: 50 })).finally(() => clearInterval(keepAlive));
    assert.ok(Date.now() - started < 5_000);
    assert.ok(err instanceof EmailDeliveryError);
    assert.equal(err.code, 'RESEND_TIMEOUT');
    assert.equal(safeErrorDetails(err), 'code=RESEND_TIMEOUT');
  });
});

describe('sendWithResend: errors', () => {
  it('an error status throws with the status and Resend\'s error name only', async () => {
    respond = async () => new Response(JSON.stringify({
      statusCode: 422,
      name: 'validation_error',
      message: `Invalid \`to\` field: ${ADDRESS} with key ${FAKE_KEY}`,
    }), { status: 422 });
    const err = await errorOf(sendWithResend(MESSAGE, { apiKey: FAKE_KEY }));
    assert.ok(err instanceof EmailDeliveryError);
    assert.equal(err.code, 'RESEND_HTTP_ERROR');
    assert.equal(err.responseCode, 422);
    assert.equal(err.providerError, 'validation_error');
    assert.equal(safeErrorDetails(err), 'code=RESEND_HTTP_ERROR responseCode=422 name=validation_error');
    assertNothingSecret(`${err.message} ${safeErrorDetails(err)} ${JSON.stringify(err)}`);
  });

  it('quota and rate-limit answers are reported the same way', async () => {
    for (const [status, name] of [[429, 'daily_quota_exceeded'], [429, 'rate_limit_exceeded'], [403, 'validation_error'], [500, 'internal_server_error']]) {
      respond = async () => new Response(JSON.stringify({ name, message: `about ${ADDRESS}` }), { status });
      const err = await errorOf(sendWithResend(MESSAGE, { apiKey: FAKE_KEY }));
      assert.equal(safeErrorDetails(err), `code=RESEND_HTTP_ERROR responseCode=${status} name=${name}`);
    }
  });

  it('an error body that is not JSON, or an odd error name, logs the status only', async () => {
    for (const body of ['<html>Bad gateway</html>', JSON.stringify({ name: `Bad <${ADDRESS}>` }), JSON.stringify({ name: 42 })]) {
      respond = async () => new Response(body, { status: 502 });
      const err = await errorOf(sendWithResend(MESSAGE, { apiKey: FAKE_KEY }));
      assert.equal(safeErrorDetails(err), 'code=RESEND_HTTP_ERROR responseCode=502');
    }
  });

  it('a request that cannot be made is RESEND_NETWORK_ERROR, without the cause\'s text', async () => {
    respond = async () => { throw new TypeError(`fetch failed for ${ADDRESS}`); };
    const err = await errorOf(sendWithResend(MESSAGE, { apiKey: FAKE_KEY }));
    assert.equal(err.code, 'RESEND_NETWORK_ERROR');
    assert.equal(safeErrorDetails(err), 'code=RESEND_NETWORK_ERROR');
    assertNothingSecret(`${err.message} ${JSON.stringify(err)}`);
  });
});

// The real email service with EMAIL_TRANSPORT=resend, in production mode, with a fake fetch
// installed before the service loads. Logs are captured and checked.
describe('EMAIL_TRANSPORT=resend through sendEmail (child process)', () => {
  it('sends through Resend, and a failure logs only safe details', () => {
    const script = [
      'const requests = [];',
      'let failNext = false;',
      'globalThis.fetch = async (url, init) => {',
      '  requests.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });',
      `  if (failNext) return new Response(JSON.stringify({ name: 'validation_error', message: 'bad ${ADDRESS}' }), { status: 422 });`,
      "  return new Response(JSON.stringify({ id: 'x' }), { status: 200 });",
      '};',
      'const logged = [];',
      "for (const level of ['log', 'error', 'warn']) console[level] = (...args) => logged.push(args.join(' '));",
      "const { sendEmail, sendEmailQuietly } = await import('./src/services/email.js');",
      `await sendEmail({ to: '${ADDRESS}', subject: 'Subject', text: 'token=one-time-secret', html: '<p>token=one-time-secret</p>' });`,
      'failNext = true;',
      `const ok = await sendEmailQuietly('password reset', { to: '${ADDRESS}', subject: 'Subject', text: 'token=one-time-secret', html: '<p>x</p>' });`,
      "process.stdout.write(JSON.stringify({ requests, ok, logged }) + '\\n');",
      'process.exit(0);',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        EMAIL_TRANSPORT: 'resend',
        RESEND_API_KEY: FAKE_KEY,
        EMAIL_FROM: 'Help Desk <no-reply@helpdesk.example.test>',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/helpdesk_test',
        JWT_SECRET: 'p'.repeat(48),
        CLIENT_URL: 'http://localhost:5173',
        CORS_ORIGINS: '',
        JWT_EXPIRES_IN: '',
        TRUST_PROXY: '',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout.trim().split('\n').pop());
    assert.equal(out.requests.length, 2);
    assert.equal(out.requests[0].url, 'https://api.resend.com/emails');
    assert.equal(out.requests[0].auth, `Bearer ${FAKE_KEY}`);
    assert.equal(out.requests[0].body.from, 'Help Desk <no-reply@helpdesk.example.test>');
    assert.deepEqual(out.requests[0].body.to, [ADDRESS]);
    assert.equal(out.ok, false);
    assert.deepEqual(out.logged, ['Email (password reset) could not be sent: code=RESEND_HTTP_ERROR responseCode=422 name=validation_error']);
    assertNothingSecret(out.logged.join('\n') + result.stderr);
  });
});
