import { useState } from "react";

// ========================================
// SAMPLE REPORT DATA
// ========================================

const tickets = [
  {
    id: "HD-1042",
    category: "Account",
    priority: "High",
    status: "Open",
    assignee: "Unassigned",
    created: "2026-10-24",
  },
  {
    id: "HD-1041",
    category: "Billing",
    priority: "High",
    status: "In Progress",
    assignee: "Shwetaleena Kundu",
    created: "2026-10-23",
  },
  {
    id: "HD-1040",
    category: "Account",
    priority: "Medium",
    status: "Resolved",
    assignee: "Mimansa Das",
    created: "2026-10-22",
  },
  {
    id: "HD-1039",
    category: "Technical",
    priority: "Medium",
    status: "Open",
    assignee: "Unassigned",
    created: "2026-10-21",
  },
  {
    id: "HD-1038",
    category: "Account",
    priority: "Low",
    status: "In Progress",
    assignee: "Shwetaleena Kundu",
    created: "2026-10-20",
  },
];

const agents = ["Shwetaleena Kundu", "Mimansa Das"];

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

export default function AdminReports() {
  const [period, setPeriod] = useState("All Time");

  // FILTER BY PERIOD
  const filteredTickets = tickets.filter((ticket) => {
    if (period === "All Time") return true;

    const today = new Date();
    const createdDate = new Date(`${ticket.created}T00:00:00`);

    const days =
      (today.getTime() - createdDate.getTime()) /
      (1000 * 60 * 60 * 24);

    if (period === "Last 7 Days") {
      return days >= 0 && days < 7;
    }

    if (period === "Last 30 Days") {
      return days >= 0 && days < 30;
    }

    return true;
  });

  const total = filteredTickets.length;

  const open = filteredTickets.filter(
    (ticket) => ticket.status === "Open"
  ).length;

  const inProgress = filteredTickets.filter(
    (ticket) => ticket.status === "In Progress"
  ).length;

  const resolved = filteredTickets.filter(
    (ticket) => ticket.status === "Resolved"
  ).length;

  const unassigned = filteredTickets.filter(
    (ticket) => ticket.assignee === "Unassigned"
  ).length;

  const resolutionRate =
    total > 0 ? Math.round((resolved / total) * 100) : 0;

  const priorities = ["High", "Medium", "Low"].map((name) => ({
    name,
    count: filteredTickets.filter(
      (ticket) => ticket.priority === name
    ).length,
  }));

  const categories = ["Account", "Billing", "Technical"].map(
    (name) => ({
      name,
      count: filteredTickets.filter(
        (ticket) => ticket.category === name
      ).length,
    })
  );

  const workload = agents.map((name) => {
    const assigned = filteredTickets.filter(
      (ticket) => ticket.assignee === name
    );

    return {
      name,
      assigned: assigned.length,
      resolved: assigned.filter(
        (ticket) => ticket.status === "Resolved"
      ).length,
    };
  });

  // ========================================
  // EXPORT REPORT
  // ========================================

  function exportReport() {
    const headings = [
      "Ticket ID",
      "Category",
      "Priority",
      "Status",
      "Assigned Agent",
      "Created",
    ];

    const rows = filteredTickets.map((ticket) => [
      ticket.id,
      ticket.category,
      ticket.priority,
      ticket.status,
      ticket.assignee,
      ticket.created,
    ]);

    const escapeCSV = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [headings, ...rows]
      .map((row) => row.map(escapeCSV).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
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
            className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
          >
            Export CSV
          </button>
        </div>
      </div>

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
            {workload.map((agent) => (
              <div
                key={agent.name}
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
        Reports currently use sample ticket data. Statistics and CSV
        exports will reflect live support activity after backend
        integration.
      </p>
    </div>
  );
}