import { useMemo, useState } from "react";

// ========================================
// SAMPLE TICKET DATA
// ========================================

const initialTickets = [
  {
    id: "HD-1042",
    subject: "Unable to access my account",
    customer: "Riya Sharma",
    email: "riya@example.com",
    category: "Account",
    priority: "High",
    status: "Open",
    assignee: "Unassigned",
    created: "2026-10-24",
    description:
      "I have been trying to log in to my account, but it keeps showing an error even after resetting my password.",
  },
  {
    id: "HD-1041",
    subject: "Incorrect billing amount",
    customer: "Arjun Patel",
    email: "arjun@example.com",
    category: "Billing",
    priority: "High",
    status: "In Progress",
    assignee: "Shwetaleena Kundu",
    created: "2026-10-23",
    description:
      "The amount charged on my latest invoice is different from the amount shown in my subscription plan.",
  },
  {
    id: "HD-1040",
    subject: "Password reset confirmation",
    customer: "Neha Verma",
    email: "neha@example.com",
    category: "Account",
    priority: "Medium",
    status: "Resolved",
    assignee: "Mimansa Das",
    created: "2026-10-22",
    description:
      "I requested a password reset and wanted confirmation that my account is secure.",
  },
  {
    id: "HD-1039",
    subject: "Application keeps crashing",
    customer: "Kabir Singh",
    email: "kabir@example.com",
    category: "Technical",
    priority: "Medium",
    status: "Open",
    assignee: "Unassigned",
    created: "2026-10-21",
    description:
      "The application closes automatically whenever I try to open the settings page.",
  },
  {
    id: "HD-1038",
    subject: "Update registered email address",
    customer: "Ananya Das",
    email: "ananya@example.com",
    category: "Account",
    priority: "Low",
    status: "In Progress",
    assignee: "Shwetaleena Kundu",
    created: "2026-10-20",
    description:
      "I need to change the email address associated with my account.",
  },
];

const agents = [
  "Unassigned",
  "Shwetaleena Kundu",
  "Mimansa Das",
];

// ========================================
// BADGE COLORS
// ========================================

const statusColors = {
  Open: {
    background: "#e4f1ff",
    color: "#3274a5",
  },
  "In Progress": {
    background: "#fff0d7",
    color: "#aa741d",
  },
  Resolved: {
    background: "#dff4e8",
    color: "#278357",
  },
};

const priorityColors = {
  High: {
    background: "#ffe5e2",
    color: "#b95a51",
  },
  Medium: {
    background: "#fff0d7",
    color: "#a97827",
  },
  Low: {
    background: "#e4f0ff",
    color: "#527fae",
  },
};

// ========================================
// SHARED STYLES
// ========================================

const glassStyle = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(255,255,255,0.85)",
  borderRadius: "22px",
  boxShadow: "0 8px 28px rgba(35,83,72,0.05)",
  backdropFilter: "blur(18px)",
};

const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: "12px",
  border: "1px solid #d9e7df",
  background: "rgba(255,255,255,0.85)",
  color: "#294637",
  fontSize: "13px",
  outlineColor: "#399d79",
};

// ========================================
// BADGE COMPONENT
// ========================================

