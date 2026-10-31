import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// The conversation in the Admin Tickets dialog (contract §9, D-3, D-11). The states are rendered to
// HTML and the send logic runs with a fake request. Clicks are not simulated: the project has no DOM
// test library, so the dialog's wiring is checked in its source and needs a browser check too.

const ADMIN = 'admin-1';
const first = {
  id: 'c1',
  author: { id: 'cust-1', name: 'Cara Customer', role: 'customer' },
  message: 'First <b>message</b>',
  createdAt: '2026-10-20T09:00:00.000Z',
};
const second = {
  id: 'c2',
  author: { id: 'agent-1', name: 'Ana Agent', role: 'agent' },
  message: 'Second message',
  createdAt: '2026-10-20T10:00:00.000Z',
};
const own = {
  id: 'c3',
  author: { id: ADMIN, name: 'Ada Admin', role: 'admin' },
  message: 'Third message',
  createdAt: '2026-10-20T11:00:00.000Z',
};

const source = readFileSync(join(import.meta.dirname, '../src/components/admin/AdminTickets.jsx'), 'utf8');

let vite;
let ConversationView;
let submitReply;
let tickets;

const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(ConversationView, {
      status: 'ready',
      comments: [],
      error: null,
      onRetry: () => {},
      currentUserId: ADMIN,
      ticketStatus: 'in_progress',
      reply: '',
      onReplyChange: () => {},
      onSubmit: () => {},
      ...props,
    }),
  );

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
  ({ ConversationView, submitReply } = await vite.ssrLoadModule('/src/components/admin/AdminTickets.jsx'));
  tickets = await vite.ssrLoadModule('/src/api/tickets.js');
});

after(async () => {
  await vite?.close();
});

describe('viewing the conversation', () => {
  it('shows each comment with its author, role, message and time', () => {
    const html = render({ comments: [first] });
    assert.match(html, /Cara Customer/);
    assert.match(html, /· Customer/);
    assert.match(html, /<time dateTime="2026-10-20T09:00:00.000Z">/);
  });

  it('escapes message text instead of treating it as HTML', () => {
    const html = render({ comments: [first] });
    assert.match(html, /First &lt;b&gt;message&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>message/);
  });

  it("marks the admin's own replies as You", () => {
    const html = render({ comments: [own] });
    assert.match(html, />You</);
    assert.doesNotMatch(html, /Ada Admin/);
  });

  it('keeps comments in the order the API returns them, oldest first', () => {
    const html = render({ comments: [first, second, own] });
    const positions = ['First &lt;b&gt;', 'Second message', 'Third message'].map((text) => html.indexOf(text));
    assert.ok(positions.every((position) => position >= 0), 'all three are shown');
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  });

  it('copes with a comment whose author is missing', () => {
    assert.match(render({ comments: [{ ...first, author: null }] }), /Unknown user/);
  });
});

describe('loading, empty and error states', () => {
  it('shows a loading message before the first answer', () => {
    const html = render({ status: 'loading', comments: null });
    assert.match(html, /Loading conversation…/);
    assert.doesNotMatch(html, /No replies yet/);
  });

  it('keeps the thread visible while refreshing', () => {
    const html = render({ status: 'loading', comments: [first] });
    assert.match(html, /First &lt;b&gt;/);
    assert.match(html, /Refreshing…/);
    assert.doesNotMatch(html, /Loading conversation…/);
  });

  it('shows an empty message only when the list really is empty', () => {
    assert.match(render({ comments: [] }), /No replies yet\./);
    assert.doesNotMatch(render({ comments: [first] }), /No replies yet/);
  });

  it('shows a load failure with a retry, and never the empty message', () => {
    const html = render({ status: 'error', comments: null, error: { status: 500 } });
    assert.match(html, /role="alert"/);
    assert.match(html, /The server had a problem/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /No replies yet/);
  });

  for (const [label, error, text] of [
    ['a forbidden ticket', { status: 403 }, /You do not have access to this ticket/],
    ['a ticket that no longer exists', { status: 404 }, /This ticket could not be found/],
    ['a malformed id', { code: 'INVALID_ID' }, /This ticket could not be found/],
  ]) {
    it(`does not offer a retry for ${label}`, () => {
      const html = render({ status: 'error', comments: null, error });
      assert.match(html, text);
      assert.doesNotMatch(html, /Try again/);
    });
  }
});

