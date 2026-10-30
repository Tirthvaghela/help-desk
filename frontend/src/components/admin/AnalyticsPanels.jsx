import { adminErrorMessage } from "../../api/admin.js";
import {
  asOfText,
  assigneeRows,
  categoryRows,
  complianceSummary,
  countText,
  FAILED,
  priorityRows,
  resolutionSummary,
  statusRows,
  UNAVAILABLE,
} from "../staff/analyticsFormat.js";

export const glassStyle = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(255,255,255,0.85)",
  borderRadius: "22px",
  boxShadow: "0 8px 28px rgba(35,83,72,0.05)",
  backdropFilter: "blur(18px)",
};

const NO_TICKETS = "No tickets in this period.";

// ========================================
// SUMMARY CARD
// ========================================

function SummaryCard({ title, value, description }) {
  return (
    <div style={{ ...glassStyle, padding: "22px", minWidth: 0 }}>
      <p className="text-xs font-medium text-slate-500">
        {title}
      </p>

      <h3 className="mt-3 break-words text-2xl font-semibold text-emerald-950 sm:text-3xl">
        {value}
      </h3>

      <p className="mt-2 text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}

// ========================================
// BAR ROW
// ========================================

// One colour for every bar: each row's text says what it is, so colour identifies nothing here.
function BarRow({ row }) {
  const { label, count, percent } = row;
  const figure = count === null ? UNAVAILABLE : percent === null ? String(count) : `${count} · ${percent}%`;

  return (
    <div className="mb-5 last:mb-0" title={`${label}: ${figure}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <span className="min-w-0 break-words text-sm font-medium text-slate-600">
          {label}
        </span>

        <span className="shrink-0 text-sm font-semibold text-emerald-950">
          {figure}
        </span>
      </div>

      <div
        aria-hidden="true"
        style={{ height: "9px", width: "100%", background: "#e4ece9", borderRadius: "999px", overflow: "hidden" }}
      >
        <div
          style={{
            width: `${percent ?? 0}%`,
            height: "100%",
            background: "#399d79",
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
    <section style={{ ...glassStyle, padding: "24px", minWidth: 0 }} aria-label={title}>
      <h2 className="text-base font-semibold text-emerald-950">
        {title}
      </h2>

      <p className="mt-2 mb-6 text-xs text-slate-500">
        {subtitle}
      </p>

      {children}
    </section>
  );
}

function PanelNote({ children }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

// Bars, or why there are none: the request failed, the figure is missing, or no tickets.
function Distribution({ data, rows }) {
  if (!data) return <PanelNote>{FAILED}</PanelNote>;
  if (!rows) return <PanelNote>{UNAVAILABLE}</PanelNote>;
  if (data.overview?.total === 0) return <PanelNote>{NO_TICKETS}</PanelNote>;
  return rows.map((row) => <BarRow key={row.key} row={row} />);
}

// ========================================
// SLA
// ========================================

function SlaTile({ label, value, color }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/60 p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        {label}
      </p>

      <p className="mt-2 break-words text-2xl font-semibold text-emerald-950">
        {value}
      </p>
    </div>
  );
}

function SlaGroup({ title, note, columns, children }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold text-slate-600">
        {title}
      </h3>

      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}

      <div className={`mt-3 grid gap-3 ${columns}`}>
        {children}
      </div>
    </div>
  );
}

function SlaPerformance({ data }) {
  const sla = data?.sla;
  const compliance = complianceSummary(data);
  const value = (key) => countText(data, sla?.[key]);

  return (
    <ReportPanel
      title="SLA Performance"
      subtitle="Resolved outcomes and current risk are separate groups: an overdue ticket is not counted as missed"
    >
      <div className="mb-6 rounded-2xl bg-white/60 p-5">
        <p className="text-xs font-medium text-slate-500">SLA compliance</p>
        <p className="mt-2 text-3xl font-semibold text-emerald-950">{compliance.value}</p>
        {compliance.note && <p className="mt-2 text-xs text-slate-500">{compliance.note}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr_1fr]">
        <SlaGroup title="Resolved tickets" columns="grid-cols-2">
          <SlaTile label="Met" value={value("met")} color="#1f6b4c" />
          <SlaTile label="Missed" value={value("missed")} color="#a32f27" />
        </SlaGroup>

        <SlaGroup title="Unresolved tickets" note={asOfText(data)} columns="grid-cols-2 sm:grid-cols-3">
          <SlaTile label="Due" value={value("due")} color="#2f5f94" />
          <SlaTile label="Due soon" value={value("dueSoon")} color="#855510" />
          <SlaTile label="Overdue" value={value("overdue")} color="#a32f27" />
        </SlaGroup>

        <SlaGroup title="No SLA" columns="grid-cols-1">
          <SlaTile label="No due date" value={value("noSla")} color="#55675e" />
        </SlaGroup>
      </div>
    </ReportPanel>
  );
}

// ========================================
// AGENT PERFORMANCE
// ========================================

function AgentPerformance({ data }) {
  const agents = assigneeRows(data);

  return (
    <ReportPanel
      title="Agent Performance"
      subtitle="Ticket assignments and resolutions"
    >
      {!data ? (
        <PanelNote>{FAILED}</PanelNote>
      ) : !agents ? (
        <PanelNote>{UNAVAILABLE}</PanelNote>
      ) : agents.length === 0 ? (
        <PanelNote>No assigned tickets in this period.</PanelNote>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between gap-4 rounded-2xl bg-white/60 p-4"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-emerald-950">
                  {agent.name}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {agent.assigned} assigned tickets
                </p>
              </div>

              <div className="shrink-0 text-right">
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
      )}
    </ReportPanel>
  );
}

// ========================================
// ALL PANELS
// ========================================

// The Reports figures in their states: first load, refresh (old figures dimmed and marked busy),
// failure (a retry, and "—" rather than zeros), missing figures and real empty results.
export default function AnalyticsPanels({ status, data, error, onRetry }) {
  if (!data && status === "loading") {
    return (
      <p role="status" className="px-1 text-xs text-slate-500">Loading analytics…</p>
    );
  }

  const refreshing = Boolean(data) && status === "loading";
  const resolution = resolutionSummary(data);
  const overview = data?.overview;
  const counts = data?.byStatus;

  return (
    <div className="space-y-6">
      {status === "error" && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
          {adminErrorMessage(error, "Analytics could not be loaded.")}{" "}
          <button type="button" onClick={onRetry} className="font-semibold underline">Try again</button>
        </p>
      )}

      {refreshing && (
        <p role="status" className="px-1 text-xs text-slate-500">Updating figures…</p>
      )}

      <div
        aria-busy={refreshing}
        className={`space-y-6 transition-opacity ${refreshing ? "opacity-50" : ""}`}
      >
        {/* OVERVIEW */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <SummaryCard title="Total Tickets" value={countText(data, overview?.total)} description="Created in this period" />
          <SummaryCard title="Open" value={countText(data, counts?.open)} description="Current status" />
          <SummaryCard title="In Progress" value={countText(data, counts?.in_progress)} description="Current status" />
          <SummaryCard title="Resolved" value={countText(data, counts?.resolved)} description="Current status" />
          <SummaryCard title="Unassigned" value={countText(data, overview?.unassigned)} description="Unresolved, no agent" />
        </div>

        {/* DISTRIBUTIONS */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ReportPanel title="Tickets by Status" subtitle="Current status of the tickets in this period">
            <Distribution data={data} rows={statusRows(data)} />
          </ReportPanel>

          <ReportPanel title="Tickets by Priority" subtitle="Current priority of the tickets in this period">
            <Distribution data={data} rows={priorityRows(data)} />
          </ReportPanel>
        </div>

        <ReportPanel title="Tickets by Category" subtitle="Most tickets first">
          <Distribution data={data} rows={categoryRows(data)} />
        </ReportPanel>

        {/* RESOLUTION TIME */}
        <ReportPanel title="Average Resolution Time" subtitle="Time from a ticket's creation to its resolution">
          <p className="text-3xl font-semibold text-emerald-950">{resolution.value}</p>
          {resolution.note && <p className="mt-2 text-xs text-slate-500">{resolution.note}</p>}
        </ReportPanel>

        <SlaPerformance data={data} />

        <AgentPerformance data={data} />
      </div>
    </div>
  );
}