function Badge({ value, type }) {
  const colors =
    type === "status"
      ? statusColors[value]
      : priorityColors[value];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 11px",
        borderRadius: "999px",
        background: colors?.background || "#eef2ef",
        color: colors?.color || "#52665b",
        fontSize: "11px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function AdminTickets() {
  const [tickets, setTickets] = useState(initialTickets);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  const [selectedTicketId, setSelectedTicketId] = useState(null);

  const selectedTicket = tickets.find(
    (ticket) => ticket.id === selectedTicketId
  );

  // ========================================
  // FILTERING
  // ========================================

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const query = search.toLowerCase().trim();

      const matchesSearch =
        ticket.id.toLowerCase().includes(query) ||
        ticket.subject.toLowerCase().includes(query) ||
        ticket.customer.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "All" ||
        ticket.status === statusFilter;

      const matchesPriority =
        priorityFilter === "All" ||
        ticket.priority === priorityFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority
      );
    });
  }, [tickets, search, statusFilter, priorityFilter]);

  // ========================================
  // UPDATE TICKET
  // ========================================

  function updateTicket(id, field, value) {
    setTickets((previousTickets) =>
      previousTickets.map((ticket) =>
        ticket.id === id
          ? { ...ticket, [field]: value }
          : ticket
      )
    );
  }

  // ========================================
  // TICKET COUNTS
  // ========================================

  const total = tickets.length;

  const open = tickets.filter(
    (ticket) => ticket.status === "Open"
  ).length;

  const inProgress = tickets.filter(
    (ticket) => ticket.status === "In Progress"
  ).length;

  const resolved = tickets.filter(
    (ticket) => ticket.status === "Resolved"
  ).length;

  return (
    <div className="space-y-6">

      {/* ========================================
          SUMMARY
      ======================================== */}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Tickets", value: total },
          { label: "Open", value: open },
          { label: "In Progress", value: inProgress },
          { label: "Resolved", value: resolved },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              ...glassStyle,
              padding: "20px",
            }}
          >
            <p className="text-xs text-slate-500">
              {item.label}
            </p>

            <p className="mt-2 text-2xl font-semibold text-emerald-950">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* ========================================
          SEARCH AND FILTERS
      ======================================== */}

      <div
        style={{
          ...glassStyle,
          padding: "20px",
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-600">
              Search Tickets
            </label>

            <input
              type="text"
              placeholder="Search ID, subject, customer..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-slate-600">
              Status
            </label>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              style={inputStyle}
            >
              <option value="All">All Statuses</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-slate-600">
              Priority
            </label>

            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value)
              }
              style={inputStyle}
            >
              <option value="All">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================
          TICKET TABLE
      ======================================== */}

      <div
        style={{
          ...glassStyle,
          overflow: "hidden",
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/70 px-5 py-5">
          <div>
            <h2 className="text-base font-semibold text-emerald-950">
              All Support Tickets
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Review and manage customer requests
            </p>
          </div>

          <span className="text-xs font-medium text-emerald-800">
            {filteredTickets.length} tickets
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/70 bg-white/40">
                {[
                  "Ticket",
                  "Customer",
                  "Category",
                  "Priority",
                  "Status",
                  "Assigned Agent",
                  "Action",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-5 py-4 text-xs font-semibold text-slate-600"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredTickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="border-b border-white/60 transition hover:bg-white/40"
                >
                  {/* TICKET */}

                  <td className="px-5 py-5">
                    <p className="text-xs font-semibold text-emerald-800">
                      {ticket.id}
                    </p>

                    <p className="mt-1 max-w-[230px] text-sm font-medium text-emerald-950">
                      {ticket.subject}
                    </p>
                  </td>

                  {/* CUSTOMER */}

                  <td className="px-5 py-5">
                    <p className="text-sm font-medium text-slate-700">
                      {ticket.customer}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {ticket.email}
                    </p>
                  </td>

                  {/* CATEGORY */}

                  <td className="px-5 py-5 text-sm text-slate-600">
                    {ticket.category}
                  </td>

                  {/* PRIORITY */}

                  <td className="px-5 py-5">
                    <Badge
                      value={ticket.priority}
                      type="priority"
                    />
                  </td>

                  {/* STATUS */}

                  <td className="px-5 py-5">
                    <Badge
                      value={ticket.status}
                      type="status"
                    />
                  </td>

                  {/* ASSIGNEE */}

                  <td className="px-5 py-5">
                    <span className="text-xs text-slate-700">
                      {ticket.assignee}
                    </span>
                  </td>

                  {/* ACTION */}

                  <td className="px-5 py-5">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTicketId(ticket.id)
                      }
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}

              {filteredTickets.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-sm text-slate-500"
                  >
                    No tickets match your search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================
          TICKET DETAILS MODAL
      ======================================== */}

      {selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedTicketId(null);
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/80 bg-[#f3faf6] p-6 shadow-2xl sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-modal-title"
          >
            {/* MODAL HEADER */}

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-700">
                  {selectedTicket.id}
                </p>

                <h2
                  id="ticket-modal-title"
                  className="mt-2 text-xl font-semibold text-emerald-950"
                >
                  {selectedTicket.subject}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTicketId(null)}
                className="rounded-full bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                aria-label="Close ticket details"
              >
                ✕
              </button>
            </div>

            {/* CUSTOMER DETAILS */}

            <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-white/70 p-5">
              <div>
                <p className="text-xs text-slate-500">
                  Customer
                </p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {selectedTicket.customer}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Created
                </p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {selectedTicket.created}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Category
                </p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {selectedTicket.category}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Priority
                </p>

                <div className="mt-1">
                  <Badge
                    value={selectedTicket.priority}
                    type="priority"
                  />
                </div>
              </div>
            </div>

            {/* DESCRIPTION */}

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-emerald-950">
                Issue Description
              </h3>

              <p className="mt-3 rounded-2xl bg-white/70 p-4 text-sm leading-7 text-slate-600">
                {selectedTicket.description}
              </p>
            </div>

            {/* MANAGEMENT CONTROLS */}

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  Assign Agent
                </label>

                <select
                  value={selectedTicket.assignee}
                  onChange={(event) =>
                    updateTicket(
                      selectedTicket.id,
                      "assignee",
                      event.target.value
                    )
                  }
                  style={inputStyle}
                >
                  {agents.map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  Ticket Status
                </label>

                <select
                  value={selectedTicket.status}
                  onChange={(event) =>
                    updateTicket(
                      selectedTicket.id,
                      "status",
                      event.target.value
                    )
                  }
                  style={inputStyle}
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">
                    In Progress
                  </option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
            </div>

            {/* FOOTER */}

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTicketId(null)}
                className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}