import { formatDateTime, STATUS_LABELS } from "./staffFormat.js";
import { formatSlaDuration } from "./slaFormat.js";

// Display data for the Reports page, from GET /api/admin/analytics (contract §11). The numbers
// are only ever read from the response. Three different things are kept apart:
//   FAILED       the request failed, so no figures are known ("—")
//   UNAVAILABLE  the response did not include this figure
//   0            a real zero

export const FAILED = "—";
export const UNAVAILABLE = "Unavailable";

const isCount = (value) => Number.isFinite(value);

// A figure for display: the number, or why there is none.
export function countText(data, value) {
  if (!data) return FAILED;
  return isCount(value) ? value : UNAVAILABLE;
}

// A share as a number with at most one decimal; null when it cannot be worked out.
export function percentOf(count, total) {
  if (!isCount(count) || !isCount(total) || total <= 0) return null;
  return Number(((count / total) * 100).toFixed(1));
}

function barRows(counts, total, definitions) {
  if (!counts || typeof counts !== "object") return null;
  const rows = definitions.map(({ key, label }) => {
    const count = counts[key];
    return { key, label, count: isCount(count) ? count : null, percent: percentOf(count, total) };
  });
  // Only when there is something unexpected to account for.
  if (counts.other > 0) {
    rows.push({ key: "other", label: "Other", count: counts.other, percent: percentOf(counts.other, total) });
  }
  return rows;
}

export function statusRows(data) {
  return barRows(data?.byStatus, data?.overview?.total, [
    { key: "open", label: STATUS_LABELS.open },
    { key: "in_progress", label: STATUS_LABELS.in_progress },
    { key: "resolved", label: STATUS_LABELS.resolved },
  ]);
}

export function priorityRows(data) {
  return barRows(data?.byPriority, data?.overview?.total, [
    { key: "high", label: "High" },
    { key: "medium", label: "Medium" },
    { key: "low", label: "Low" },
  ]);
}

export function categoryRows(data) {
  if (!Array.isArray(data?.byCategory)) return null;
  return data.byCategory.map((row) => {
    const name = row.category?.name ?? "Unknown category";
    return {
      key: row.category?.id ?? "unknown",
      label: row.category?.isActive === false ? `${name} (inactive)` : name,
      count: isCount(row.count) ? row.count : null,
      percent: percentOf(row.count, data.overview?.total),
    };
  });
}

export function assigneeRows(data) {
  if (!Array.isArray(data?.byAssignee)) return null;
  return data.byAssignee.map((row) => ({
    id: row.assignee?.id,
    name: row.assignee?.name ?? "Unknown user",
    assigned: isCount(row.total) ? row.total : UNAVAILABLE,
    resolved: isCount(row.byStatus?.resolved) ? row.byStatus.resolved : UNAVAILABLE,
  }));
}

// { value, note } for the average resolution time.
export function resolutionSummary(data) {
  if (!data) return { value: FAILED, note: null };
  const time = data.resolutionTime;
  if (!time || !isCount(time.eligibleCount)) return { value: UNAVAILABLE, note: null };
  const tickets = (count) => `${count} resolved ${count === 1 ? "ticket" : "tickets"}`;
  const excluded = isCount(time.excludedCount) && time.excludedCount > 0
    ? ` ${tickets(time.excludedCount)} left out: missing or invalid times.`
    : "";
  if (time.eligibleCount === 0 || !isCount(time.averageMilliseconds)) {
    return { value: "No data", note: `No resolved tickets with valid times in this period.${excluded}` };
  }
  return {
    value: formatSlaDuration(time.averageMilliseconds),
    note: `From creation to resolution, across ${tickets(time.eligibleCount)}.${excluded}`,
  };
}

// { value, note } for SLA compliance: null from the API means nothing to measure, not 0%.
export function complianceSummary(data) {
  if (!data) return { value: FAILED, note: null };
  const sla = data.sla;
  if (!sla || !isCount(sla.eligibleResolvedCount)) return { value: UNAVAILABLE, note: null };
  if (sla.compliancePercent === null) {
    return { value: "No data", note: "No resolved tickets with an SLA in this period." };
  }
  if (!isCount(sla.compliancePercent)) return { value: UNAVAILABLE, note: null };
  const count = sla.eligibleResolvedCount;
  return {
    value: `${sla.compliancePercent}%`,
    note: `Met ÷ (Met + Missed), across ${count} resolved ${count === 1 ? "ticket" : "tickets"} with an SLA.`,
  };
}

export function asOfText(data) {
  return data?.asOf ? `Overdue and Due soon as of ${formatDateTime(data.asOf)}` : null;
}
