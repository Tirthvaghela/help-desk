import { ApiError } from './ApiError.js';

// Date query parameters for the admin statistics and analytics endpoints.

// ISO 8601 only: a date (UTC midnight) or a date-time with Z or an offset. `new Date()` alone
// would accept "1" (year 2001), "10/29/2026" in the server's time zone, roll "2026-02-31"
// over to March, turn "T24:00" into the next day, and accept offsets such as "+23:59".
// Every part is therefore range-checked here before `new Date()` does the conversion.
const ISO_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2})))?$/;
// Real UTC offsets run from -12:00 to +14:00.
const MAX_OFFSET_MINUTES = 14 * 60;
const DATE_ONLY_LENGTH = 'YYYY-MM-DD'.length;
const LAST_MS_OF_DAY = 24 * 60 * 60 * 1000 - 1;

export function isValidIsoDate(raw) {
  const match = ISO_DATE_PATTERN.exec(raw);
  if (!match) return false;
  const [year, month, day, hour = 0, minute = 0, second = 0, offsetHours = 0, offsetMinutes = 0] = match
    .slice(1)
    .map((part) => (part === undefined ? undefined : Number(part)));
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  return (
    calendarDay.getUTCFullYear() === year &&
    calendarDay.getUTCMonth() === month - 1 &&
    calendarDay.getUTCDate() === day &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetMinutes <= 59 &&
    offsetHours * 60 + offsetMinutes <= MAX_OFFSET_MINUTES
  );
}

function readBound(query, name) {
  const raw = query[name];
  if (raw === undefined) return null;
  if (typeof raw !== 'string') throw ApiError.badRequest(`${name} must be a single value`);
  if (raw.trim() === '') throw ApiError.badRequest(`${name} must not be blank; leave it out for no limit`);
  if (!isValidIsoDate(raw)) {
    throw ApiError.badRequest(`${name} must be an ISO date, e.g. 2026-10-01 or 2026-10-01T00:00:00Z`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest(`${name} must be an ISO date, e.g. 2026-10-01 or 2026-10-01T00:00:00Z`);
  }
  // A date with no time means the whole UTC day: `from` its first millisecond, `to` its last.
  if (name === 'to' && raw.length === DATE_ONLY_LENGTH) return new Date(date.getTime() + LAST_MS_OF_DAY);
  return date;
}

// { from, to } (Dates, or null for no limit), both inclusive, from a request's query. Strict, so a
// mistake can never quietly widen the range: a blank, repeated or malformed value is refused
// rather than treated as "no limit", as is the key form of a query operator (`from[$gt]=…`,
// which Express's query parser leaves as a separate key, so `from` itself would look absent).
export function parseDateRange(query) {
  for (const key of Object.keys(query)) {
    if (/^(from|to)[[.]/.test(key)) throw ApiError.badRequest(`${key.match(/^\w+/)[0]} must be a single value`);
  }
  const from = readBound(query, 'from');
  const to = readBound(query, 'to');
  if (from && to && to.getTime() < from.getTime()) throw ApiError.badRequest('to must not be earlier than from');
  return { from, to };
}
