import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { clearSentEmails, sentEmails, waitForPendingEmails } from '../src/services/email.js';
import { formatDuration, passwordResetEmail, ticketStatusChangedEmail } from '../src/services/emailTemplates.js';
import { connectTestDB, resetTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { createCategory, createTicket, createUser, authHeader } from './helpers/factories.js';

// The ticket status and password reset emails. Delivery rules are in statusEmails.test.js and
// accountSecurity.test.js; tests use the in-memory transport, so nothing leaves this process.

const CLIENT_URL = process.env.CLIENT_URL;
const statusEmail = (overrides = {}) => ticketStatusChangedEmail({
  name: 'Asha Customer',
  ticketId: '665f1c2ab3c4d5e6f7a8b9c0',
  ticketNumber: 'HD-1042',
  subject: "Invoice PDF won't download",
  previousStatus: 'open',
  status: 'in_progress',
  ...overrides,
});
const resetEmail = (overrides = {}) => passwordResetEmail({ name: 'Cara Customer', token: 'Zq7_-abcDEF', ttlMinutes: 30, ...overrides });
const occurrences = (text, part) => text.split(part).length - 1;
const escaped = (text) => text.replaceAll('&', '&amp;').replaceAll("'", '&#39;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const STATIC_SCRIPT = /<script|<img|<link|src=|https?:\/\/(?!localhost)(?!www\.w3\.org)/i;

describe('shared layout', () => {
  for (const [name, mail] of [['status', statusEmail()], ['reset', resetEmail()]]) {
    it(`${name}: a complete document, tables and inline styles, nothing loaded from elsewhere`, () => {
      assert.deepEqual(Object.keys(mail).sort(), ['html', 'subject', 'text']);
      assert.ok(mail.html.startsWith('<!DOCTYPE html>'));
      assert.match(mail.html, /<html lang="en"[^>]*xmlns:v="urn:schemas-microsoft-com:vml"[^>]*xmlns:o="urn:schemas-microsoft-com:office:office"/);
      assert.ok(mail.html.includes('role="presentation" cellpadding="0" cellspacing="0" border="0"'));
      assert.doesNotMatch(mail.html.replace(/urn:schemas[^"]*/g, ''), STATIC_SCRIPT);
      assert.ok(mail.html.includes('<o:PixelsPerInch>96</o:PixelsPerInch>'));
      assert.ok(mail.html.includes('<meta name="color-scheme" content="light dark">'));
      assert.ok(mail.html.includes('@media (prefers-color-scheme:dark)'));
      assert.ok(mail.html.includes('.hd-container{width:100%!important;}'));
      assert.ok(Buffer.byteLength(mail.html) < 30 * 1024, `size ${Buffer.byteLength(mail.html)}`);
      assert.ok(!/undefined|null|NaN|\[object/.test(mail.html + mail.text));
    });

    it(`${name}: hidden preheader right after <body>, padded 40 times, in the page colour`, () => {
      assert.match(mail.html, /<body[^>]*>\n<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:#f2f5f4;">/);
      assert.equal(occurrences(mail.html, '&#847;&zwnj;&nbsp;'), 40);
    });

    it(`${name}: every cell with text has the Outlook line-height rule`, () => {
      const cells = mail.html.match(/<td[^>]*font-size:(?!0)[^>]*>/g);
      assert.ok(cells.length >= 5);
      for (const cell of cells) assert.ok(cell.includes('mso-line-height-rule:exactly'), cell);
    });

    it(`${name}: VML button for Outlook, HTML button for everything else, and the year`, () => {
      assert.match(mail.html, /<!--\[if mso\]><v:roundrect [^>]*arcsize="50%" stroke="f" fillcolor="#12855f">/);
      assert.ok(mail.html.includes('<!--[if !mso]><!-->'));
      assert.ok(mail.html.includes('padding:13px 30px'));
      assert.ok(mail.html.includes(`&copy; ${new Date().getFullYear()} Help Desk`));
    });

    it(`${name}: the plain-text part has no markup`, () => {
      assert.doesNotMatch(mail.text, /<[a-z!/]|&[a-z#0-9]+;|mso|style=/i);
      assert.ok(mail.text.endsWith('\n\n— Help Desk'));
    });
  }

  it('greets by first name, or "Hi there," without a usable name', () => {
    assert.ok(statusEmail().text.includes('\nHi Asha,\n'));
    assert.ok(resetEmail({ name: '  Cara   Lee ' }).text.includes('\nHi Cara,\n'));
    for (const name of [undefined, null, '', '   ']) {
      for (const mail of [statusEmail({ name }), resetEmail({ name })]) {
        assert.ok(mail.text.includes('\nHi there,\n'), String(name));
        assert.ok(mail.html.includes('Hi there,'), String(name));
        assert.ok(!/undefined|null/.test(mail.text + mail.html), String(name));
      }
    }
  });

  it('escapes names, and leaves no raw markup in the HTML', () => {
    const name = `<img src=x onerror=alert(1)>&"'`;
    const html = resetEmail({ name }).html;
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes(`Hi &lt;img,`), 'first word, escaped');
    const quoted = statusEmail({ name: `O'Neil&"Co` }).html;
    assert.ok(quoted.includes('Hi O&#39;Neil&amp;&quot;Co,'));
  });
});

describe('ticketStatusChangedEmail', () => {
  it('In progress: heading, explanation, subject, preheader, statuses and blue pill', () => {
    const { subject, html } = statusEmail();
    assert.equal(subject, 'Your ticket HD-1042 is now In progress');
    assert.match(html, /<title>Your ticket is now being worked on<\/title>/);
    assert.match(html, /<h1 [^>]*>Your ticket is now being worked on<\/h1>/);
    assert.ok(html.includes(escaped("Our support team has started working on your request. We'll keep you informed as it progresses.")));
    assert.ok(html.includes('HD-1042 is now In progress. Our support team has started working on it.'));
    assert.ok(html.includes('background-color:#e4efff') && html.includes('color:#2a5890') && html.includes('background-color:#4b79b2'));
    assert.ok(!html.includes('#def3e6'));
    assert.ok(html.includes('>Open</span>'));
    assert.ok(html.includes('>In progress</td>'));
  });

  it('Resolved: heading, explanation, subject, preheader, statuses and green pill', () => {
    const { subject, html, text } = statusEmail({ previousStatus: 'in_progress', status: 'resolved' });
    assert.equal(subject, 'Your ticket HD-1042 has been resolved');
    assert.match(html, /<h1 [^>]*>Your ticket has been resolved<\/h1>/);
    assert.ok(text.includes('Our support team has marked your request as resolved. Please review the update and let us know if you still need assistance.'));
    assert.ok(html.includes('HD-1042 has been marked as resolved by our support team.'));
    assert.ok(html.includes('background-color:#def3e6') && html.includes('color:#21634a') && html.includes('background-color:#348264'));
    assert.ok(!html.includes('#e4efff'));
    assert.ok(html.includes('>In progress</span>'));
    assert.ok(html.includes('>Resolved</td>'));
  });

  it('any other status: the general wording, with the In progress pill colours', () => {
    const { html, text } = statusEmail({ previousStatus: 'in_progress', status: 'open' });
    assert.match(html, /<h1 [^>]*>Your ticket status has changed<\/h1>/);
    assert.ok(text.includes('Our support team has updated the status of your request.'));
    assert.ok(html.includes('background-color:#e4efff'));
  });

  it('the plain-text part has exactly the agreed lines', () => {
    assert.equal(statusEmail().text, [
      'Your ticket is now being worked on',
      '',
      'Hi Asha,',
      '',
      "Our support team has started working on your request. We'll keep you informed as it progresses.",
      '',
      'Ticket: HD-1042',
      "Subject: Invoice PDF won't download",
      'Previous status: Open',
      'New status: In progress',
      '',
      `View ticket: ${CLIENT_URL}/tickets/665f1c2ab3c4d5e6f7a8b9c0`,
      '',
      'You received this email because the status of your support ticket changed.',
      '',
      '— Help Desk',
    ].join('\n'));
  });

  it('the link goes in three hrefs of the HTML and once in the text; the id is encoded', () => {
    const link = `${CLIENT_URL}/tickets/665f1c2ab3c4d5e6f7a8b9c0`;
    const { html, text } = statusEmail();
    assert.equal(occurrences(html, `href="${link}"`), 3);
    assert.equal(occurrences(text, link), 1);
    const encoded = statusEmail({ ticketId: 'a/b c' });
    assert.equal(occurrences(encoded.html, `href="${CLIENT_URL}/tickets/a%2Fb%20c"`), 3);
    assert.match(html, /<v:roundrect [^>]*width:160px/);
  });

  it('escapes a hostile subject in the HTML, and in the panel keeps it as data', () => {
    const subject = `<script>alert(1)</script><img src=x onerror=alert(2)> & "quotes" 'single'`;
    const { html, text } = statusEmail({ subject });
    assert.ok(!html.includes('<script') && !html.includes('<img'));
    assert.ok(html.includes(escaped(subject)));
    assert.ok(text.includes(`Subject: ${subject}`), 'plain text is not interpreted as markup');
  });

  it('escapes the ticket number and labels too', () => {
    const { html } = statusEmail({ ticketNumber: '<b>HD</b>', previousStatus: '<i>x</i>' });
    assert.ok(!html.includes('<b>HD') && !html.includes('<i>x'));
    assert.ok(html.includes('&lt;b&gt;HD&lt;/b&gt;'));
  });

  it('long subjects wrap instead of widening the email', () => {
    const subject = 'x'.repeat(120);
    const { html } = statusEmail({ subject });
    const cell = html.slice(html.lastIndexOf('<td', html.indexOf(subject)), html.indexOf(subject));
    assert.ok(cell.includes('word-break:break-word') && cell.includes('overflow-wrap:anywhere'));
    assert.ok(html.includes('table-layout:fixed'));
  });

  it('never names staff or shows internal details, and has no email addresses', () => {
    const mail = statusEmail();
    for (const part of [mail.html, mail.text]) {
      assert.doesNotMatch(part, /assigned|assignee|agent|internal|note/i);
      assert.doesNotMatch(part, /[\w.+-]+@[\w-]+\.[\w.]+/);
    }
  });
});

describe('passwordResetEmail', () => {
  it('heading, explanation, subject, preheader, closing and footer', () => {
    const { subject, html } = resetEmail();
    assert.equal(subject, 'Reset your Help Desk password');
    assert.match(html, /<h1 [^>]*>Reset your password<\/h1>/);
    assert.ok(html.includes('We received a request to reset the password for your Help Desk account. Use the button below to choose a new password.'));
    assert.ok(html.includes('Use this link to choose a new password for your Help Desk account. It expires in 30 minutes.'));
    assert.ok(html.includes('<strong style="font-weight:600;">This link expires in 30 minutes</strong> and can only be used once.'));
    assert.ok(html.includes(escaped("If you didn't request a password reset, you can safely ignore this email. Your password won't change unless you use the link above.")));
    assert.ok(html.includes(escaped("This is an automated security email about your account. Don't forward it or share the link with anyone.")));
    assert.ok(html.includes(escaped("If the button doesn't work, copy and paste the following link into your browser:")));
    assert.match(html, /<v:roundrect [^>]*width:190px/);
  });

  it('the plain-text part has exactly the agreed lines', () => {
    assert.equal(resetEmail().text, [
      'Reset your password',
      '',
      'Hi Cara,',
      '',
      'We received a request to reset the password for your Help Desk account. Open the link below to choose a new password:',
      '',
      `${CLIENT_URL}/reset-password?token=Zq7_-abcDEF`,
      '',
      'This link expires in 30 minutes and can only be used once.',
      '',
      "If you didn't request a password reset, you can safely ignore this email. Your password won't change unless you use the link above.",
      '',
      '— Help Desk',
    ].join('\n'));
  });

  it('the link goes in three hrefs of the HTML and once in the text', () => {
    const link = `${CLIENT_URL}/reset-password?token=Zq7_-abcDEF`;
    const { html, text } = resetEmail();
    assert.equal(occurrences(html, `href="${link}"`), 3);
    assert.equal(occurrences(text, link), 1);
  });

  it('never says the password has been changed or was reset', () => {
    const { html, text } = resetEmail();
    assert.doesNotMatch(html + text, /has been changed|was reset|was changed|has been reset/i);
  });

  it('formatDuration: whole hours as hours, everything else as minutes', () => {
    assert.equal(formatDuration(30), '30 minutes');
    assert.equal(formatDuration(1), '1 minute');
    assert.equal(formatDuration(60), '1 hour');
    assert.equal(formatDuration(120), '2 hours');
    assert.equal(formatDuration(90), '90 minutes');
    assert.equal(formatDuration(0), '0 minutes');
    assert.ok(resetEmail({ ttlMinutes: 60 }).text.includes('This link expires in 1 hour and'));
  });
});

// Through the real routes and the in-memory transport, so these need the guarded test database.
describe('delivery', () => {
  let connected = false;

  before(async () => {
    connected = await connectTestDB();
  });

  beforeEach(async () => {
    clearSentEmails();
    if (connected) await resetTestDB();
  });

  after(async () => {
    if (connected) await clearTestDB();
    await disconnectTestDB();
  });

  const requireDB = (t) => {
    if (!connected) t.skip('MongoDB is not reachable at MONGODB_URI_TEST');
    return connected;
  };

  it('a status change keeps both the HTML and the text part, with the real link', async (t) => {
    if (!requireDB(t)) return;
    const customer = await createUser({ role: 'customer', name: 'Asha Customer', email: 'asha@example.test' });
    const agent = await createUser({ role: 'agent', name: 'Xena Agent', email: 'xena@example.test' });
    const ticket = await createTicket({ createdBy: customer, category: await createCategory(), assignedTo: agent, subject: 'Printer is jammed' });
    const res = await request(app).patch(`/api/tickets/${ticket._id}/status`).set(authHeader(agent)).send({ status: 'in_progress' });
    assert.equal(res.status, 200);
    await waitForPendingEmails(3000);
    const [mail] = sentEmails();
    assert.equal(mail.to, 'asha@example.test');
    assert.ok(mail.html.startsWith('<!DOCTYPE html>'));
    assert.ok(mail.text.startsWith('Your ticket is now being worked on\n'));
    const link = `${CLIENT_URL}/tickets/${ticket._id}`;
    assert.equal(occurrences(mail.html, `href="${link}"`), 3);
    assert.equal(occurrences(mail.text, link), 1);
    for (const part of [mail.html, mail.text]) {
      assert.ok(!part.includes('Xena') && !part.includes('xena@example.test') && !part.includes('asha@example.test'));
    }
  });

  it('forgot password: both parts, the configured expiry, and the token never in logs', async (t) => {
    if (!requireDB(t)) return;
    const logged = [];
    for (const method of ['log', 'error', 'warn', 'info']) {
      t.mock.method(console, method, (...args) => logged.push(args.join(' ')));
    }
    await createUser({ role: 'customer', name: 'Cara Customer', email: 'cara@example.test' });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'cara@example.test' });
    assert.equal(res.status, 200);
    // This route answers first and sends afterwards, so that its timing reveals nothing.
    const deadline = Date.now() + 3000;
    while (sentEmails().length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    const [mail] = sentEmails();
    assert.ok(mail, 'the email was sent');
    assert.equal(mail.subject, 'Reset your Help Desk password');
    const expiry = formatDuration(env.passwordResetTtlMinutes);
    assert.equal(expiry, '30 minutes', 'PASSWORD_RESET_TTL_MINUTES in test/setup.js');
    assert.ok(mail.text.includes(`This link expires in ${expiry} and can only be used once.`));
    assert.ok(mail.html.includes(`This link expires in ${expiry}</strong>`));
    const token = /token=([A-Za-z0-9_-]{43})/.exec(mail.text)[1];
    assert.equal(occurrences(mail.html, `href="${CLIENT_URL}/reset-password?token=${token}"`), 3);
    assert.ok(!logged.some((line) => line.includes(token) || line.includes('cara@example.test')), 'no token or address in logs');
  });
});
