import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDueAt,
  DEFAULT_SLA_HOURS,
  DUE_SOON_SHARE,
  MAX_SLA_HOURS,
  readSlaPolicy,
  SLA_STATES,
  slaState,
  toValidDate,
} from '../src/utils/sla.js';
import { describeConfig, readEnv } from '../src/config/envRules.js';

// SLA policy and calculations (utils/sla.js). Pure functions with fixed dates: no database,
// no real clock.

const HOUR = 60 * 60 * 1000;
const CREATED = new Date('2026-10-01T09:00:00.000Z');
const at = (hoursAfterCreation) => new Date(CREATED.getTime() + hoursAfterCreation * HOUR);
const POLICY = DEFAULT_SLA_HOURS;

describe('SLA policy (SLA_HOURS_*)', () => {
  it('defaults: high 24 h, medium 72 h, low 168 h', () => {
    assert.deepEqual({ ...DEFAULT_SLA_HOURS }, { high: 24, medium: 72, low: 168 });
    assert.deepEqual(readSlaPolicy({}), { policy: { high: 24, medium: 72, low: 168 }, errors: [] });
    assert.deepEqual(readSlaPolicy({ SLA_HOURS_HIGH: '', SLA_HOURS_MEDIUM: undefined }).policy, { high: 24, medium: 72, low: 168 });
    assert.equal(MAX_SLA_HOURS, 8760);
    assert.equal(DUE_SOON_SHARE, 0.25);
  });

  it('accepts whole hours from 1 to 8760 for each priority', () => {
    const { policy, errors } = readSlaPolicy({ SLA_HOURS_HIGH: '1', SLA_HOURS_MEDIUM: '48', SLA_HOURS_LOW: '8760' });
    assert.deepEqual(errors, []);
    assert.deepEqual(policy, { high: 1, medium: 48, low: 8760 });
    assert.ok(Object.isFrozen(policy));
  });

  it('rejects text, decimals, zero, negatives, infinity, exponents, padding and values over the maximum', () => {
    for (const raw of ['abc', '1.5', '0', '00', '-1', '-24', 'Infinity', 'NaN', '1e3', ' 24', '24 ', '+24', '8761', '99999999999999999999', '0x18']) {
      const { policy, errors } = readSlaPolicy({ SLA_HOURS_MEDIUM: raw });
      assert.deepEqual(errors, ['SLA_HOURS_MEDIUM must be a whole number of hours from 1 to 8760'], JSON.stringify(raw));
      assert.equal(policy.medium, 72, 'falls back to the default (startup is refused anyway)');
    }
  });

  it('reports every invalid variable, and never repeats the value', () => {
    const { errors } = readSlaPolicy({ SLA_HOURS_HIGH: 'secret-ish', SLA_HOURS_LOW: '-5' });
    assert.equal(errors.length, 2);
    assert.ok(errors.every((message) => !message.includes('secret-ish') && !message.includes('-5')));
  });

  it('the server configuration refuses invalid values and shows the active targets at startup', () => {
    const base = { MONGODB_URI: 'mongodb://127.0.0.1:27017/helpdesk_dev', JWT_SECRET: 'k'.repeat(48), CLIENT_URL: 'http://localhost:5173', EMAIL_TRANSPORT: 'disabled' };
    const bad = readEnv({ ...base, SLA_HOURS_HIGH: '0' });
    assert.ok(bad.errors.includes('SLA_HOURS_HIGH must be a whole number of hours from 1 to 8760'));

    const good = readEnv({ ...base, SLA_HOURS_HIGH: '8', SLA_HOURS_LOW: '120' });
    assert.deepEqual(good.errors, []);
    assert.deepEqual(good.env.sla, { high: 8, medium: 72, low: 120 });
    const summary = describeConfig(good.env).join('\n');
    assert.match(summary, /SLA resolution targets: high 8 h, medium 72 h, low 120 h \(calendar hours\)/);
    assert.ok(!summary.includes(base.JWT_SECRET));

    assert.deepEqual(readEnv(base).env.sla, { high: 24, medium: 72, low: 168 }, 'defaults when unset');
  });
});

describe('computeDueAt', () => {
  it('adds the target for each priority to the creation time (calendar hours)', () => {
    assert.equal(computeDueAt(CREATED, 'high', POLICY).toISOString(), '2026-10-02T09:00:00.000Z');
    assert.equal(computeDueAt(CREATED, 'medium', POLICY).toISOString(), '2026-10-04T09:00:00.000Z');
    assert.equal(computeDueAt(CREATED, 'low', POLICY).toISOString(), '2026-10-08T09:00:00.000Z');
  });

  it('counts nights and weekends (no business hours), and accepts an ISO string', () => {
    const friday = '2026-10-02T17:00:00.000Z';
    assert.equal(computeDueAt(friday, 'high', POLICY).toISOString(), '2026-10-03T17:00:00.000Z', 'Saturday');
  });

  it('uses the given policy, and returns a new Date that does not share the input', () => {
    const due = computeDueAt(CREATED, 'high', { high: 2, medium: 3, low: 4 });
    assert.equal(due.getTime(), CREATED.getTime() + 2 * HOUR);
    due.setFullYear(2000);
    assert.equal(CREATED.toISOString(), '2026-10-01T09:00:00.000Z');
  });

  it('throws on an invalid creation time or a priority without a target', () => {
    for (const bad of [null, undefined, '', 'not a date', new Date('invalid'), true]) {
      assert.throws(() => computeDueAt(bad, 'high', POLICY), TypeError, String(bad));
    }
    assert.throws(() => computeDueAt(CREATED, 'urgent', POLICY), TypeError);
    assert.throws(() => computeDueAt(CREATED, 'high', {}), TypeError);
    assert.throws(() => computeDueAt(CREATED, 'high', { high: 0 }), TypeError);
  });
});

