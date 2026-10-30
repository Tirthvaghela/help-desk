import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Sends the account emails (password reset, email verification, security notices) and the
// ticket status emails to customers. The transport comes from EMAIL_TRANSPORT (see config/envRules.js):
//   smtp      real delivery through any SMTP provider (SMTP_HOST, SMTP_PORT, ...)
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

// Delivers one email. Throws if delivery fails, so callers decide how to react.
export async function sendEmail({ to, subject, text, html }) {
  const message = { from: env.email.from, to, subject, text, html };
  switch (env.email.transport) {
    case 'smtp':
      await smtp().sendMail(message);
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

// What may be logged about a failed send: the error's code and the SMTP server's numeric reply
// code. Never err.message or err.response: Nodemailer adds the server's reply to them, and servers
// commonly quote the recipient's address. A code in any other form is left out for the same reason.
export function safeErrorDetails(err) {
  const code = /^[A-Z][A-Z0-9_]{0,39}$/.test(err?.code) || Number.isInteger(err?.code) ? err.code : 'unknown';
  return Number.isInteger(err?.responseCode) ? `code=${code} responseCode=${err.responseCode}` : `code=${code}`;
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
// Work that sends email after the response has gone (e.g. ticket status emails), so a slow
// SMTP server never delays the API. Each task is tracked until it settles, so a graceful
// shutdown can wait for it (waitForPendingEmails). A task never throws: a failure is logged
// with its purpose and safe details only. The forgot-password email is not tracked here: it is
// sent after that response, so a shutdown does not wait for it.
const pending = new Set();

export function sendInBackground(purpose, task) {
  const work = Promise.resolve()
    .then(task)
    .catch((err) => console.error(`Email (${purpose}) could not be sent: ${safeErrorDetails(err)}`))
    .finally(() => pending.delete(work));
  pending.add(work);
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
