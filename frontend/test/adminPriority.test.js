import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { sessionRejection } from '../src/auth/session.js';
import { formatDateTime } from '../src/components/staff/staffFormat.js';
import { slaDeadline } from '../src/components/staff/slaFormat.js';

// The priority selector in the Admin Tickets dialog (contract §8, D-1, D-10). The selector is rendered
// to HTML and the save runs with a fake API. Clicks are not simulated: the project has no DOM test
// library, so the dialog's wiring is checked in its source and needs a browser check too.

const CREATED = '2026-10-20T00:00:00.000Z';
const HIGH_DUE = '2026-10-21T00:00:00.000Z';
const LOW_DUE = '2026-10-27T00:00:00.000Z';
const medium = { id: 't1', ticketNumber: 'HD-1', status: 'open', priority: 'medium', createdAt: CREATED, dueAt: '2026-10-23T00:00:00.000Z', resolvedAt: null };

const source = readFileSync(join(import.meta.dirname, '../src/components/admin/AdminTickets.jsx'), 'utf8');
const modal = source.slice(source.indexOf('function TicketModal('), source.indexOf('// MAIN COMPONENT'));

let vite;
let PriorityField;
let saveTicketChange;
let SlaBadge;
let tickets;

const field = (props = {}) => renderToStaticMarkup(createElement(PriorityField, { priority: 'medium', onChange: () => {}, ...props }));
const selectedOption = (html) => html.match(/<option[^>]*selected=""[^>]*>([^<]+)</)?.[1];

// Loads the real .jsx through Vite (already a dev dependency), as the build does.
before(async () => {
  vite = await createServer({
    root: join(import.meta.dirname, '..'),
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    oxc: { jsx: { runtime: 'automatic' } },
  });
  ({ PriorityField, saveTicketChange } = await vite.ssrLoadModule('/src/components/admin/AdminTickets.jsx'));
  SlaBadge = (await vite.ssrLoadModule('/src/components/staff/SlaBadge.jsx')).default;
  tickets = await vite.ssrLoadModule('/src/api/tickets.js');
});

after(async () => {
  await vite?.close();
});

describe('the priority selector', () => {
  for (const [priority, label] of [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]) {
    it(`shows ${label} as selected for a ${priority} ticket`, () => {
      assert.equal(selectedOption(field({ priority })), label);
    });
  }

  it('offers exactly the values the API accepts, with their labels', () => {
    const options = [...field().matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(options, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]);
    assert.deepEqual(options.map(([value]) => value), [...tickets.TICKET_PRIORITIES]);
  });

  it('has a label linked to the control', () => {
    const html = field();
    assert.match(html, /<label for="admin-ticket-priority"/);
    assert.match(html, /<select id="admin-ticket-priority"/);
  });

  it('shows the saving state and is disabled while saving', () => {
    const html = field({ saving: true, disabled: true });
    assert.match(html, /Priority · saving…/);
    assert.match(html, /<select[^>]*disabled=""/);
    assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(field(), /saving…/);
    assert.doesNotMatch(field(), /<select[^>]*disabled=""/);
  });
});

describe('resolved tickets (D-10: a resolved ticket is final)', () => {
  it('disables the selector and explains why', () => {
    const permissions = tickets.ticketPermissions({ status: 'resolved', assignedTo: { id: 'a1' } }, { id: 'admin', role: 'admin' });
    assert.equal(permissions.canChangePriority, false);
    const html = field({ disabled: !permissions.canChangePriority, resolved: true });
    assert.match(html, /<select[^>]*disabled=""/);
    assert.match(html, /Priority cannot be changed after a ticket is resolved\./);
  });

  it('leaves it enabled, with no note, on open and in-progress tickets', () => {
    for (const status of ['open', 'in_progress']) {
      const permissions = tickets.ticketPermissions({ status, assignedTo: { id: 'a1' } }, { id: 'admin', role: 'admin' });
      assert.equal(permissions.canChangePriority, true, status);
    }
    assert.doesNotMatch(field(), /cannot be changed/);
  });

  it('the dialog passes the permission and the status to the selector', () => {
    assert.match(modal, /disabled=\{Boolean\(busy\) \|\| !permissions\.canChangePriority\}\s+resolved=\{ticket\.status === "resolved"\}/);
  });
});

