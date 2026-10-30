import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  asOfText,
  assigneeRows,
  categoryRows,
  complianceSummary,
  countText,
  FAILED,
  percentOf,
  priorityRows,
  resolutionSummary,
  statusRows,
  UNAVAILABLE,
} from '../src/components/staff/analyticsFormat.js';
import {
  ANALYTICS_PERIODS,
  customRange,
  describeRange,
  presetRange,
  reportFileName,
} from '../src/components/staff/analyticsRange.js';
import { periodStart, ticketsInRange } from '../src/components/staff/reportCsv.js';
import { formatDateTime } from '../src/components/staff/staffFormat.js';

// The Reports page: range logic, display data, and the real panels rendered in each state.

const HOUR = 60 * 60 * 1000;
const sample = () => ({
  filters: { from: null, to: null, basis: 'createdAt' },
  asOf: '2026-10-30T12:00:00.000Z',
  overview: { total: 8, unassigned: 3 },
  byStatus: { open: 4, in_progress: 1, resolved: 3, other: 0 },
  byPriority: { low: 2, medium: 2, high: 4, other: 0 },
  byCategory: [
    { category: { id: 'c1', name: 'Billing', isActive: true }, count: 5 },
    { category: { id: 'c2', name: 'Old Support Queue', isActive: false }, count: 2 },
    { category: { id: 'c3', name: null, isActive: null }, count: 1 },
  ],
  resolutionTime: { averageMilliseconds: 2 * 24 * HOUR + 4 * HOUR, eligibleCount: 3, excludedCount: 0 },
  sla: { met: 2, missed: 1, due: 2, dueSoon: 1, overdue: 1, noSla: 1, compliancePercent: 66.6, eligibleResolvedCount: 3 },
  byAssignee: [{ assignee: { id: 'a1', name: 'Agent Ana' }, total: 3, byStatus: { open: 0, in_progress: 1, resolved: 2, other: 0 } }],
});

describe('date presets', () => {
  const now = new Date('2026-10-30T12:00:00.000Z');

  it('offers every required option, in order', () => {
    assert.deepEqual(ANALYTICS_PERIODS, ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'All Time', 'Custom']);
  });

  it('rolling periods send from only, N×24 hours before now', () => {
    assert.deepEqual(presetRange('Last 7 Days', now), { from: new Date('2026-10-23T12:00:00.000Z'), to: null });
    assert.deepEqual(presetRange('Last 30 Days', now), { from: new Date('2026-09-30T12:00:00.000Z'), to: null });
    assert.deepEqual(presetRange('Last 90 Days', now), { from: new Date('2026-08-01T12:00:00.000Z'), to: null });
  });

  it('All Time sends neither bound', () => {
    assert.deepEqual(presetRange('All Time', now), { from: null, to: null });
    assert.equal(periodStart('All Time', now), null);
  });
});

