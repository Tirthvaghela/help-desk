import { useCallback, useState } from "react";
import { useAuth } from "../../auth/useAuth.js";
import { useApiData } from "../../api/useApiData.js";
import { adminErrorMessage, getStats } from "../../api/admin.js";
import { listQueue } from "../../api/tickets.js";
import { buildTicketCsv, periodStart } from "../staff/reportCsv.js";

// Most tickets one export downloads (100 per request).
const EXPORT_MAX_PAGES = 50;

const glassStyle = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(255,255,255,0.85)",
  borderRadius: "22px",
  boxShadow: "0 8px 28px rgba(35,83,72,0.05)",
  backdropFilter: "blur(18px)",
};

// ========================================
// SUMMARY CARD
// ========================================

function SummaryCard({ title, value, description }) {
  return (
    <div style={{ ...glassStyle, padding: "22px" }}>
      <p className="text-xs font-medium text-slate-500">
        {title}
      </p>

      <h3 className="mt-3 text-3xl font-semibold text-emerald-950">
        {value}
      </h3>

      <p className="mt-2 text-xs text-slate-400">
        {description}
      </p>
    </div>
  );
}

// ========================================
// PROGRESS BAR
// ========================================

function ProgressBar({ label, value, total, color }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-600">
          {label}
        </span>

        <span className="text-sm font-semibold text-emerald-950">
          {value}
        </span>
      </div>

      <div
        style={{
          height: "9px",
          width: "100%",
          background: "#e4ece9",
          borderRadius: "999px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            background: color,
            borderRadius: "999px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

// ========================================
// REPORT PANEL
// ========================================

function ReportPanel({ title, subtitle, children }) {
  return (
    <div
      style={{
        ...glassStyle,
        padding: "24px",
        minWidth: 0,
      }}
    >
      <h2 className="text-base font-semibold text-emerald-950">
        {title}
      </h2>

      <p className="mt-2 mb-7 text-xs text-slate-500">
        {subtitle}
      </p>

      {children}
    </div>
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

// Report figures come from GET /api/admin/stats, limited to the selected period with `from`.
// The CSV export downloads the matching tickets from the ticket queue.
export default function AdminReports() {
  const { token, endSessionIfRejected } = useAuth();
  const [period, setPeriod] = useState("All Time");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const loadStats = useCallback((authToken) => getStats(authToken, { from: periodStart(period) }), [period]);
  const { data: stats, status, error, reload } = useApiData(loadStats);

  const total = stats?.total ?? 0;
  const open = stats?.byStatus.open ?? 0;
  const inProgress = stats?.byStatus.in_progress ?? 0;
  const resolved = stats?.byStatus.resolved ?? 0;
  const unassigned = stats?.unassigned ?? 0;

  const resolutionRate =
    total > 0 ? Math.round((resolved / total) * 100) : 0;

  const priorities = ["high", "medium", "low"].map((key) => ({
    name: key[0].toUpperCase() + key.slice(1),
    count: stats?.byPriority[key] ?? 0,
  }));

  const categories = (stats?.byCategory ?? []).slice(0, 6).map((row) => ({
    name: row.category.name ?? "Unknown category",
    count: row.count,
  }));

  const workload = (stats?.byAssignee ?? []).map((row) => ({
    id: row.assignee.id,
    name: row.assignee.name ?? "Unknown user",
    assigned: row.total,
    resolved: row.byStatus.resolved,
  }));

  // ========================================
  // EXPORT REPORT
  // ========================================

  async function exportReport() {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const from = periodStart(period);
      const tickets = [];
      for (let page = 1; page <= EXPORT_MAX_PAGES; page += 1) {
        const result = await listQueue(token, { page, limit: 100 });
        tickets.push(...result.tickets);
        // Newest first: stop once tickets are older than the period.
        const reachedOlder = from && result.tickets.some((ticket) => new Date(ticket.createdAt) < from);
        if (reachedOlder || page * 100 >= result.total) break;
      }
      const inPeriod = from ? tickets.filter((ticket) => new Date(ticket.createdAt) >= from) : tickets;

      const blob = new Blob(["﻿", buildTicketCsv(inPeriod)], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `helpdesk-report-${period
        .toLowerCase()
        .replaceAll(" ", "-")}.csv`;

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
      {/* REPORT HEADER */}
      <div
        style={{
          ...glassStyle,
          padding: "20px",
        }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <h2 className="text-base font-semibold text-emerald-950">
            Support Performance
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Review ticket activity and team performance
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            aria-label="Report period"
            className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 text-xs font-medium text-emerald-950 outline-emerald-600"
          >
            <option value="All Time">All Time</option>
            <option value="Last 7 Days">Last 7 Days</option>
            <option value="Last 30 Days">Last 30 Days</option>
          </select>

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
      </div>

      {exportError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{exportError}</p>
      )}

      {status === "error" && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
          {adminErrorMessage(error, "Report figures could not be loaded.")}{" "}
          <button type="button" onClick={reload} className="font-semibold underline">Try again</button>
        </p>
      )}

      {status === "loading" && (
        <p role="status" className="px-1 text-xs text-slate-500">Loading report…</p>
      )}

      {/* SUMMARY STATISTICS */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          title="Total Tickets"
          value={total}
          description="Tickets in selected period"
        />

        <SummaryCard
          title="Resolved"
          value={resolved}
          description="Completed requests"
        />

        <SummaryCard
          title="Resolution Rate"
          value={`${resolutionRate}%`}
          description="Resolved out of total tickets"
        />

        <SummaryCard
          title="Unassigned"
          value={unassigned}
          description="Tickets awaiting assignment"
        />
      </div>

      {/* REPORT PANELS */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* TICKET STATUS */}
        <ReportPanel
          title="Ticket Status"
          subtitle="Current distribution of support tickets"
        >
          <ProgressBar
            label="Open"
            value={open}
            total={total}
            color="#7aa8d8"
          />

          <ProgressBar
            label="In Progress"
            value={inProgress}
            total={total}
            color="#e6ac62"
          />

          <ProgressBar
            label="Resolved"
            value={resolved}
            total={total}
            color="#399d79"
          />
        </ReportPanel>

        {/* PRIORITY DISTRIBUTION */}
        <ReportPanel
          title="Priority Distribution"
          subtitle="Tickets grouped by urgency"
        >
          {priorities.map((priority) => {
            const colors = {
              High: "#df746f",
              Medium: "#e6ac62",
              Low: "#7aa8d8",
            };

            return (
              <ProgressBar
                key={priority.name}
                label={priority.name}
                value={priority.count}
                total={total}
                color={colors[priority.name]}
              />
            );
          })}
        </ReportPanel>

        {/* CATEGORY PERFORMANCE */}
        <ReportPanel
          title="Tickets by Category"
          subtitle="Support requests across categories"
        >
          {stats && categories.length === 0 && (
            <p className="text-xs text-slate-500">No tickets in this period.</p>
          )}

          {categories.map((category) => (
            <ProgressBar
              key={category.name}
              label={category.name}
              value={category.count}
              total={total}
              color="#399d79"
            />
          ))}
        </ReportPanel>

        {/* AGENT PERFORMANCE */}
        <ReportPanel
          title="Agent Performance"
          subtitle="Ticket assignments and resolutions"
        >
          <div className="space-y-4">
            {stats && workload.length === 0 && (
              <p className="text-xs text-slate-500">No assigned tickets in this period.</p>
            )}

            {workload.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between gap-4 rounded-2xl bg-white/60 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-emerald-950">
                    {agent.name}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {agent.assigned} assigned tickets
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xl font-semibold text-emerald-950">
                    {agent.resolved}
                  </p>

                  <p className="text-xs text-slate-500">
                    Resolved
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ReportPanel>
      </div>

      {/* FOOTNOTE */}
      <p className="px-1 text-xs leading-relaxed text-slate-500">
        Figures count tickets created in the selected period. &quot;Unassigned&quot; counts
        unresolved tickets with no agent.
      </p>
    </div>
  );
}