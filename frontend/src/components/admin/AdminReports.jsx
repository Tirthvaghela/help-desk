import { useCallback, useState } from "react";
import { useAuth } from "../../auth/useAuth.js";
import { useApiData } from "../../api/useApiData.js";
import { adminErrorMessage, getAnalytics } from "../../api/admin.js";
import { listQueue } from "../../api/tickets.js";
import { buildTicketCsv, ticketsInRange } from "../staff/reportCsv.js";
import { formatIsoDate } from "../staff/staffFormat.js";
import {
  ANALYTICS_PERIODS,
  browserTimeZone,
  CUSTOM_PERIOD,
  customRange,
  describeRange,
  presetRange,
  reportFileName,
} from "../staff/analyticsRange.js";
import AnalyticsPanels, { glassStyle } from "./AnalyticsPanels.jsx";

// Most tickets one export downloads (100 per request).
const EXPORT_MAX_PAGES = 50;

const DEFAULT_PERIOD = "All Time";

const fieldClass = "w-full rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 text-xs font-medium text-emerald-950 outline-emerald-600";

// ========================================
// MAIN COMPONENT
// ========================================

// Report figures come from GET /api/admin/analytics, for tickets created in the selected range.
// The CSV export downloads the same range's tickets from the ticket queue.
export default function AdminReports() {
  const { token, endSessionIfRejected } = useAuth();

  // `period` is what the picker shows; `applied` is what the figures below are for. Choosing
  // Custom changes nothing until valid dates are applied.
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [applied, setApplied] = useState(() => ({ period: DEFAULT_PERIOD, ...presetRange(DEFAULT_PERIOD) }));
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [customError, setCustomError] = useState("");

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const loadAnalytics = useCallback(
    (authToken) => getAnalytics(authToken, { from: applied.from, to: applied.to }),
    [applied],
  );
  const { data, status, error, reload } = useApiData(loadAnalytics);

  const changePeriod = (next) => {
    setPeriod(next);
    setCustomError("");
    if (next !== CUSTOM_PERIOD) setApplied({ period: next, ...presetRange(next) });
  };

  const applyCustomRange = (event) => {
    event.preventDefault();
    const result = customRange(startDay, endDay);
    if (result.error) {
      setCustomError(result.error);
      return;
    }
    setCustomError("");
    setApplied({ period: CUSTOM_PERIOD, ...result.range, startDay, endDay });
  };

  // ========================================
  // EXPORT REPORT
  // ========================================

  async function exportReport() {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const tickets = [];
      for (let page = 1; page <= EXPORT_MAX_PAGES; page += 1) {
        const result = await listQueue(token, { page, limit: 100 });
        tickets.push(...result.tickets);
        // Newest first: stop once tickets are older than the range.
        const reachedOlder = applied.from && result.tickets.some((ticket) => new Date(ticket.createdAt) < applied.from);
        if (reachedOlder || page * 100 >= result.total) break;
      }

      const blob = new Blob(["﻿", buildTicketCsv(ticketsInRange(tickets, applied))], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = reportFileName(applied);

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    } catch (downloadError) {
      if (!endSessionIfRejected(downloadError)) {
        setExportError(adminErrorMessage(downloadError, "The report could not be exported."));
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* DATE RANGE */}
      <div style={{ ...glassStyle, padding: "20px" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-emerald-950">
              Support Performance
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Based on ticket creation date
            </p>
          </div>

          <select
            value={period}
            onChange={(event) => changePeriod(event.target.value)}
            aria-label="Report period"
            className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 text-xs font-medium text-emerald-950 outline-emerald-600"
          >
            {ANALYTICS_PERIODS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        {period === CUSTOM_PERIOD && (
          <form onSubmit={applyCustomRange} noValidate className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="min-w-0 text-xs font-medium text-slate-600">
              Start date
              <input
                type="date"
                value={startDay}
                max={formatIsoDate(new Date())}
                onChange={(event) => setStartDay(event.target.value)}
                className={`mt-1.5 ${fieldClass}`}
              />
            </label>

            <label className="min-w-0 text-xs font-medium text-slate-600">
              End date
              <input
                type="date"
                value={endDay}
                max={formatIsoDate(new Date())}
                onChange={(event) => setEndDay(event.target.value)}
                className={`mt-1.5 ${fieldClass}`}
              />
            </label>

            <button
              type="submit"
              className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
            >
              Apply
            </button>

            {customError && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700 sm:col-span-3">{customError}</p>
            )}

            <p className="text-xs text-slate-500 sm:col-span-3">
              Both dates are included, in your time zone ({browserTimeZone()}).
            </p>
          </form>
        )}

        <p className="mt-4 text-xs font-medium text-emerald-900" data-testid="applied-range">
          Showing: {describeRange(applied)}
        </p>
      </div>

      <AnalyticsPanels status={status} data={data} error={error} onRetry={reload} />

      {/* CSV EXPORT */}
      <div
        style={{ ...glassStyle, padding: "20px" }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-emerald-950">
            Export
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Download the tickets in the selected range as CSV
          </p>
        </div>

        <button
          type="button"
          onClick={exportReport}
          disabled={exporting}
          aria-busy={exporting}
          className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {exportError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{exportError}</p>
      )}
    </div>
  );
}
