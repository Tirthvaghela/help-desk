import { useCallback, useEffect, useState } from "react";
import { useApiData } from "../../api/useApiData.js";
import { getStats, adminErrorMessage } from "../../api/admin.js";
import { initialsOf } from "../staff/staffFormat.js";

// Avatar colours for the workload list, used in turn.
const AVATAR_COLORS = [
  { background: "#d7f2e5", color: "#246b50" },
  { background: "#dcecff", color: "#356a99" },
  { background: "#fce9dd", color: "#a66b42" },
  { background: "#e8e4ff", color: "#7563aa" },
];

// ========================================
// RESPONSIVE GRID
// ========================================

function useViewportWidth() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
}

// ========================================
// CARD STYLE
// ========================================

const glassStyle = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(255,255,255,0.85)",
  borderRadius: "22px",
  boxShadow: "0 8px 28px rgba(35,83,72,0.05)",
  backdropFilter: "blur(18px)",
};

// ========================================
// STAT CARD
// ========================================

function StatCard({ label, value, description }) {
  return (
    <div
      style={{
        ...glassStyle,
        padding: "22px",
        minWidth: 0,
      }}
    >
      <p
        style={{
          fontSize: "13px",
          color: "#647b72",
          fontWeight: 500,
        }}
      >
        {label}
      </p>

      <h3
        style={{
          marginTop: "10px",
          fontSize: "32px",
          fontWeight: 650,
          lineHeight: 1.2,
          color: "#20372e",
        }}
      >
        {value}
      </h3>

      <p
        style={{
          marginTop: "6px",
          fontSize: "12px",
          color: "#84978e",
        }}
      >
        {description}
      </p>
    </div>
  );
}

// ========================================
// PROGRESS ROW
// ========================================

function ProgressRow({ label, value, max, color }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  return (
    <div style={{ marginBottom: "22px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "9px",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "13px", color: "#536b60" }}>
          {label}
        </span>

        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#294637",
          }}
        >
          {value}
        </span>
      </div>

      <div
        style={{
          height: "8px",
          width: "100%",
          background: "#e4ece9",
          borderRadius: "999px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percentage}%`,
            background: color,
            borderRadius: "999px",
          }}
        />
      </div>
    </div>
  );
}

// ========================================
// PANEL HEADER
// ========================================

function PanelHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: "25px" }}>
      <h2
        style={{
          fontSize: "17px",
          fontWeight: 650,
          color: "#20372e",
        }}
      >
        {title}
      </h2>

      <p
        style={{
          marginTop: "6px",
          fontSize: "12px",
          color: "#84978e",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function AdminOverview({ onNavigate }) {
  const viewportWidth = useViewportWidth();

  const statColumns =
    viewportWidth >= 1100
      ? 5
      : viewportWidth >= 650
      ? 2
      : 1;

  const panelColumns =
    viewportWidth >= 1100
      ? 3
      : viewportWidth >= 700
      ? 2
      : 1;

  // Every figure comes from GET /api/admin/stats.
  const loadStats = useCallback((token) => getStats(token), []);
  const { status, data: stats, error, reload } = useApiData(loadStats);

  if (!stats) {
    return (
      <div style={{ ...glassStyle, padding: "22px" }}>
        {status === "error" ? (
          <p role="alert" style={{ fontSize: "13px", color: "#b4423b" }}>
            {adminErrorMessage(error, "Statistics could not be loaded.")}{" "}
            <button type="button" onClick={reload} style={{ fontWeight: 600, textDecoration: "underline" }}>
              Try again
            </button>
          </p>
        ) : (
          <p role="status" style={{ fontSize: "13px", color: "#647b72" }}>
            Loading statistics…
          </p>
        )}
      </div>
    );
  }

  const total = stats.total;
  const open = stats.byStatus.open;
  const inProgress = stats.byStatus.in_progress;
  const resolved = stats.byStatus.resolved;
  const unassigned = stats.unassigned;
  const unresolved = open + inProgress;

  const priorities = ["high", "medium", "low"].map((key) => ({
    name: key[0].toUpperCase() + key.slice(1),
    count: stats.unresolvedByPriority[key],
  }));

  const categories = stats.byCategory.slice(0, 5).map((row) => ({
    name: row.category.name ?? "Unknown category",
    count: row.count,
  }));

  const workload = stats.byAssignee.slice(0, 5).map((row, index) => ({
    ...AVATAR_COLORS[index % AVATAR_COLORS.length],
    name: row.assignee.name ?? "Unknown user",
    initials: initialsOf(row.assignee.name),
    total: row.total,
    open: row.byStatus.open,
    inProgress: row.byStatus.in_progress,
    resolved: row.byStatus.resolved,
  }));

  const linkStyle = {
    marginTop: "auto",
    paddingTop: "20px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#258363",
    cursor: "pointer",
    textAlign: "left",
    background: "none",
    border: "none",
  };

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      {/* FIVE STAT CARDS */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${statColumns}, minmax(0, 1fr))`,
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <StatCard
          label="Total Tickets"
          value={total}
          description="All time"
        />

        <StatCard
          label="Open"
          value={open}
          description="Awaiting response"
        />

        <StatCard
          label="In Progress"
          value={inProgress}
          description="Being handled"
        />

        <StatCard
          label="Resolved"
          value={resolved}
          description="Completed"
        />

        <StatCard
          label="Unassigned"
          value={unassigned}
          description="Needs an agent"
        />
      </section>

      {/* THREE MANAGEMENT PANELS */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${panelColumns}, minmax(0, 1fr))`,
          gap: "18px",
          alignItems: "start",
        }}
      >
        {/* PRIORITIES */}
        <div
          style={{
            ...glassStyle,
            padding: "22px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <PanelHeader
            title="Unresolved by Priority"
            subtitle="Tickets requiring attention"
          />

          {priorities.map((priority) => {
            const colors = {
              High: "#df746f",
              Medium: "#e6ac62",
              Low: "#7aa8d8",
            };

            return (
              <ProgressRow
                key={priority.name}
                label={priority.name}
                value={priority.count}
                max={unresolved}
                color={colors[priority.name]}
              />
            );
          })}

          <button
            type="button"
            onClick={() => onNavigate?.("Tickets")}
            style={linkStyle}
          >
            Manage Tickets →
          </button>
        </div>

        {/* CATEGORIES */}
        <div
          style={{
            ...glassStyle,
            padding: "22px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <PanelHeader
            title="Tickets by Category"
            subtitle="Distribution of support requests"
          />

          {categories.length === 0 && (
            <p style={{ fontSize: "12px", color: "#84978e" }}>No tickets yet.</p>
          )}

          {categories.map((category) => (
            <ProgressRow
              key={category.name}
              label={category.name}
              value={category.count}
              max={total}
              color="#399d79"
            />
          ))}

          <button
            type="button"
            onClick={() => onNavigate?.("Categories")}
            style={linkStyle}
          >
            Manage Categories →
          </button>
        </div>

        {/* AGENT WORKLOAD */}
        <div
          style={{
            ...glassStyle,
            padding: "22px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <PanelHeader
            title="Agent Workload"
            subtitle="Current support assignments"
          />

          {workload.length === 0 && (
            <p style={{ fontSize: "12px", color: "#84978e" }}>No tickets are assigned yet.</p>
          )}

          {workload.map((agent) => (
            <div
              key={agent.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "18px",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    background: agent.background,
                    color: agent.color,
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {agent.initials}
                </span>

                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#294637",
                    }}
                  >
                    {agent.name}
                  </p>

                  <p
                    style={{
                      marginTop: "4px",
                      fontSize: "11px",
                      color: "#84978e",
                    }}
                  >
                    {agent.open} open · {agent.inProgress} in progress
                    {" · "}
                    {agent.resolved} resolved
                  </p>
                </div>
              </div>

              <span
                style={{
                  fontSize: "22px",
                  fontWeight: 600,
                  color: "#294637",
                }}
              >
                {agent.total}
              </span>
            </div>
          ))}

          <button
            type="button"
            onClick={() => onNavigate?.("Users")}
            style={linkStyle}
          >
            Manage Users →
          </button>
        </div>
      </section>
    </div>
  );
}