describe('custom range', () => {
  const originalTz = process.env.TZ;
  const inZone = (zone, fn) => {
    process.env.TZ = zone;
    try {
      return fn();
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  };
  const now = () => new Date('2026-10-30T12:00:00.000Z');

  it('covers both whole days in the browser time zone, as UTC instants (India)', () => {
    inZone('Asia/Kolkata', () => {
      const { range } = customRange('2026-10-01', '2026-10-05', now());
      assert.equal(range.from.toISOString(), '2026-09-30T18:30:00.000Z');
      assert.equal(range.to.toISOString(), '2026-10-05T18:29:59.999Z');
    });
  });

  it('the same days are different instants in another time zone (New York)', () => {
    inZone('America/New_York', () => {
      const { range } = customRange('2026-10-01', '2026-10-05', now());
      assert.equal(range.from.toISOString(), '2026-10-01T04:00:00.000Z');
      assert.equal(range.to.toISOString(), '2026-10-06T03:59:59.999Z');
    });
  });

  it('follows daylight-saving changes: the first day and the last have different offsets', () => {
    inZone('America/New_York', () => {
      const { range } = customRange('2026-03-07', '2026-03-09', new Date('2026-06-01T00:00:00Z'));
      assert.equal(range.from.toISOString(), '2026-03-07T05:00:00.000Z');
      assert.equal(range.to.toISOString(), '2026-03-10T03:59:59.999Z');
    });
  });

  it('a single day is allowed', () => {
    inZone('UTC', () => {
      const { range } = customRange('2026-10-01', '2026-10-01', now());
      assert.equal(range.from.toISOString(), '2026-10-01T00:00:00.000Z');
      assert.equal(range.to.toISOString(), '2026-10-01T23:59:59.999Z');
    });
  });

  it('refuses blank dates instead of treating them as All Time', () => {
    for (const [start, end] of [['', ''], ['2026-10-01', ''], ['', '2026-10-01'], [undefined, undefined]]) {
      const result = customRange(start, end, now());
      assert.match(result.error, /both/);
      assert.equal(result.range, undefined);
    }
  });

  it('refuses impossible and malformed dates', () => {
    for (const [start, end] of [['2026-02-31', '2026-03-01'], ['2026-10-01', '2026-13-01'], ['10/01/2026', '2026-10-05'], ['2026-10-01', 'soon']]) {
      assert.match(customRange(start, end, now()).error, /valid/);
    }
  });

  it('refuses an end before the start', () => {
    assert.match(customRange('2026-10-05', '2026-10-01', now()).error, /before/);
  });

  it('refuses future dates, judged by the local day', () => {
    assert.match(customRange('2026-10-01', '2026-10-31', now()).error, /future/);
    assert.match(customRange('2026-10-31', '2026-10-31', now()).error, /future/);
    inZone('Asia/Kolkata', () => {
      // 20:00 UTC on the 30th is already the 31st in India.
      const late = new Date('2026-10-30T20:00:00.000Z');
      assert.ok(customRange('2026-10-31', '2026-10-31', late).range);
      assert.match(customRange('2026-11-01', '2026-11-01', late).error, /future/);
    });
  });
});

describe('range labels and file names', () => {
  it('describes each kind of range', () => {
    assert.equal(describeRange({ period: 'All Time', from: null, to: null }), 'All Time');
    const from = new Date('2026-10-23T12:00:00.000Z');
    assert.equal(describeRange({ period: 'Last 7 Days', from, to: null }), `Last 7 Days, since ${formatDateTime(from)}`);
    const day = (date) => date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const first = new Date(2026, 9, 1);
    const fifth = new Date(2026, 9, 5, 23, 59, 59, 999);
    assert.equal(describeRange({ period: 'Custom', from: first, to: fifth }), `${day(first)} to ${day(fifth)}`);
    assert.equal(describeRange({ period: 'Custom', from: first, to: new Date(2026, 9, 1, 23, 59, 59, 999) }), day(first));
  });

  it('names the CSV after the same range', () => {
    assert.equal(reportFileName({ period: 'Last 90 Days' }), 'helpdesk-report-last-90-days.csv');
    assert.equal(reportFileName({ period: 'All Time' }), 'helpdesk-report-all-time.csv');
    assert.equal(reportFileName({ period: 'Custom', startDay: '2026-10-01', endDay: '2026-10-05' }), 'helpdesk-report-2026-10-01-to-2026-10-05.csv');
  });
});

describe('CSV range', () => {
  const at = (iso) => ({ createdAt: iso });
  const tickets = ['2026-10-01T00:00:00.000Z', '2026-10-05T23:59:59.999Z', '2026-10-06T00:00:00.000Z', '2026-09-30T23:59:59.999Z'].map(at);

  it('keeps tickets inside both inclusive bounds, including a custom end', () => {
    const range = { from: new Date('2026-10-01T00:00:00.000Z'), to: new Date('2026-10-05T23:59:59.999Z') };
    assert.deepEqual(ticketsInRange(tickets, range), tickets.slice(0, 2));
  });

  it('a missing bound is no limit', () => {
    assert.equal(ticketsInRange(tickets, { from: new Date('2026-10-01T00:00:00.000Z'), to: null }).length, 3);
    assert.equal(ticketsInRange(tickets, { from: null, to: null }).length, 4);
    assert.equal(ticketsInRange(tickets).length, 4);
  });
});

describe('figures', () => {
  it('keeps failed, missing and zero apart', () => {
    assert.equal(countText(null, 5), FAILED);
    assert.equal(countText(sample(), undefined), UNAVAILABLE);
    assert.equal(countText(sample(), null), UNAVAILABLE);
    assert.equal(countText(sample(), 0), 0);
    assert.equal(countText(sample(), 7), 7);
  });

  it('percentages have at most one decimal, and need a total', () => {
    assert.equal(percentOf(1, 3), 33.3);
    assert.equal(percentOf(4, 8), 50);
    assert.equal(percentOf(0, 8), 0);
    assert.equal(percentOf(0, 0), null);
    assert.equal(percentOf(3, undefined), null);
    assert.equal(percentOf(undefined, 3), null);
  });

  it('maps status and priority to labelled rows, in a fixed order', () => {
    const data = sample();
    assert.deepEqual(statusRows(data).map((row) => [row.label, row.count, row.percent]), [
      ['Open', 4, 50],
      ['In Progress', 1, 12.5],
      ['Resolved', 3, 37.5],
    ]);
    assert.deepEqual(priorityRows(data).map((row) => [row.label, row.count, row.percent]), [
      ['High', 4, 50],
      ['Medium', 2, 25],
      ['Low', 2, 25],
    ]);
  });

  it('shows an Other row only when there is something unexpected', () => {
    const data = sample();
    data.byStatus.other = 2;
    data.overview.total = 10;
    assert.deepEqual(statusRows(data).at(-1), { key: 'other', label: 'Other', count: 2, percent: 20 });
    assert.ok(!priorityRows(sample()).some((row) => row.key === 'other'));
  });

  it('a missing breakdown or a missing value is unavailable, not zero', () => {
    const data = sample();
    delete data.byStatus;
    assert.equal(statusRows(data), null);
    const partial = sample();
    delete partial.byPriority.high;
    const high = priorityRows(partial).find((row) => row.key === 'high');
    assert.equal(high.count, null);
    assert.equal(high.percent, null);
  });

  it('labels inactive and unknown categories, keeping the API order', () => {
    assert.deepEqual(categoryRows(sample()).map((row) => [row.label, row.count, row.percent]), [
      ['Billing', 5, 62.5],
      ['Old Support Queue (inactive)', 2, 25],
      ['Unknown category', 1, 12.5],
    ]);
    assert.equal(categoryRows({ overview: { total: 0 } }), null);
  });

  it('names assignees, with a fallback for a deleted user', () => {
    assert.deepEqual(assigneeRows(sample()), [{ id: 'a1', name: 'Agent Ana', assigned: 3, resolved: 2 }]);
    const data = sample();
    data.byAssignee[0].assignee = { id: 'a1', name: null };
    assert.equal(assigneeRows(data)[0].name, 'Unknown user');
    assert.equal(assigneeRows({}), null);
  });

  it('resolution time: readable, with its eligible and excluded counts', () => {
    assert.deepEqual(resolutionSummary(sample()), { value: '2d 4h', note: 'From creation to resolution, across 3 resolved tickets.' });
    const data = sample();
    data.resolutionTime = { averageMilliseconds: 5 * HOUR, eligibleCount: 1, excludedCount: 1 };
    assert.deepEqual(resolutionSummary(data), {
      value: '5h',
      note: 'From creation to resolution, across 1 resolved ticket. 1 resolved ticket left out: missing or invalid times.',
    });
    data.resolutionTime = { averageMilliseconds: null, eligibleCount: 0, excludedCount: 2 };
    assert.equal(resolutionSummary(data).value, 'No data');
    assert.match(resolutionSummary(data).note, /2 resolved tickets left out/);
    assert.equal(resolutionSummary(null).value, FAILED);
    assert.equal(resolutionSummary({}).value, UNAVAILABLE);
  });

  it('compliance: null means nothing to measure, not 0%', () => {
    assert.deepEqual(complianceSummary(sample()), { value: '66.6%', note: 'Met ÷ (Met + Missed), across 3 resolved tickets with an SLA.' });
    const none = sample();
    none.sla.compliancePercent = null;
    none.sla.eligibleResolvedCount = 0;
    assert.equal(complianceSummary(none).value, 'No data');
    const zero = sample();
    zero.sla.compliancePercent = 0;
    assert.equal(complianceSummary(zero).value, '0%');
    assert.equal(complianceSummary(null).value, FAILED);
    assert.equal(complianceSummary({}).value, UNAVAILABLE);
  });

  it('names the time the current SLA states were worked out', () => {
    assert.equal(asOfText(sample()), `Overdue and Due soon as of ${formatDateTime('2026-10-30T12:00:00.000Z')}`);
    assert.equal(asOfText(null), null);
  });
});

describe('AnalyticsPanels', () => {
  let vite;
  let AnalyticsPanels;
  const render = (props) => renderToStaticMarkup(createElement(AnalyticsPanels, { status: 'ready', data: sample(), error: null, onRetry: () => {}, ...props }));

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
    AnalyticsPanels = (await vite.ssrLoadModule('/src/components/admin/AnalyticsPanels.jsx')).default;
  });

  after(async () => {
    await vite?.close();
  });

  it('shows every panel, in the agreed order, with its figures', () => {
    const html = render();
    const order = ['Total Tickets', 'Tickets by Status', 'Tickets by Priority', 'Tickets by Category', 'Average Resolution Time', 'SLA Performance', 'Agent Performance'];
    const positions = order.map((title) => html.indexOf(title));
    assert.ok(positions.every((position) => position >= 0), String(positions));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    for (const text of ['4 · 50%', '1 · 12.5%', '3 · 37.5%', 'Old Support Queue (inactive)', 'Unknown category', '2d 4h', '66.6%', 'Agent Ana']) {
      assert.ok(html.includes(text), text);
    }
    assert.ok(html.includes(asOfText(sample())));
  });

  it('bars start at zero: each width is the share of the total', () => {
    const html = render();
    assert.ok(html.includes('width:50%'));
    assert.ok(html.includes('width:12.5%'));
    assert.ok(html.includes('title="In Progress: 1 · 12.5%"'), 'native tooltip');
  });

  it('keeps resolved outcomes, current risk and No SLA in separate groups', () => {
    const html = render();
    const resolved = html.indexOf('Resolved tickets');
    const unresolved = html.indexOf('Unresolved tickets');
    const noSla = html.indexOf('>No SLA<');
    assert.ok(resolved >= 0 && resolved < unresolved && unresolved < noSla);
    const between = html.slice(resolved, unresolved);
    assert.ok(between.includes('Met') && between.includes('Missed') && !between.includes('Overdue'));
    assert.ok(html.slice(unresolved, noSla).includes('Overdue'));
  });

  it('first load: a loading message, and no figures', () => {
    const html = render({ status: 'loading', data: null });
    assert.ok(html.includes('role="status"') && html.includes('Loading analytics'));
    assert.ok(!html.includes('Total Tickets'));
  });

  it('refresh: old figures stay, dimmed and marked busy', () => {
    const html = render({ status: 'loading' });
    assert.ok(html.includes('aria-busy="true"'));
    assert.ok(html.includes('opacity-50'));
    assert.ok(html.includes('Updating figures'));
    assert.ok(html.includes('66.6%'));
    assert.ok(!render().includes('opacity-50'));
  });

  it('failure: an error and a retry, with — and never a false zero', () => {
    const html = render({ status: 'error', data: null, error: { status: 500 } });
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes('The server had a problem'));
    assert.ok(html.includes('Try again'));
    assert.ok(html.includes(FAILED));
    const figures = html.replace(/<[^>]+>/g, '|');
    assert.ok(!/\|0\|/.test(figures), 'no zero figures');
    assert.ok(!figures.includes('No tickets in this period'));
  });

  it('missing fields: Unavailable, not zero, and the rest still shows', () => {
    const data = sample();
    delete data.sla;
    delete data.byCategory;
    delete data.overview.unassigned;
    const html = render({ data });
    assert.ok(html.includes(UNAVAILABLE));
    assert.ok(html.includes('4 · 50%'), 'other panels unaffected');
    assert.ok(html.includes('Agent Ana'));
  });

  it('empty result: real zeros, and "No tickets in this period"', () => {
    const empty = {
      filters: { from: null, to: null, basis: 'createdAt' },
      asOf: '2026-10-30T12:00:00.000Z',
      overview: { total: 0, unassigned: 0 },
      byStatus: { open: 0, in_progress: 0, resolved: 0, other: 0 },
      byPriority: { low: 0, medium: 0, high: 0, other: 0 },
      byCategory: [],
      resolutionTime: { averageMilliseconds: null, eligibleCount: 0, excludedCount: 0 },
      sla: { met: 0, missed: 0, due: 0, dueSoon: 0, overdue: 0, noSla: 0, compliancePercent: null, eligibleResolvedCount: 0 },
      byAssignee: [],
    };
    const html = render({ data: empty });
    assert.ok(html.includes('No tickets in this period'));
    assert.ok(html.includes('No assigned tickets in this period'));
    assert.ok(html.includes('No resolved tickets with an SLA in this period'));
    assert.ok(!html.includes(UNAVAILABLE));
    assert.ok(!html.includes('role="alert"'));
    assert.ok(!html.includes('NaN') && !html.includes('undefined'));
  });
});

describe('admin-only access', () => {
  const source = (path) => readFileSync(join(import.meta.dirname, '../src', path), 'utf8');

  it('the Reports page is only reachable through the admin route', () => {
    assert.match(source('App.jsx'), /<StaffRoute role="admin">\s*<AdminDashboard \/>/);
    assert.match(source('pages/admin/AdminDashboard.jsx'), /<AdminReports \/>/);
  });

  it('the analytics API is only called from the admin Reports page', () => {
    for (const path of ['components/agent/AgentInbox.jsx', 'components/agent/AgentOverview.jsx', 'pages/agent/AgentDashboard.jsx', 'pages/customer/MyTickets.jsx', 'pages/customer/TicketDetail.jsx']) {
      assert.doesNotMatch(source(path), /getAnalytics|AnalyticsPanels|AdminReports/, path);
    }
  });
});
