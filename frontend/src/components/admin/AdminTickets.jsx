import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth.js";
import { useApiData } from "../../api/useApiData.js";
import { assignTicket, getTicket, listQueue, nextStatus, ticketErrorMessage, updateTicketStatus } from "../../api/tickets.js";
import { getStats, listAssignableStaff } from "../../api/admin.js";
import { capitalize, formatIsoDate, STATUS_LABELS } from "../staff/staffFormat.js";
import { useDebouncedValue } from "../staff/useDebouncedValue.js";

const PAGE_SIZE = 20;

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
// TICKET DETAILS MODAL
// ========================================

function TicketModal({ ticketId, staff, onClose, onChanged }) {
  const { token, endSessionIfRejected } = useAuth();
  const loadTicket = useCallback((authToken) => getTicket(authToken, ticketId), [ticketId]);
  const { data: ticket, status, error, reload, setData } = useApiData(loadTicket);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Escape closes the dialog.
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(kind, action) {
    if (busy) return;
    setBusy(kind);
    setActionError(null);
    try {
      const updated = await action();
      setData(() => updated);
      onChanged();
    } catch (saveError) {
      if (!endSessionIfRejected(saveError)) {
        setActionError(ticketErrorMessage(saveError, "The change could not be saved. Please try again."));
      }
    } finally {
      setBusy(null);
    }
  }

  const allowedNext = ticket ? nextStatus(ticket.status) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
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
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-700">
              {ticket?.ticketNumber ?? "Ticket"}
            </p>

            <h2
              id="ticket-modal-title"
              className="mt-2 break-words text-xl font-semibold text-emerald-950"
            >
              {ticket?.subject ?? (status === "error" ? "Ticket unavailable" : "Loading…")}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            aria-label="Close ticket details"
          >
            ✕
          </button>
        </div>

        {status === "error" && !ticket && (
          <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
            {ticketErrorMessage(error, "This ticket could not be loaded.")}{" "}
            <button type="button" onClick={reload} className="font-semibold underline">Try again</button>
          </p>
        )}

        {ticket && (
          <>
            {/* CUSTOMER DETAILS */}

            <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-white/70 p-5">
              <div>
                <p className="text-xs text-slate-500">
                  Customer
                </p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {ticket.createdBy?.name}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Created
                </p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {formatIsoDate(ticket.createdAt)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Category
                </p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {ticket.category?.name}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Priority
                </p>

                <div className="mt-1">
                  <Badge
                    value={capitalize(ticket.priority)}
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

              <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-white/70 p-4 text-sm leading-7 text-slate-600">
                {ticket.description}
              </p>
            </div>

            {/* MANAGEMENT CONTROLS */}

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="admin-ticket-assignee" className="mb-2 block text-xs font-semibold text-slate-600">
                  Assign Agent{busy === "assign" && " · saving…"}
                </label>

                <select
                  id="admin-ticket-assignee"
                  value={ticket.assignedTo?.id ?? ""}
                  onChange={(event) =>
                    save("assign", () => assignTicket(token, ticket.id, { assignedTo: event.target.value || null }))
                  }
                  disabled={Boolean(busy) || !staff}
                  style={inputStyle}
                >
                  <option value="">Unassigned</option>
                  {/* Keep the current assignee listed even if they are no longer active. */}
                  {ticket.assignedTo && !staff?.some((member) => member.id === ticket.assignedTo.id) && (
                    <option value={ticket.assignedTo.id}>{ticket.assignedTo.name}</option>
                  )}
                  {staff?.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({capitalize(member.role)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="admin-ticket-status" className="mb-2 block text-xs font-semibold text-slate-600">
                  Ticket Status{busy === "status" && " · saving…"}
                </label>

                <select
                  id="admin-ticket-status"
                  value={ticket.status}
                  onChange={(event) =>
                    event.target.value !== ticket.status &&
                    save("status", () => updateTicketStatus(token, ticket.id, event.target.value))
                  }
                  disabled={Boolean(busy) || !allowedNext}
                  style={inputStyle}
                >
                  {/* Status only moves forward, one step at a time. */}
                  {["open", "in_progress", "resolved"].map((value) => (
                    <option key={value} value={value} disabled={value !== ticket.status && value !== allowedNext}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {actionError && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
                {actionError}
              </p>
            )}
          </>
        )}

        {/* FOOTER */}

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

// All tickets (admins see every ticket). Filters and search run on the server.
export default function AdminTickets({ initialTicketId = null }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState(initialTicketId);

  const query = useDebouncedValue(search.trim(), 300);
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, priorityFilter]);

  const loadTickets = useCallback(
    (token) => listQueue(token, { q: query, status: statusFilter, priority: priorityFilter, page, limit: PAGE_SIZE }),
    [query, statusFilter, priorityFilter, page],
  );
  const list = useApiData(loadTickets);
  const loadStats = useCallback((token) => getStats(token), []);
  const stats = useApiData(loadStats);
  const loadStaff = useCallback((token) => listAssignableStaff(token), []);
  const staff = useApiData(loadStaff);

  const tickets = list.data?.tickets ?? [];
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  const refresh = () => {
    list.reload();
    stats.reload();
  };

  return (
    <div className="space-y-6">

      {/* ========================================
          SUMMARY
      ======================================== */}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Tickets", value: stats.data?.total },
          { label: "Open", value: stats.data?.byStatus.open },
          { label: "In Progress", value: stats.data?.byStatus.in_progress },
          { label: "Resolved", value: stats.data?.byStatus.resolved },
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
              {item.value ?? "—"}
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
            <label htmlFor="admin-ticket-search" className="mb-2 block text-xs font-medium text-slate-600">
              Search Tickets
            </label>

            <input
              id="admin-ticket-search"
              type="search"
              maxLength={100}
              placeholder="Search ticket ID or subject..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="admin-ticket-status-filter" className="mb-2 block text-xs font-medium text-slate-600">
              Status
            </label>

            <select
              id="admin-ticket-status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              style={inputStyle}
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div>
            <label htmlFor="admin-ticket-priority-filter" className="mb-2 block text-xs font-medium text-slate-600">
              Priority
            </label>

            <select
              id="admin-ticket-priority-filter"
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value)
              }
              style={inputStyle}
            >
              <option value="all">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
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
            {list.data ? `${list.data.total} tickets` : "…"}
          </span>
        </div>

        {list.status === "error" && (
          <p role="alert" className="px-5 py-6 text-sm text-red-700">
            {ticketErrorMessage(list.error, "Tickets could not be loaded.")}{" "}
            <button type="button" onClick={list.reload} className="font-semibold underline">Try again</button>
          </p>
        )}

        <div className="overflow-x-auto" aria-busy={list.status === "loading"}>
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
              {tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="border-b border-white/60 transition hover:bg-white/40"
                >
                  {/* TICKET */}

                  <td className="px-5 py-5">
                    <p className="text-xs font-semibold text-emerald-800">
                      {ticket.ticketNumber}
                    </p>

                    <p className="mt-1 max-w-[230px] break-words text-sm font-medium text-emerald-950">
                      {ticket.subject}
                    </p>
                  </td>

                  {/* CUSTOMER */}

                  <td className="px-5 py-5">
                    <p className="text-sm font-medium text-slate-700">
                      {ticket.createdBy?.name}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Opened {formatIsoDate(ticket.createdAt)}
                    </p>
                  </td>

                  {/* CATEGORY */}

                  <td className="px-5 py-5 text-sm text-slate-600">
                    {ticket.category?.name}
                  </td>

                  {/* PRIORITY */}

                  <td className="px-5 py-5">
                    <Badge
                      value={capitalize(ticket.priority)}
                      type="priority"
                    />
                  </td>

                  {/* STATUS */}

                  <td className="px-5 py-5">
                    <Badge
                      value={STATUS_LABELS[ticket.status]}
                      type="status"
                    />
                  </td>

                  {/* ASSIGNEE */}

                  <td className="px-5 py-5">
                    <span className="text-xs text-slate-700">
                      {ticket.assignedTo?.name ?? "Unassigned"}
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

              {list.data && tickets.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-sm text-slate-500"
                  >
                    {query || statusFilter !== "all" || priorityFilter !== "all"
                      ? "No tickets match your search or filters."
                      : "No tickets yet."}
                  </td>
                </tr>
              )}

              {!list.data && list.status === "loading" && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">
                    Loading tickets…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {list.data && totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-white/70 px-5 py-4 text-xs text-slate-600">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={page <= 1}
              className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 font-medium hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Newer
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= totalPages}
              className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 font-medium hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Older →
            </button>
          </div>
        )}
      </div>

      {/* ========================================
          TICKET DETAILS MODAL
      ======================================== */}

      {selectedTicketId && (
        <TicketModal
          ticketId={selectedTicketId}
          staff={staff.data}
          onClose={() => setSelectedTicketId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
