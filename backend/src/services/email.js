import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { waitUntil } from '@vercel/functions';
import { env } from '../config/env.js';

// Sends the account emails (password reset, email verification, security notices) and the
// ticket status emails to customers. The transport comes from EMAIL_TRANSPORT (see config/envRules.js):
//   smtp      real delivery through any SMTP provider (SMTP_HOST, SMTP_PORT, ...)
//   resend    real delivery through the Resend HTTP API (RESEND_API_KEY)
//   outbox    development: each email is written to backend/.outbox/ instead of being sent
//   memory    tests: emails are kept in memory (sentEmails())
//   disabled  nothing is sent
// Email bodies contain one-time links and recipients are personal data, so neither is written to
// logs. A failed send logs its purpose and safeErrorDetails() only.

const DEFAULT_OUTBOX_DIR = fileURLToPath(new URL('../../.outbox/', import.meta.url));
export const OUTBOX_DIR = env.email.outboxDir ? join(env.email.outboxDir, '/') : DEFAULT_OUTBOX_DIR;

const memory = [];
let failMemoryDelivery = false;
let smtpTransport;

// Limits for an unresponsive SMTP server, so a send gives up instead of hanging for minutes:
// connecting, waiting for its greeting, and silence on an open connection.
export const SMTP_TIMEOUTS = Object.freeze({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });

export function smtpTransportOptions(smtpConfig) {
  return {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.user ? { user: smtpConfig.user, pass: smtpConfig.pass } : undefined,
    ...SMTP_TIMEOUTS,
  };
}

function smtp() {
  smtpTransport ??= nodemailer.createTransport(smtpTransportOptions(env.email.smtp));
  return smtpTransport;
}

// --- Resend HTTP API ---
export const RESEND_API_URL = 'https://api.resend.com/emails';
// A send that gets no answer within this time is given up, so it cannot hold a request (or a
// function on Vercel) for long.
export const RESEND_TIMEOUT_MS = 10_000;

// A failed Resend send. Carries only what is safe to log: a fixed code, the HTTP status and Resend's
// error name (e.g. "validation_error"). Never the response message, which can quote the address.
export class EmailDeliveryError extends Error {
  constructor(code, { status, providerError } = {}) {
    super('The email could not be sent');
    this.name = 'EmailDeliveryError';
    this.code = code;
    if (status !== undefined) this.responseCode = status;
    if (providerError !== undefined) this.providerError = providerError;
  }
}

// Sends one email through Resend. Throws EmailDeliveryError when it is not accepted:
//   RESEND_TIMEOUT        no answer within `timeoutMs`
//   RESEND_NETWORK_ERROR  the request could not be made
//   RESEND_HTTP_ERROR     Resend answered with an error status (responseCode, providerError)
export async function sendWithResend({ from, to, subject, text, html }, { apiKey, timeoutMs = RESEND_TIMEOUT_MS } = {}) {
  let response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new EmailDeliveryError(err?.name === 'TimeoutError' ? 'RESEND_TIMEOUT' : 'RESEND_NETWORK_ERROR');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new EmailDeliveryError('RESEND_HTTP_ERROR', { status: response.status, providerError: body?.name });
  }
}

// Delivers one email. Throws if delivery fails, so callers decide how to react.
export async function sendEmail({ to, subject, text, html }) {
  const message = { from: env.email.from, to, subject, text, html };
  switch (env.email.transport) {
    case 'smtp':
      await smtp().sendMail(message);
      return;
    case 'resend':
      await sendWithResend(message, { apiKey: env.email.resend.apiKey });
      return;
    case 'outbox': {
      await mkdir(OUTBOX_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const body = `To: ${to}\nFrom: ${message.from}\nSubject: ${subject}\nDate: ${new Date().toUTCString()}\n\n${text}\n`;
      await writeFile(`${OUTBOX_DIR}${stamp}.txt`, body, 'utf8');
      return;
    }
    case 'memory':
      if (failMemoryDelivery) throw failMemoryDelivery instanceof Error ? failMemoryDelivery : new Error('Simulated email delivery failure');
      memory.push({ ...message, sentAt: new Date() });
      return;
    default:
      // disabled
  }
}

// What may be logged about a failed send: the error's code, the server's numeric reply code (SMTP
// reply or HTTP status) and, for Resend, its error name. Never err.message or err.response:
// Nodemailer adds the server's reply to them, and servers commonly quote the recipient's address.
// A code or name in any other form is left out for the same reason.
export function safeErrorDetails(err) {
  const code = /^[A-Z][A-Z0-9_]{0,39}$/.test(err?.code) || Number.isInteger(err?.code) ? err.code : 'unknown';
  let details = Number.isInteger(err?.responseCode) ? `code=${code} responseCode=${err.responseCode}` : `code=${code}`;
  if (typeof err?.providerError === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(err.providerError)) {
    details += ` name=${err.providerError}`;
  }
  return details;
}

// Sends without letting a delivery problem fail the request. A failure is logged with its
// purpose and safe details only, never the recipient, the link or the message.
export async function sendEmailQuietly(purpose, message) {
  try {
    await sendEmail(message);
    return true;
  } catch (err) {
    console.error(`Email (${purpose}) could not be sent: ${safeErrorDetails(err)}`);
    return false;
  }
}

// --- Background delivery ---
// Work that sends email after the response has gone (ticket status emails, the forgot-password
// email), so a slow email service never delays the API. Each task is:
//   - tracked until it settles, so a graceful shutdown of the long-running server can wait for it
//     (waitForPendingEmails);
//   - handed to Vercel's waitUntil, so a Vercel Function keeps running until it settles instead
//     of being paused once the response is sent. Outside a Vercel request (local server, tests)
//     waitUntil does nothing.
// A task never throws: a failure is logged with its purpose and safe details only.
const pending = new Set();

// Vercel keeps the current request's context under this symbol; @vercel/functions reads waitUntil
// from it. Only used to notice when it is missing.
const VERCEL_REQUEST_CONTEXT = Symbol.for('@vercel/request-context');
let reportedMissingContext = false;

function keepFunctionAlive(work) {
  waitUntil(work);
  const context = globalThis[VERCEL_REQUEST_CONTEXT]?.get?.();
  if (env.onVercel && typeof context?.waitUntil !== 'function' && !reportedMissingContext) {
    reportedMissingContext = true;
    console.warn('Background email: no Vercel request context, so Vercel may pause this work once the response is sent. Check that emails sent after a response arrive.');
  }
}

export function sendInBackground(purpose, task) {
  const work = Promise.resolve()
    .then(task)
    .catch((err) => console.error(`Email (${purpose}) could not be sent: ${safeErrorDetails(err)}`))
    .finally(() => pending.delete(work));
  pending.add(work);
  keepFunctionAlive(work);
  return work;
}

export function pendingEmailCount() {
  return pending.size;
}

// Resolves once every tracked task has settled, or after `timeoutMs`, whichever is first:
// { settled: true } or { settled: false, pending: n }.
export async function waitForPendingEmails(timeoutMs) {
  if (pending.size === 0) return { settled: true };
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref?.();
  });
  const done = await Promise.race([Promise.allSettled([...pending]).then(() => true), timedOut]);
  clearTimeout(timer);
  return done && pending.size === 0 ? { settled: true } : { settled: false, pending: pending.size };
}

// --- Test helpers (memory transport) ---
export function sentEmails() {
  return [...memory];
}
export function clearSentEmails() {
  memory.length = 0;
}
// true, false, or the Error that delivery should fail with.
export function simulateEmailFailure(fail) {
  failMemoryDelivery = fail instanceof Error ? fail : Boolean(fail);
}