describe('slaState', () => {
  const ticket = (overrides = {}) => ({ status: 'open', createdAt: CREATED, dueAt: at(24), resolvedAt: null, ...overrides });

  it('lists the six states', () => {
    assert.deepEqual([...SLA_STATES], ['no_sla', 'due', 'due_soon', 'overdue', 'met', 'missed']);
  });

  it('due while more than 25% of the target is left', () => {
    assert.equal(slaState(ticket(), at(0)), 'due');
    assert.equal(slaState(ticket(), at(17.99)), 'due');
    assert.equal(slaState(ticket({ status: 'in_progress' }), at(10)), 'due');
  });

  it('due soon from exactly 25% left (18 h into a 24 h target) up to and including the deadline', () => {
    assert.equal(slaState(ticket(), at(18) - 1), 'due', 'one millisecond before the 25% mark');
    assert.equal(slaState(ticket(), at(18)), 'due_soon', 'exactly 25% left');
    assert.equal(slaState(ticket(), at(23)), 'due_soon');
    assert.equal(slaState(ticket(), at(24)), 'due_soon', 'at the deadline itself: not yet overdue');
  });

  it('overdue only after the deadline has passed', () => {
    assert.equal(slaState(ticket(), new Date(at(24).getTime() + 1)), 'overdue', 'one millisecond after');
    assert.equal(slaState(ticket({ status: 'in_progress' }), at(100)), 'overdue');
  });

  it('met when resolved on or before the due date, missed when after (the current time does not matter)', () => {
    assert.equal(slaState(ticket({ status: 'resolved', resolvedAt: at(5) }), at(500)), 'met');
    assert.equal(slaState(ticket({ status: 'resolved', resolvedAt: at(24) }), at(500)), 'met', 'exactly at the deadline');
    assert.equal(slaState(ticket({ status: 'resolved', resolvedAt: new Date(at(24).getTime() + 1) }), at(0)), 'missed');
  });

  it('no SLA for a missing, null or invalid due date (tickets from before SLAs)', () => {
    for (const dueAt of [undefined, null, '', 'garbage', new Date('invalid')]) {
      assert.equal(slaState(ticket({ dueAt }), at(1)), 'no_sla', String(dueAt));
      assert.equal(slaState(ticket({ dueAt, status: 'resolved', resolvedAt: at(1) }), at(1)), 'no_sla');
    }
    assert.equal(slaState({}, at(1)), 'no_sla');
    assert.equal(slaState(undefined, at(1)), 'no_sla');
  });

  it('a resolved ticket without a valid resolution time cannot be judged: no SLA', () => {
    for (const resolvedAt of [null, undefined, 'nope', new Date('invalid')]) {
      assert.equal(slaState(ticket({ status: 'resolved', resolvedAt }), at(1)), 'no_sla', String(resolvedAt));
    }
  });

  it('without a valid creation time there is no "due soon": due until overdue', () => {
    for (const createdAt of [null, 'nope', at(30)]) {
      assert.equal(slaState(ticket({ createdAt }), at(23)), 'due', `createdAt ${createdAt}`);
      assert.equal(slaState(ticket({ createdAt }), at(25)), 'overdue');
    }
  });

  it('the target is the ticket\'s own (due − created), e.g. after a priority change', () => {
    const lowTicket = ticket({ dueAt: at(168) });
    assert.equal(slaState(lowTicket, at(125)), 'due', '43 h of 168 left');
    assert.equal(slaState(lowTicket, at(126)), 'due_soon', '42 h = 25% of 168 left');
  });

  it('accepts ISO strings, and rejects an invalid current time', () => {
    assert.equal(slaState({ status: 'open', createdAt: CREATED.toISOString(), dueAt: at(24).toISOString() }, at(20).toISOString()), 'due_soon');
    for (const now of [undefined, null, '', 'later', new Date('invalid')]) {
      assert.throws(() => slaState(ticket(), now), TypeError, String(now));
    }
  });
});

describe('toValidDate', () => {
  it('returns a copy for valid input and null for anything else', () => {
    const date = new Date('2026-10-01T00:00:00Z');
    const copy = toValidDate(date);
    assert.equal(copy.getTime(), date.getTime());
    assert.notEqual(copy, date);
    assert.equal(toValidDate('2026-10-01T00:00:00Z').toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(toValidDate(0).toISOString(), '1970-01-01T00:00:00.000Z', 'a numeric timestamp');
    for (const bad of [null, undefined, '', 'x', true, false, new Date('invalid'), {}]) {
      assert.equal(toValidDate(bad), null, String(bad));
    }
  });
});
