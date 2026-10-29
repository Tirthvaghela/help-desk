import { env } from '../config/env.js';

// Account email texts. Links are built from the configured CLIENT_URL only, never from
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

export function passwordResetEmail({ name, token, ttlMinutes }) {
  const link = appLink('/reset-password', { token });
  return {
    subject: 'Reset your Help Desk password',
    ...layout({
      heading: 'Reset your password',
      paragraphs: [`Hi ${name},`, `Someone asked to reset the password for your Help Desk account. The link works once and expires in ${ttlMinutes} minutes.`],
      link,
      linkLabel: 'Choose a new password',
      footer: "If you didn't ask for this, you can ignore this email. Your password stays the same.",
    }),
  };
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
