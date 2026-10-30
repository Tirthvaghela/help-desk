import { env } from '../config/env.js';
import { STATUS_LABELS } from '../utils/ticketConstants.js';

// Account and ticket email texts. Links are built from the configured CLIENT_URL only, never from
// request headers, so a forged Host header cannot redirect them.

export function appLink(path, params = {}) {
  const url = new URL(path, env.clientUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function layout({ heading, paragraphs, link, linkLabel, footer }) {
  const text = [heading, '', ...paragraphs, ...(link ? ['', `${linkLabel}: ${link}`] : []), '', footer, '', '— Help Desk'].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#15232b">
<h2 style="font-size:18px">${escapeHtml(heading)}</h2>
${paragraphs.map((p) => `<p style="line-height:1.5">${escapeHtml(p)}</p>`).join('\n')}
${link ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#12855f;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">${escapeHtml(linkLabel)}</a></p><p style="font-size:12px;color:#5b6b73">Or copy this link: ${escapeHtml(link)}</p>` : ''}
<p style="font-size:12px;color:#5b6b73">${escapeHtml(footer)}</p>
</div>`;
  return { text, html };
}

// --- Shared layout of the ticket status and password reset emails ---
// Tables and inline styles only, for email clients; no images, scripts or external resources.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";
const COLORS = Object.freeze({
  page: '#f2f5f4',
  card: '#ffffff',
  panel: '#f7faf9',
  border: '#e3e9e6',
  ink: '#172d2a',
  body: '#2f413d',
  muted: '#5b6b73',
  accent: '#12855f',
  logo: '#15232b',
  logoDot: '#83dcb2',
});
const STATUS_PILLS = Object.freeze({
  in_progress: { background: '#e4efff', text: '#2a5890', dot: '#4b79b2' },
  resolved: { background: '#def3e6', text: '#21634a', dot: '#348264' },
});
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
const PREHEADER_PADDING = '&#847;&zwnj;&nbsp;'.repeat(40);

function textStyle(size, lineHeight, color, extra = '') {
  return `font-family:${FONT};font-size:${size}px;line-height:${lineHeight}px;color:${color};mso-line-height-rule:exactly;${extra}`;
}

// A full-width table of one column, one row per cell.
function column(cells) {
  return `<table ${TABLE} width="100%" style="width:100%;">${cells.map((cell) => `<tr>${cell}</tr>`).join('')}</table>`;
}

function textCell(content, { size = 15, lineHeight = 24, color = COLORS.body, className = 'hd-body', extra = '' } = {}) {
  return `<td class="${className}" style="${textStyle(size, lineHeight, color, extra)}">${content}</td>`;
}

function cardRow(padding, content) {
  return `<tr><td class="hd-px" style="padding:${padding};">${content}</td></tr>`;
}

function divider() {
  return `<table ${TABLE} width="100%" style="width:100%;"><tr><td class="hd-rule" height="1" style="height:1px;background-color:${COLORS.border};font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr></table>`;
}

function emailLink(url) {
  const href = escapeHtml(url);
  return `<a class="hd-link" href="${href}" target="_blank" style="color:${COLORS.accent};text-decoration:underline;">${href}</a>`;
}

// A pill button: VML for Outlook, a link for everything else. `width` is the Outlook width.
function button(url, label, width) {
  const href = escapeHtml(url);
  const text = escapeHtml(label);
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;width:${width}px;v-text-anchor:middle;" arcsize="50%" stroke="f" fillcolor="${COLORS.accent}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${text}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><table ${TABLE}><tr><td style="background-color:${COLORS.accent};border-radius:999px;"><a href="${href}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;mso-line-height-rule:exactly;">${text}</a></td></tr></table><!--<![endif]-->`;
}

// "Hi Asha,": the first word of the name, or "Hi there," without a usable name.
function greetingFor(name) {
  const first = typeof name === 'string' ? name.trim().split(/\s+/)[0] : '';
  return first ? `Hi ${first},` : 'Hi there,';
}

const STYLES = `body{margin:0;padding:0;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;}
a[x-apple-data-detectors]{color:inherit;text-decoration:none;}
@media (max-width:620px){
.hd-container{width:100%!important;}
.hd-outer{padding:16px 8px!important;}
.hd-px{padding-left:24px!important;padding-right:24px!important;}
.hd-h1{font-size:22px!important;line-height:28px!important;}
.hd-stack{display:block!important;width:100%!important;}
.hd-label{padding-bottom:2px!important;}
}
@media (prefers-color-scheme:dark){
.hd-page{background-color:#111917!important;}
.hd-card{background-color:#18221f!important;border-color:#2a3632!important;}
.hd-panel{background-color:#1e2a26!important;border-color:#2a3632!important;}
.hd-rule{background-color:#2a3632!important;}
.hd-ink{color:#eef3f1!important;}
.hd-body{color:#c9d4d0!important;}
.hd-muted{color:#9fb0aa!important;}
.hd-link{color:#83dcb2!important;}
}`;

// The complete HTML document. `blocks` are the card rows between the intro and the closing
// section; `closing` is a list of cells. Everything passed in is already escaped.
function emailDocument({ heading, greeting, explanation, preheader, blocks, closing, footerMessage }) {
  const title = escapeHtml(heading);
  const logo = `<table ${TABLE}><tr>
<td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background-color:${COLORS.logo};border-radius:14px;"><table ${TABLE}><tr><td width="10" height="10" style="width:10px;height:10px;background-color:${COLORS.logoDot};border-radius:5px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr></table></td>
<td class="hd-ink" style="padding-left:10px;${textStyle(17, 22, COLORS.ink, 'font-weight:600;letter-spacing:-0.2px;')}">Help Desk</td>
</tr></table>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
${STYLES}
</style>
</head>
<body class="hd-page" style="margin:0;padding:0;width:100%;background-color:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:${COLORS.page};">${escapeHtml(preheader)}${PREHEADER_PADDING}</div>
<table ${TABLE} width="100%" class="hd-page" style="width:100%;background-color:${COLORS.page};"><tr><td class="hd-outer" align="center" style="padding:40px 12px;">
<!--[if mso]><table ${TABLE} width="600"><tr><td><![endif]-->
<table ${TABLE} width="600" class="hd-container" style="width:600px;max-width:600px;table-layout:fixed;">
<tr><td class="hd-card" style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;">
<table ${TABLE} width="100%" style="width:100%;table-layout:fixed;">
${cardRow('24px 40px 20px', logo)}
${cardRow('0 40px', divider())}
${cardRow('36px 40px 0', column([
    `<td><h1 class="hd-h1 hd-ink" style="margin:0;${textStyle(24, 30, COLORS.ink, 'font-weight:600;letter-spacing:-0.4px;')}">${title}</h1></td>`,
    textCell(escapeHtml(greeting), { extra: 'padding-top:20px;' }),
    textCell(escapeHtml(explanation), { extra: 'padding-top:12px;' }),
  ]))}
${blocks.join('\n')}
${cardRow('32px 40px 36px', `${divider()}${column(closing)}`)}
</table>
</td></tr>
<tr><td class="hd-px" style="padding:24px 40px 8px;">${column([
    textCell('Help Desk', { size: 12, lineHeight: 18, color: COLORS.muted, className: 'hd-muted', extra: 'font-weight:600;' }),
    textCell(escapeHtml(footerMessage), { size: 12, lineHeight: 18, color: COLORS.muted, className: 'hd-muted', extra: 'padding-top:4px;' }),
    textCell(`&copy; ${new Date().getFullYear()} Help Desk`, { size: 12, lineHeight: 18, color: COLORS.muted, className: 'hd-muted', extra: 'padding-top:12px;' }),
  ])}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

// "1 hour", "2 hours" for whole hours, otherwise minutes: "30 minutes", "90 minutes", "1 minute".
export function formatDuration(minutes) {
  if (minutes > 0 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export function passwordResetEmail({ name, token, ttlMinutes }) {
  const link = appLink('/reset-password', { token });
  const heading = 'Reset your password';
  const greeting = greetingFor(name);
  const expiry = formatDuration(ttlMinutes);
  const ignore = "If you didn't request a password reset, you can safely ignore this email. Your password won't change unless you use the link above.";

  const html = emailDocument({
    heading,
    greeting,
    explanation: 'We received a request to reset the password for your Help Desk account. Use the button below to choose a new password.',
    preheader: `Use this link to choose a new password for your Help Desk account. It expires in ${expiry}.`,
    blocks: [
      cardRow('28px 40px 0', button(link, 'Reset Password', 190)),
      cardRow('28px 40px 0', column([
        textCell(escapeHtml("If the button doesn't work, copy and paste the following link into your browser:"), { size: 13, lineHeight: 20, color: COLORS.muted, className: 'hd-muted' }),
        textCell(emailLink(link), { size: 13, lineHeight: 20, color: COLORS.accent, className: 'hd-link', extra: 'padding-top:6px;word-break:break-all;overflow-wrap:anywhere;' }),
      ])),
    ],
    closing: [
      textCell(`<strong style="font-weight:600;">This link expires in ${escapeHtml(expiry)}</strong> and can only be used once.`, { size: 14, lineHeight: 22, extra: 'padding-top:24px;' }),
      textCell(escapeHtml(ignore), { size: 14, lineHeight: 22, color: COLORS.muted, className: 'hd-muted', extra: 'padding-top:8px;' }),
    ],
    footerMessage: "This is an automated security email about your account. Don't forward it or share the link with anyone.",
  });

  const text = [
    heading,
    '',
    greeting,
    '',
    'We received a request to reset the password for your Help Desk account. Open the link below to choose a new password:',
    '',
    link,
    '',
    `This link expires in ${expiry} and can only be used once.`,
    '',
    ignore,
    '',
    '— Help Desk',
  ].join('\n');

  return { subject: 'Reset your Help Desk password', text, html };
}

export function verifyEmailChangeEmail({ name, token, ttlHours }) {
  const link = appLink('/verify-email', { token });
  return {
    subject: 'Confirm your new Help Desk email address',
    ...layout({
      heading: 'Confirm your new email address',
      paragraphs: [`Hi ${name},`, `Confirm that this is the new email address for your Help Desk account. The link works once and expires in ${ttlHours} hours.`],
      link,
      linkLabel: 'Confirm email address',
      footer: "If you didn't ask for this, ignore this email; the address will not be changed.",
    }),
  };
}

export function emailChangeRequestedNotice({ name, newEmail }) {
  return {
    subject: 'Your Help Desk email address is being changed',
    ...layout({
      heading: 'Email change requested',
      paragraphs: [`Hi ${name},`, `A request was made to change your Help Desk sign-in email to ${newEmail}. It takes effect only after the new address is confirmed.`],
      footer: "If this wasn't you, sign in and change your password, then contact support.",
    }),
  };
}

export function emailChangedNotice({ name, newEmail }) {
  return {
    subject: 'Your Help Desk email address was changed',
    ...layout({
      heading: 'Email address changed',
      paragraphs: [`Hi ${name},`, `Your Help Desk sign-in email is now ${newEmail}.`],
      footer: "If this wasn't you, contact support straight away.",
    }),
  };
}

// To the customer when staff move their ticket forward. Says "our support team", never which
// agent; the customer's own subject is the only text they wrote (escaped in the HTML part).
// The email subject line uses server values only (ticket number and status label).
export function ticketStatusChangedEmail({ name, ticketId, ticketNumber, subject, previousStatus, status }) {
  const from = STATUS_LABELS[previousStatus] ?? previousStatus;
  const to = STATUS_LABELS[status] ?? status;
  const link = appLink(`/tickets/${encodeURIComponent(String(ticketId))}`);
  const copy = {
    in_progress: {
      heading: 'Your ticket is now being worked on',
      explanation: "Our support team has started working on your request. We'll keep you informed as it progresses.",
      emailSubject: `Your ticket ${ticketNumber} is now ${to}`,
      preheader: `${ticketNumber} is now ${to}. Our support team has started working on it.`,
    },
    resolved: {
      heading: 'Your ticket has been resolved',
      explanation: 'Our support team has marked your request as resolved. Please review the update and let us know if you still need assistance.',
      emailSubject: `Your ticket ${ticketNumber} has been resolved`,
      preheader: `${ticketNumber} has been marked as resolved by our support team.`,
    },
  }[status] ?? {
    heading: 'Your ticket status has changed',
    explanation: 'Our support team has updated the status of your request.',
    emailSubject: `Your ticket ${ticketNumber} is now ${to}`,
    preheader: `${ticketNumber} is now ${to}.`,
  };
  const pill = STATUS_PILLS[status] ?? STATUS_PILLS.in_progress;
  const greeting = greetingFor(name);
  const closingText = 'You received this email because the status of your support ticket changed.';

  const detail = (label, value, first = false) => `<tr><td${first ? '' : ' style="padding-top:12px;"'}><table ${TABLE} width="100%" style="width:100%;table-layout:fixed;"><tr>
<td class="hd-stack hd-label hd-muted" width="140" valign="top" style="width:140px;box-sizing:border-box;padding-right:12px;${textStyle(13, 20, COLORS.muted)}">${escapeHtml(label)}</td>
<td class="hd-stack hd-ink" valign="top" style="box-sizing:border-box;${textStyle(14, 20, COLORS.ink, 'word-break:break-word;overflow-wrap:anywhere;')}">${value}</td>
</tr></table></td></tr>`;
  const statusPill = `<table ${TABLE}><tr><td style="background-color:${pill.background};border-radius:999px;padding:3px 12px 3px 10px;"><table ${TABLE}><tr>
<td valign="middle" style="font-size:0;line-height:0;mso-line-height-rule:exactly;"><table ${TABLE}><tr><td width="8" height="8" style="width:8px;height:8px;background-color:${pill.dot};border-radius:4px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr></table></td>
<td style="padding-left:7px;${textStyle(13, 18, pill.text, 'font-weight:600;white-space:nowrap;')}">${escapeHtml(to)}</td>
</tr></table></td></tr></table>`;
  const panel = `<table ${TABLE} width="100%" style="width:100%;"><tr><td class="hd-panel" style="background-color:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:10px;padding:20px 22px;"><table ${TABLE} width="100%" style="width:100%;table-layout:fixed;">
${detail('Ticket', `<span style="font-family:${MONO};font-size:14px;font-weight:600;">${escapeHtml(ticketNumber)}</span>`, true)}
${detail('Subject', escapeHtml(subject))}
${detail('Previous status', `<span class="hd-body" style="color:${COLORS.body};">${escapeHtml(from)}</span>`)}
${detail('New status', statusPill)}
</table></td></tr></table>`;

  const html = emailDocument({
    heading: copy.heading,
    greeting,
    explanation: copy.explanation,
    preheader: copy.preheader,
    blocks: [
      cardRow('24px 40px 0', panel),
      cardRow('28px 40px 0', `${button(link, 'View Ticket', 160)}${column([
        textCell(`Or open this link: ${emailLink(link)}`, { size: 13, lineHeight: 20, color: COLORS.muted, className: 'hd-muted', extra: 'padding-top:16px;word-break:break-all;' }),
      ])}`),
    ],
    closing: [textCell(escapeHtml(closingText), { size: 13, lineHeight: 20, color: COLORS.muted, className: 'hd-muted', extra: 'padding-top:20px;' })],
    footerMessage: 'Replies and updates for this ticket are kept on the ticket page in your Help Desk account.',
  });

  const text = [
    copy.heading,
    '',
    greeting,
    '',
    copy.explanation,
    '',
    `Ticket: ${ticketNumber}`,
    `Subject: ${subject}`,
    `Previous status: ${from}`,
    `New status: ${to}`,
    '',
    `View ticket: ${link}`,
    '',
    closingText,
    '',
    '— Help Desk',
  ].join('\n');

  return { subject: copy.emailSubject, text, html };
}

export function passwordChangedNotice({ name }) {
  return {
    subject: 'Your Help Desk password was changed',
    ...layout({
      heading: 'Password changed',
      paragraphs: [`Hi ${name},`, 'Your Help Desk password was just changed, and you were signed out on other devices.'],
      footer: "If this wasn't you, reset your password straight away and contact support.",
    }),
  };
}