describe('sending a reply', () => {
  const sender = () => {
    const sent = [];
    return { sent, send: async (message) => { sent.push(message); return { ...own, message }; } };
  };

  it('sends a valid reply, trimmed, and returns the saved comment', async () => {
    const { sent, send } = sender();
    const inFlight = { current: false };
    const result = await submitReply({ message: '  Looking into it.  ', inFlight, send });
    assert.deepEqual(sent, ['Looking into it.']);
    assert.equal(result.status, 'sent');
    assert.equal(result.comment.message, 'Looking into it.');
    assert.equal(inFlight.current, false, 'ready for the next reply');
  });

  for (const [label, message] of [['empty', ''], ['whitespace-only', ' \n\t ']]) {
    it(`rejects a ${label} reply without sending it`, async () => {
      const { sent, send } = sender();
      const result = await submitReply({ message, inFlight: { current: false }, send });
      assert.equal(result.status, 'invalid');
      assert.equal(result.message, 'Message is required.');
      assert.deepEqual(sent, []);
    });
  }

  it('rejects a reply over the 2000-character limit without sending it', async () => {
    const { sent, send } = sender();
    const result = await submitReply({ message: 'x'.repeat(2001), inFlight: { current: false }, send });
    assert.equal(result.status, 'invalid');
    assert.match(result.message, /at most 2000/);
    assert.deepEqual(sent, []);
  });

  it('ignores a second submit made before the first has finished', async () => {
    const calls = [];
    let finish;
    const send = (message) => {
      calls.push(message);
      return new Promise((resolve) => { finish = () => resolve({ ...own, message }); });
    };
    const inFlight = { current: false };

    const firstSubmit = submitReply({ message: 'Once only', inFlight, send });
    const secondSubmit = submitReply({ message: 'Once only', inFlight, send });

    assert.deepEqual(await secondSubmit, { status: 'ignored' });
    assert.deepEqual(calls, ['Once only'], 'one request');
    finish();
    assert.equal((await firstSubmit).status, 'sent');
    assert.equal(inFlight.current, false);
  });

  it('reports a failed send and allows another try', async () => {
    const failure = Object.assign(new Error('Nope'), { status: 500 });
    const inFlight = { current: false };
    const result = await submitReply({ message: 'Hello', inFlight, send: async () => { throw failure; } });
    assert.equal(result.status, 'failed');
    assert.equal(result.error, failure, 'the error is not swallowed');
    assert.equal(inFlight.current, false);
  });

  it('shows the form states: field error, send error, success and sending', () => {
    assert.match(render({ fieldError: 'Message is required.' }), /aria-invalid="true"[\s\S]*Message is required\./);
    assert.match(render({ sendError: 'Your reply could not be sent.' }), /role="alert"[^>]*>Your reply could not be sent\./);
    assert.match(render({ sent: true }), /role="status"[^>]*>Reply sent\./);
    assert.doesNotMatch(render(), /Reply sent\./);

    const html = render({ sending: true, reply: 'Hello' });
    assert.match(html, /Sending…/);
    assert.match(html, /<button type="submit" disabled=""/);
    assert.match(html, /<textarea[^>]*disabled=""/);
  });

  it('keeps the typed text visible and counts its trimmed length', () => {
    const html = render({ reply: '  Hello  ', sendError: 'Failed' });
    assert.match(html, /Hello/);
    assert.match(html, /5\/2000/);
  });
});

