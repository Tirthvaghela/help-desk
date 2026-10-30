import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { formatDateTime } from '../src/components/staff/staffFormat.js';
import { formatSlaDuration, slaDeadline, slaDisplay, slaState } from '../src/components/staff/slaFormat.js';

// SLA display in the staff views. Every time is fixed, so the results never depend on the clock.
// The 24-hour ticket below is "due soon" from 18:00 UTC on Oct 20 (6 hours, exactly 25%, left).

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const createdAt = '2026-10-20T00:00:00.000Z';
const dueAt = '2026-10-21T00:00:00.000Z';
const dueMs = Date.parse(dueAt);
const before_ = (ms) => new Date(dueMs - ms);
const after_ = (ms) => new Date(dueMs + ms);
const open = { status: 'open', createdAt, dueAt, resolvedAt: null };
const resolvedAt = (date) => ({ status: 'resolved', createdAt, dueAt, resolvedAt: date });

describe('slaState', () => {
  it('due while more than 25% of the target is left', () => {
    assert.equal(slaState(open, new Date(createdAt)), 'due');
    assert.equal(slaState(open, before_(6 * HOUR + 1)), 'due');
  });

  it('due soon at exactly 25% left and up to and including the deadline', () => {
    assert.equal(slaState(open, before_(6 * HOUR)), 'due_soon');
    assert.equal(slaState(open, before_(1)), 'due_soon');
    assert.equal(slaState(open, new Date(dueAt)), 'due_soon');
  });

  it('overdue only after the deadline', () => {
    assert.equal(slaState(open, after_(1)), 'overdue');
    assert.equal(slaState({ ...open, status: 'in_progress' }, after_(1)), 'overdue');
  });

  it('met when resolved before or exactly at the deadline, missed after it', () => {
    assert.equal(slaState(resolvedAt('2026-10-20T12:00:00.000Z'), after_(DAY)), 'met');
    assert.equal(slaState(resolvedAt(dueAt), after_(DAY)), 'met');
    assert.equal(slaState(resolvedAt(after_(1).toISOString()), after_(DAY)), 'missed');
  });

  it('a resolved ticket does not change with the current time', () => {
    const missed = resolvedAt(after_(HOUR).toISOString());
    assert.equal(slaState(missed, new Date(createdAt)), 'missed');
    assert.equal(slaState(missed, after_(30 * DAY)), 'missed');
  });

  it('no SLA without a usable due date (older tickets have none)', () => {
    for (const value of [undefined, null, '', 'not-a-date', true, false]) {
      assert.equal(slaState({ ...open, dueAt: value }, after_(HOUR)), 'no_sla', `dueAt ${value}`);
    }
    assert.equal(slaState({ status: 'open', createdAt }, after_(HOUR)), 'no_sla', 'field missing, as on an older API');
    assert.equal(slaState({}, after_(HOUR)), 'no_sla');
    assert.equal(slaState(undefined, after_(HOUR)), 'no_sla');
  });

  it('no SLA for a resolved ticket with no valid resolution time', () => {
    for (const value of [undefined, null, 'not-a-date']) {
      assert.equal(slaState(resolvedAt(value), after_(HOUR)), 'no_sla', `resolvedAt ${value}`);
    }
  });

  it('an unusable current time gives no SLA instead of breaking the queue', () => {
    assert.equal(slaState(open, new Date('nope')), 'no_sla');
  });

  it('without a target to measure there is no "due soon", only due then overdue', () => {
    const noCreated = { status: 'open', dueAt };
    assert.equal(slaState(noCreated, before_(MINUTE)), 'due');
    assert.equal(slaState({ ...noCreated, createdAt: 'not-a-date' }, before_(MINUTE)), 'due');
    assert.equal(slaState({ ...noCreated, createdAt: dueAt }, before_(MINUTE)), 'due');
    assert.equal(slaState(noCreated, after_(1)), 'overdue');
  });

  it('follows the ticket\'s own target (after a priority change the target is different)', () => {
    const week = { status: 'open', createdAt, dueAt: new Date(Date.parse(createdAt) + 168 * HOUR).toISOString() };
    const end = Date.parse(week.dueAt);
    assert.equal(slaState(week, new Date(end - 42 * HOUR - 1)), 'due');
    assert.equal(slaState(week, new Date(end - 42 * HOUR)), 'due_soon');
  });
});