describe('saving a change', () => {
  const realFetch = globalThis.fetch;
  let calls;
  let respond;

  beforeEach(() => {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, ...init, body: init.body === undefined ? undefined : JSON.parse(init.body) });
      const { status, body, throws } = respond();
      if (throws) throw new TypeError('Failed to fetch');
      return { ok: status < 300, status, json: async () => body };
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const change = (priority) => saveTicketChange({
    action: () => tickets.assignTicket('tok', 't1', { priority }),
    inFlight: { current: false },
  });

  it('sends only the priority, through the existing assign route', async () => {
    respond = () => ({ status: 200, body: { ticket: { ...medium, priority: 'high', dueAt: HIGH_DUE } } });
    await change('high');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/tickets\/t1\/assign$/);
    assert.equal(calls[0].method, 'PATCH');
    assert.deepEqual(calls[0].body, { priority: 'high' });
    assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  });

  it('returns the updated ticket, so the selector shows the new priority', async () => {
    respond = () => ({ status: 200, body: { ticket: { ...medium, priority: 'high', dueAt: HIGH_DUE } } });
    const result = await change('high');
    assert.equal(result.status, 'saved');
    assert.equal(selectedOption(field({ priority: result.ticket.priority })), 'High');
  });

  it('uses the due date from the response for the SLA badge and deadline', async () => {
    const now = new Date('2026-10-20T20:00:00.000Z');
    const badge = (ticket) => renderToStaticMarkup(createElement(SlaBadge, { ticket, now }));
    assert.match(badge(medium), /Due in 2d 4h/);

    respond = () => ({ status: 200, body: { ticket: { ...medium, priority: 'high', dueAt: HIGH_DUE } } });
    const { ticket } = await change('high');
    assert.equal(slaDeadline(ticket), formatDateTime(HIGH_DUE));
    assert.match(badge(ticket), /data-sla-state="due_soon"/);
    assert.match(badge(ticket), /Due soon · in 4h/);

    respond = () => ({ status: 200, body: { ticket: { ...medium, priority: 'low', dueAt: LOW_DUE } } });
    const lowered = (await change('low')).ticket;
    assert.equal(slaDeadline(lowered), formatDateTime(LOW_DUE));
  });

  it('ignores a second change made before the first has finished', async () => {
    const started = [];
    let finish;
    const action = () => {
      started.push('request');
      return new Promise((resolve) => { finish = () => resolve({ ...medium, priority: 'high' }); });
    };
    const inFlight = { current: false };

    const firstSave = saveTicketChange({ action, inFlight });
    const secondSave = saveTicketChange({ action, inFlight });

    assert.deepEqual(await secondSave, { status: 'ignored' });
    assert.deepEqual(started, ['request'], 'one request');
    assert.equal(inFlight.current, true);
    finish();
    assert.equal((await firstSave).status, 'saved');
    assert.equal(inFlight.current, false, 'ready for the next change');
  });

  for (const [label, response, text] of [
    ['an invalid priority', { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'priority must be one of: low, medium, high' } } }, /priority must be one of/],
    ['a ticket resolved meanwhile', { status: 400, body: { error: { code: 'TICKET_RESOLVED', message: 'This ticket is resolved and can no longer be changed' } } }, /resolved and can no longer be changed/],
    ['a permission error', { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Forbidden' } } }, /You do not have access to this ticket/],
    ['a ticket that no longer exists', { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Ticket not found' } } }, /This ticket could not be found/],
    ['a change made by someone else', { status: 409, body: { error: { code: 'CONFLICT', message: 'Changed' } } }, /changed by someone else/],
    ['a server error', { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } } }, /The server had a problem/],
    ['a network failure', { throws: true }, /Cannot reach the server/],
  ]) {
    it(`reports ${label} with a clear message`, async () => {
      respond = () => response;
      const inFlight = { current: false };
      const result = await saveTicketChange({ action: () => tickets.assignTicket('tok', 't1', { priority: 'high' }), inFlight });
      assert.equal(result.status, 'failed');
      assert.match(tickets.ticketErrorMessage(result.error, 'fallback'), text);
      assert.equal(inFlight.current, false, 'another try is possible');
    });
  }

  it('treats an expired token as the end of the session, not a page error', async () => {
    respond = () => ({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } } });
    const { error } = await change('high');
    assert.equal(sessionRejection(error, 'tok', 'tok'), 'end');
  });

  it('a failed save leaves the selector on the saved value', () => {
    // The selector is controlled by the stored ticket, which only changes on success.
    assert.equal(selectedOption(field({ priority: medium.priority })), 'Medium');
    assert.match(modal, /priority=\{ticket\.priority\}/);
  });
});

describe('wiring in the Admin Tickets dialog', () => {
  const saveFn = modal.slice(modal.indexOf('async function save('), modal.indexOf('// D-10: status only once assigned'));

  it('saves with assignTicket and only when the value changed', () => {
    assert.match(modal, /if \(priority !== ticket\.priority\) \{\s+save\("priority", \(\) => assignTicket\(token, ticket\.id, \{ priority \}\), "Priority updated\."\);/);
  });

  it('applies the returned ticket, confirms, and refreshes the list', () => {
    const success = saveFn.slice(saveFn.indexOf('result.status === "saved"'), saveFn.indexOf('result.status === "failed"'));
    assert.match(success, /setData\(\(\) => result\.ticket\)/);
    assert.match(success, /setSavedNotice\(savedMessage\)/);
    assert.match(success, /onChanged\(\)/);
  });

  it('on failure ends a rejected session, and otherwise shows the error', () => {
    const failure = saveFn.slice(saveFn.indexOf('result.status === "failed"'));
    assert.match(failure, /!endSessionIfRejected\(result\.error\)/);
    assert.match(failure, /setActionError\(ticketErrorMessage\(result\.error/);
  });

  it('shows the success message and the error in the dialog', () => {
    assert.match(modal, /role="status"[\s\S]*\{savedNotice\}/);
    assert.match(modal, /role="alert"[\s\S]*\{actionError\}/);
  });

  it('every control is disabled while any change is saving', () => {
    assert.equal((modal.match(/disabled=\{Boolean\(busy\) \|\|/g) ?? []).length, 3, 'priority, assignee and status');
  });

  it('keeps the other actions, details and the conversation', () => {
    assert.match(modal, /save\("assign", \(\) => assignTicket\(token, ticket\.id, \{ assignedTo: event\.target\.value \|\| null \}\)\)/);
    assert.match(modal, /save\("status", \(\) => updateTicketStatus\(token, ticket\.id, event\.target\.value\)\)/);
    assert.match(modal, /<SlaBadge ticket=\{ticket\} \/>/);
    assert.match(modal, /slaDeadline\(ticket\)/);
    assert.match(modal, /<StatusHistory ticket=\{ticket\}/);
    assert.match(modal, /<TicketConversation key=\{ticket\.id\} ticket=\{ticket\} \/>/);
  });

  it('keeps the priority badge in the ticket list', () => {
    const list = source.slice(source.indexOf('// MAIN COMPONENT'));
    assert.match(list, /value=\{capitalize\(ticket\.priority\)\}\s+type="priority"/);
  });
});
