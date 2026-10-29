import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Sends the account emails (password reset, email verification, security notices).
// The transport comes from EMAIL_TRANSPORT (see config/envRules.js):
//   smtp      real delivery through any SMTP provider (SMTP_HOST, SMTP_PORT, ...)
//   outbox    development: each email is written to backend/.outbox/ instead of being sent
//   memory    tests: emails are kept in memory (sentEmails())
//   disabled  nothing is sent
// Email bodies contain one-time links, so they are never written to logs.

const DEFAULT_OUTBOX_DIR = fileURLToPath(new URL('../../.outbox/', import.meta.url));
export const OUTBOX_DIR = env.email.outboxDir ? join(env.email.outboxDir, '/') : DEFAULT_OUTBOX_DIR;

const memory = [];
let failMemoryDelivery = false;
let smtpTransport;

function smtp() {
  smtpTransport ??= nodemailer.createTransport({
    host: env.email.smtp.host,
    port: env.email.smtp.port,
    secure: env.email.smtp.secure,
    auth: env.email.smtp.user ? { user: env.email.smtp.user, pass: env.email.smtp.pass } : undefined,
  });
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
      if (failMemoryDelivery) throw new Error('Simulated email delivery failure');
      memory.push({ ...message, sentAt: new Date() });
      return;
    default:
      // disabled
  }
}

// Sends without letting a delivery problem fail the request. Only the purpose and the
// error are logged, never the recipient's link.
export async function sendEmailQuietly(purpose, message) {
  try {
    await sendEmail(message);
    return true;
  } catch (err) {
    console.error(`Email (${purpose}) could not be sent: ${err?.message ?? err}`);
    return false;
  }
}

// --- Test helpers (memory transport) ---
export function sentEmails() {
  return [...memory];
}
export function clearSentEmails() {
  memory.length = 0;
}
export function simulateEmailFailure(fail) {
  failMemoryDelivery = Boolean(fail);
}