describe('formatSlaDuration', () => {
  it('minutes under an hour, hours under a day, then days and hours', () => {
    assert.equal(formatSlaDuration(45 * MINUTE), '45m');
    assert.equal(formatSlaDuration(5 * HOUR), '5h');
    assert.equal(formatSlaDuration(2 * DAY + 4 * HOUR), '2d 4h');
    assert.equal(formatSlaDuration(DAY + 3 * HOUR), '1d 3h');
    assert.equal(formatSlaDuration(2 * DAY), '2d');
  });

  it('rounds down, and never shows seconds', () => {
    assert.equal(formatSlaDuration(HOUR - 1), '59m');
    assert.equal(formatSlaDuration(2 * HOUR - 1), '1h');
    assert.equal(formatSlaDuration(DAY - 1), '23h');
    assert.equal(formatSlaDuration(2 * DAY - 1), '1d 23h');
    assert.equal(formatSlaDuration(MINUTE), '1m');
    assert.equal(formatSlaDuration(MINUTE - 1), '<1m');
    assert.equal(formatSlaDuration(1), '<1m');
  });

  it('never negative or broken on bad input', () => {
    assert.equal(formatSlaDuration(-3 * HOUR), '3h');
    assert.equal(formatSlaDuration(0), '<1m');
    assert.equal(formatSlaDuration(NaN), '<1m');
    assert.equal(formatSlaDuration(undefined), '<1m');
  });
});

describe('slaDisplay', () => {
  it('due: the time left', () => {
    assert.deepEqual(slaDisplay(open, before_(12 * HOUR)), { state: 'due', label: 'Due in 12h', title: `Due ${formatDateTime(dueAt)}` });
    const week = { status: 'open', createdAt, dueAt: new Date(Date.parse(createdAt) + 168 * HOUR).toISOString() };
    assert.equal(slaDisplay(week, new Date(Date.parse(week.dueAt) - 2 * DAY - 4 * HOUR)).label, 'Due in 2d 4h');
  });

  it('due soon: the label and the time left', () => {
    assert.equal(slaDisplay(open, before_(4 * HOUR)).label, 'Due soon · in 4h');
    assert.equal(slaDisplay(open, before_(6 * HOUR)).label, 'Due soon · in 6h');
    assert.equal(slaDisplay(open, before_(30 * 1000)).label, 'Due soon · in <1m');
  });

  it('exactly at the deadline it is still due soon, and says "now"', () => {
    const shown = slaDisplay(open, new Date(dueAt));
    assert.equal(shown.state, 'due_soon');
    assert.equal(shown.label, 'Due soon · now');
  });

  it('overdue: how long, with no negative numbers', () => {
    assert.equal(slaDisplay(open, after_(1)).label, 'Overdue by <1m');
    assert.equal(slaDisplay(open, after_(45 * MINUTE)).label, 'Overdue by 45m');
    assert.equal(slaDisplay(open, after_(3 * HOUR)).label, 'Overdue by 3h');
    assert.equal(slaDisplay(open, after_(DAY + 3 * HOUR)).label, 'Overdue by 1d 3h');
  });

  it('met and missed: the label, with the exact times in the title', () => {
    const met = slaDisplay(resolvedAt('2026-10-20T12:00:00.000Z'), after_(DAY));
    assert.equal(met.label, 'Met');
    assert.equal(met.title, `Due ${formatDateTime(dueAt)}; resolved ${formatDateTime('2026-10-20T12:00:00.000Z')}`);
    assert.equal(slaDisplay(resolvedAt(dueAt), after_(DAY)).label, 'Met');
    assert.equal(slaDisplay(resolvedAt(after_(HOUR).toISOString()), after_(DAY)).label, 'Missed');
  });

  it('no SLA: the label, and why', () => {
    for (const value of [undefined, null, 'not-a-date']) {
      assert.deepEqual(slaDisplay({ ...open, dueAt: value }, after_(HOUR)), { state: 'no_sla', label: 'No SLA', title: 'This ticket has no due date' });
    }
    assert.equal(slaDisplay(resolvedAt(null), after_(HOUR)).label, 'No SLA');
    assert.equal(slaDisplay(resolvedAt(null), after_(HOUR)).title, 'No resolution time recorded for this ticket');
    assert.equal(slaDisplay(null, after_(HOUR)).label, 'No SLA');
    assert.equal(slaDisplay(undefined, after_(HOUR)).label, 'No SLA');
  });

  it('an older ticket as the API returns it, every status, shows No SLA and no time', () => {
    for (const status of ['open', 'in_progress', 'resolved']) {
      const shown = slaDisplay({ status, createdAt, resolvedAt: status === 'resolved' ? dueAt : null, dueAt: null }, after_(DAY));
      assert.equal(shown.label, 'No SLA');
    }
  });
});

