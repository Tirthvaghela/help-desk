import { formatDateTime, formatIsoDate, toDate } from "./staffFormat.js";
import { periodStart } from "./reportCsv.js";

// The date range of the Reports page. Every figure is for tickets created in the range.

export const CUSTOM_PERIOD = "Custom";
export const ANALYTICS_PERIODS = Object.freeze(["Last 7 Days", "Last 30 Days", "Last 90 Days", "All Time", CUSTOM_PERIOD]);

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// A rolling period: from N×24 hours ago, up to now (no end). All Time has neither bound.
export function presetRange(period, now = new Date()) {
  return { from: periodStart(period, now), to: null };
}

// The local Date for "YYYY-MM-DD" at the given time, or null if that day does not exist.
function localTime(day, hours, minutes, seconds, ms) {
  const match = DAY_PATTERN.exec(day ?? "");
  if (!match) return null;
  const [year, month, date] = match.slice(1).map(Number);
  const result = new Date(year, month - 1, date, hours, minutes, seconds, ms);
  const sameDay = result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === date;
  return sameDay ? result : null;
}

// Both days are included, whole, in the browser's time zone: the start of the first and the last
// millisecond of the second. Returns { range: { from, to } } or { error }. A blank day is an
// error, never "no limit".
export function customRange(startDay, endDay, now = new Date()) {
  if (!startDay || !endDay) return { error: "Choose both a start date and an end date." };
  const from = localTime(startDay, 0, 0, 0, 0);
  const to = localTime(endDay, 23, 59, 59, 999);
  if (!from || !to) return { error: "Enter valid dates." };
  const today = formatIsoDate(now);
  if (startDay > today || endDay > today) return { error: "Dates cannot be in the future." };
  if (endDay < startDay) return { error: "The end date cannot be before the start date." };
  return { range: { from, to } };
}

function formatDay(date) {
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

// What the page says is selected, e.g. "Last 7 Days, since Oct 23, 2026 · 06:40 PM".
export function describeRange({ period, from, to }) {
  const start = toDate(from);
  const end = toDate(to);
  if (period === CUSTOM_PERIOD && start && end) {
    return start.toDateString() === end.toDateString()
      ? formatDay(start)
      : `${formatDay(start)} to ${formatDay(end)}`;
  }
  return start ? `${period}, since ${formatDateTime(start)}` : period;
}

// The browser's time zone, for showing which days a custom range covers.
export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "your time zone";
}

// "helpdesk-report-last-7-days.csv", or the days of a custom range.
export function reportFileName({ period, startDay, endDay }) {
  const name = period === CUSTOM_PERIOD ? `${startDay}-to-${endDay}` : period.toLowerCase().replaceAll(" ", "-");
  return `helpdesk-report-${name}.csv`;
}