describe('resolved tickets (D-3, D-11: replies stay allowed)', () => {
  it('keeps the reply form enabled and explains that replying does not reopen the ticket', () => {
    const html = render({ ticketStatus: 'resolved' });
    assert.match(html, /You can still reply, but replying does not reopen it\./);
    assert.match(html, /<textarea/);
    assert.doesNotMatch(html, /<textarea[^>]*disabled=""/);
    assert.doesNotMatch(html, /<button type="submit" disabled=""/);
  });

  it('shows no such note on other tickets', () => {
    for (const ticketStatus of ['open', 'in_progress']) {
      assert.doesNotMatch(render({ ticketStatus }), /does not reopen/);
    }
  });
});

describe('requests', () => {
  const realFetch = globalThis.fetch;
  let calls;
  let respond;

  beforeEach(() => {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, ...init, body: init.body === undefined ? undefined : JSON.parse(init.body) });
      const { status, body } = respond();
      return { ok: status < 300, status, json: async () => body };
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('loads comments from the ticket\'s conversation route', async () => {
    respond = () => ({ status: 200, body: { comments: [first, second] } });
    assert.deepEqual(await tickets.listComments('tok', 't1'), [first, second]);
    assert.match(calls[0].url, /\/api\/tickets\/t1\/comments$/);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  });

  it('a real API failure reaches submitReply with its status, for the page to act on', async () => {
    respond = () => ({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } } });
    const result = await submitReply({
      message: 'Hello',
      inFlight: { current: false },
      send: (message) => tickets.addComment('tok', 't1', message),
    });
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body, { message: 'Hello' });
    assert.equal(result.status, 'failed');
    assert.equal(result.error.status, 401);
  });
});

describe('wiring in the Admin Tickets dialog', () => {
  const conversation = source.slice(source.indexOf('function TicketConversation('), source.indexOf('// TICKET DETAILS MODAL'));
  const modal = source.slice(source.indexOf('function TicketModal('), source.indexOf('// MAIN COMPONENT'));

  it('loads with listComments and posts with addComment', () => {
    assert.match(conversation, /listComments\(authToken, ticketId\)/);
    assert.match(conversation, /addComment\(token, ticketId, message\)/);
  });

  it('refreshes after a successful reply and clears the text only then', () => {
    const success = conversation.slice(conversation.indexOf('result.status === "sent"'));
    assert.match(success, /setReply\(""\)/);
    assert.match(success, /reload\(\)/);
    const failure = conversation.slice(conversation.indexOf('result.status === "failed"'), conversation.indexOf('result.status === "sent"'));
    assert.doesNotMatch(failure, /setReply/);
  });

  it('ends the session when the token is rejected, and otherwise shows the error', () => {
    const failure = conversation.slice(conversation.indexOf('result.status === "failed"'), conversation.indexOf('result.status === "sent"'));
    assert.match(failure, /endSessionIfRejected\(result\.error\)/);
    assert.match(failure, /setSendError\(ticketErrorMessage/);
  });

  it('renders the conversation in the dialog, once a ticket has loaded', () => {
    assert.match(modal, /\{ticket && \([\s\S]*<TicketConversation key=\{ticket\.id\} ticket=\{ticket\} \/>/);
  });

  it('keeps the existing dialog actions and details', () => {
    assert.match(modal, /assignTicket\(token, ticket\.id, \{ assignedTo: event\.target\.value \|\| null \}\)/);
    assert.match(modal, /updateTicketStatus\(token, ticket\.id, event\.target\.value\)/);
    assert.match(modal, /<StatusHistory ticket=\{ticket\}/);
    assert.match(modal, /<SlaBadge ticket=\{ticket\} \/>/);
    assert.match(modal, /slaDeadline\(ticket\)/);
    assert.match(modal, /<PriorityField\s+priority=\{ticket\.priority\}/);
  });

  it('keeps the queue filters and search', () => {
    assert.match(source, /listQueue\(token, \{ q: query, status: statusFilter, priority: priorityFilter, category, assignee, page, limit: PAGE_SIZE \}\)/);
  });
});