describe('slaDeadline', () => {
  it('the formatted due date, or null without a valid one', () => {
    assert.equal(slaDeadline(open), formatDateTime(dueAt));
    for (const value of [undefined, null, '', 'not-a-date', true]) {
      assert.equal(slaDeadline({ dueAt: value }), null, `dueAt ${value}`);
    }
    assert.equal(slaDeadline(null), null);
  });
});

describe('SlaBadge', () => {
  let vite;
  let SlaBadge;
  const render = (ticket, now, props = {}) => renderToStaticMarkup(createElement(SlaBadge, { ticket, now, ...props }));
  const stateOf = (html) => html.match(/data-sla-state="([^"]+)"/)?.[1];

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
    SlaBadge = (await vite.ssrLoadModule('/src/components/staff/SlaBadge.jsx')).default;
  });

  after(async () => {
    await vite?.close();
  });

  it('renders each of the six states with its text', () => {
    const cases = [
      [open, before_(12 * HOUR), 'due', 'Due in 12h'],
      [open, before_(4 * HOUR), 'due_soon', 'Due soon · in 4h'],
      [open, after_(3 * HOUR), 'overdue', 'Overdue by 3h'],
      [resolvedAt(dueAt), after_(DAY), 'met', 'Met'],
      [resolvedAt(after_(HOUR).toISOString()), after_(DAY), 'missed', 'Missed'],
      [{ ...open, dueAt: null }, after_(DAY), 'no_sla', 'No SLA'],
    ];
    for (const [ticket, now, state, text] of cases) {
      const html = render(ticket, now);
      assert.equal(stateOf(html), state);
      assert.ok(html.includes(text), `${state}: ${html}`);
    }
  });

  it('every state has its own text and a text colour; green and red are not the only signal', () => {
    const met = render(resolvedAt(dueAt), after_(DAY));
    const missed = render(resolvedAt(after_(HOUR).toISOString()), after_(DAY));
    assert.match(met, /text-\[#/);
    assert.match(missed, /text-\[#/);
    assert.ok(met.includes('>Met') && missed.includes('>Missed'));
  });

  it('names itself for screen readers and keeps the exact due date in the title', () => {
    const html = render(open, before_(12 * HOUR));
    assert.ok(html.includes('<span class="sr-only">SLA: </span>'));
    assert.ok(html.includes(`title="Due ${formatDateTime(dueAt)}"`));
  });

  it('stays on one line, in the small or medium size', () => {
    assert.match(render(open, before_(HOUR), { size: 'small' }), /whitespace-nowrap[^"]*text-\[10px\]/);
    assert.match(render(open, before_(HOUR)), /whitespace-nowrap[^"]*text-\[11px\]/);
  });

  it('never throws on bad data', () => {
    for (const ticket of [null, undefined, {}, { dueAt: 'not-a-date' }, { dueAt: 42e20, status: 'open' }]) {
      assert.equal(stateOf(render(ticket, after_(HOUR))), 'no_sla');
    }
  });

  it('updates when rendered again with refreshed ticket data', () => {
    const now = before_(12 * HOUR);
    assert.ok(render(open, now).includes('Due in 12h'));
    const raised = { ...open, dueAt: new Date(now.getTime() + HOUR).toISOString() };
    assert.equal(stateOf(render(raised, now)), 'due_soon');
    assert.ok(render(raised, now).includes('Due soon · in 1h'));
  });
});

describe('customer screens', () => {
  it('never use the SLA badge or due date', () => {
    const roots = ['components/customer', 'pages/customer'].map((path) => join(import.meta.dirname, '../src', path));
    for (const root of roots) {
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const source = readFileSync(join(entry.parentPath, entry.name), 'utf8');
        assert.doesNotMatch(source, /SlaBadge|slaFormat|dueAt/, entry.name);
      }
    }
  });
});
