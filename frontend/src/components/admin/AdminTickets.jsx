import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/useAuth.js";
import { useApiData } from "../../api/useApiData.js";
import {
  addComment,
  assignTicket,
  getTicket,
  listComments,
  listQueue,
  TICKET_LIMITS,
  TICKET_PRIORITIES,
  ticketErrorMessage,
  ticketPermissions,
  updateTicketStatus,
} from "../../api/tickets.js";
import { getStats, listAllCategories, listAssignableStaff } from "../../api/admin.js";
import { validateComment } from "../../pages/customer/validation.js";
import { capitalize, formatDateTime, formatIsoDate, STATUS_LABELS } from "../staff/staffFormat.js";
import { useDebouncedValue } from "../staff/useDebouncedValue.js";
import StatusHistory from "../staff/StatusHistory.jsx";
import SlaBadge from "../staff/SlaBadge.jsx";
import { slaDeadline } from "../staff/slaFormat.js";
import { adminAssigneeParam, categoryParam, filterKey, pagingFor } from "../staff/queueFilters.js";

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
// TICKET CONVERSATION
// ========================================

// Sends one reply. `inFlight` ({ current }) is set before the first await, so a second submit in
// the same moment is ignored, before React has rendered the disabled button. Returns
// { status: "ignored" | "invalid" | "sent" | "failed", ... }.
export async function submitReply({ message, inFlight, send }) {
  if (inFlight.current) return { status: "ignored" };
  const invalid = validateComment(message);
  if (invalid) return { status: "invalid", message: invalid };
  inFlight.current = true;
  try {
    return { status: "sent", comment: await send(message.trim()) };
  } catch (error) {
    return { status: "failed", error };
  } finally {
    inFlight.current = false;
  }
}

// The thread and reply form, from props only. Comments keep the API's order, oldest first (§9).
export function ConversationView({
  status,
  comments,
  error,
  onRetry,
  currentUserId,
  ticketStatus,
  reply,
  onReplyChange,
  onSubmit,
  sending = false,
  fieldError = null,
  sendError = null,
  sent = false,
}) {
  const loading = status === "loading";
  const length = reply.trim().length;
  // Not found and forbidden won't change by retrying; anything else might.
  const permanent = error?.status === 403 || error?.status === 404 || error?.code === "INVALID_ID";

  return (
    <section className="mt-6" aria-labelledby="admin-conversation-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="admin-conversation-heading" className="text-sm font-semibold text-emerald-950">
          Conversation
        </h3>

        {comments && (
          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-white disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      {loading && !comments && (
        <p role="status" className="mt-3 rounded-2xl bg-white/70 p-4 text-sm text-slate-500">
          Loading conversation…
        </p>
      )}

      {status === "error" && (
        <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          {ticketErrorMessage(error, "The conversation could not be loaded.")}{" "}
          {!permanent && (
            <button type="button" onClick={onRetry} className="font-semibold underline">Try again</button>
          )}
        </p>
      )}

      {comments?.length === 0 && (
        <p className="mt-3 rounded-2xl bg-white/70 p-4 text-sm text-slate-500">
          No replies yet.
        </p>
      )}

      {comments?.length > 0 && (
        <ol className="mt-3 space-y-3" aria-busy={loading}>
          {comments.map((comment) => {
            const mine = comment.author?.id === currentUserId;
            return (
              <li key={comment.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`min-w-0 max-w-[90%] rounded-2xl px-4 py-3 ${mine ? "bg-emerald-100 text-emerald-950" : "bg-white/80 text-slate-700"}`}>
                  <p className="text-xs font-semibold">
                    {mine ? "You" : comment.author?.name ?? "Unknown user"}
                    {comment.author?.role && (
                      <span className="font-normal text-slate-500"> · {capitalize(comment.author.role)}</span>
                    )}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{comment.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-4">
        {ticketStatus === "resolved" && (
          <p className="mb-2 text-xs text-slate-500">
            This ticket is resolved. You can still reply, but replying does not reopen it.
          </p>
        )}

        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label htmlFor="admin-ticket-reply" className="text-xs font-semibold text-slate-600">
            Your reply
          </label>
          <span className={`text-xs ${length > TICKET_LIMITS.comment.max ? "text-red-600" : "text-slate-500"}`}>
            {length}/{TICKET_LIMITS.comment.max}
          </span>
        </div>

        <textarea
          id="admin-ticket-reply"
          rows={3}
          value={reply}
          onChange={onReplyChange}
          disabled={sending}
          placeholder="Reply to the customer."
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? "admin-ticket-reply-error" : undefined}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        {fieldError && (
          <p id="admin-ticket-reply-error" className="mt-1 text-xs text-red-600">{fieldError}</p>
        )}

        {sendError && (
          <p role="alert" className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{sendError}</p>
        )}

        {sent && (
          <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">Reply sent.</p>
        )}

        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={sending}
            aria-busy={sending}
            className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {sending ? "Sending…" : "Send reply"}
          </button>
        </div>
      </form>
    </section>
  );
}

// Loads the ticket's comments and posts the admin's replies (contract §9, D-3, D-11).
function TicketConversation({ ticket }) {
  const { token, user, endSessionIfRejected } = useAuth();
  const ticketId = ticket.id;
  const loadComments = useCallback((authToken) => listComments(authToken, ticketId), [ticketId]);
  const { status, data: comments, error, reload, setData } = useApiData(loadComments);

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    setFieldError(null);
    setSendError(null);
    setSent(false);
    setSending(true);

    const result = await submitReply({
      message: reply,
      inFlight,
      send: (message) => addComment(token, ticketId, message),
    });
    setSending(false);

    if (result.status === "invalid") {
      setFieldError(result.message);
    } else if (result.status === "failed") {
      // The typed text stays, so nothing is lost when trying again.
      if (!endSessionIfRejected(result.error)) {
        setSendError(ticketErrorMessage(result.error, "Your reply could not be sent. Please try again."));
      }
    } else if (result.status === "sent") {
      setReply("");
      setSent(true);
      setData((previous) => [...(previous ?? []), result.comment]);
      reload();
    }
  };

  return (
    <ConversationView
      status={status}
      comments={comments}
      error={error}
      onRetry={reload}
      currentUserId={user?.id}
      ticketStatus={ticket.status}
      reply={reply}
      onReplyChange={(event) => {
        setReply(event.target.value);
        setSent(false);
      }}
      onSubmit={handleSubmit}
      sending={sending}
      fieldError={fieldError}
      sendError={sendError}
      sent={sent}
    />
  );
}

// ========================================
// TICKET DETAILS MODAL
// ========================================

// Runs one change to the ticket. `inFlight` ({ current }) is set before the first await, so a second
// change in the same moment is ignored, before React has rendered the disabled controls. Returns
// { status: "ignored" | "saved" | "failed", ... }; `ticket` is the API's updated ticket.
export async function saveTicketChange({ action, inFlight }) {
  if (inFlight.current) return { status: "ignored" };
  inFlight.current = true;
  try {
    return { status: "saved", ticket: await action() };
  } catch (error) {
    return { status: "failed", error };
  } finally {
    inFlight.current = false;
  }
}

// The ticket's priority, as a selector. It follows `priority`, so a failed save shows the saved value.
export function PriorityField({ priority, saving = false, disabled = false, resolved = false, onChange }) {
  return (
    <div>
      <label htmlFor="admin-ticket-priority" className="text-xs text-slate-500">
        Priority{saving && " · saving…"}
      </label>

      <select
        id="admin-ticket-priority"
        value={priority}
        onChange={onChange}
        disabled={disabled}
        aria-busy={saving}
        style={{ ...inputStyle, marginTop: "4px" }}
      >
        {TICKET_PRIORITIES.map((value) => (
          <option key={value} value={value}>{capitalize(value)}</option>
        ))}
      </select>

      {resolved && (
        <p className="mt-1 text-xs text-slate-500">Priority cannot be changed after a ticket is resolved.</p>
      )}
    </div>
  );
}

function TicketModal({ ticketId, staff, onClose, onChanged }) {
  const { token, user, endSessionIfRejected } = useAuth();
  const loadTicket = useCallback((authToken) => getTicket(authToken, ticketId), [ticketId]);
  const { data: ticket, status, error, reload, setData } = useApiData(loadTicket);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [savedNotice, setSavedNotice] = useState(null);
  const inFlight = useRef(false);

  // Escape closes the dialog.
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(kind, action, savedMessage = null) {
    if (inFlight.current) return;
    setBusy(kind);
    setActionError(null);
    setSavedNotice(null);
    const result = await saveTicketChange({ action, inFlight });
    setBusy(null);

    if (result.status === "saved") {
      setData(() => result.ticket);
      setSavedNotice(savedMessage);
      onChanged();
    } else if (result.status === "failed" && !endSessionIfRejected(result.error)) {
      setActionError(ticketErrorMessage(result.error, "The change could not be saved. Please try again."));
    }
  }

  // D-10: status only once assigned; no release while in progress; resolved is final.
  const permissions = ticketPermissions(ticket, user);
  const allowedNext = permissions.nextStatus;

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

              {/* The response carries the new due date, so the SLA details below update with it. */}
              <PriorityField
                priority={ticket.priority}
                saving={busy === "priority"}
                disabled={Boolean(busy) || !permissions.canChangePriority}
                resolved={ticket.status === "resolved"}
                onChange={(event) => {
                  const priority = event.target.value;
                  if (priority !== ticket.priority) {
                    save("priority", () => assignTicket(token, ticket.id, { priority }), "Priority updated.");
                  }
                }}
              />

              <div>
                <p className="text-xs text-slate-500">
                  SLA
                </p>

                <div className="mt-1">
                  <SlaBadge ticket={ticket} />
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Due
                </p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {slaDeadline(ticket) ?? "—"}
                </p>
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
                  disabled={Boolean(busy) || !staff || !permissions.canChangeAssignee}
                  style={inputStyle}
                >
                  {/* An in-progress ticket must be reassigned, not released (D-10). */}
                  <option value="" disabled={!permissions.canUnassign && Boolean(ticket.assignedTo)}>Unassigned</option>
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

            {permissions.statusHint && (
              <p className="mt-3 text-xs text-slate-500">{permissions.statusHint}</p>
            )}

            {actionError && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
                {actionError}
              </p>
            )}

            {savedNotice && (
              <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
                {savedNotice}
              </p>
            )}

            <StatusHistory ticket={ticket} defaultOpen className="mt-6 rounded-2xl bg-white/70 p-4" />

            <TicketConversation key={ticket.id} ticket={ticket} />
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
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [selectedTicketId, setSelectedTicketId] = useState(initialTicketId);

  const loadStats = useCallback((token) => getStats(token), []);
  const stats = useApiData(loadStats);
  const loadStaff = useCallback((token) => listAssignableStaff(token), []);
  const staff = useApiData(loadStaff);
  // Deactivated categories too: their tickets still exist and still filter (D-6).
  const loadCategories = useCallback((token) => listAllCategories(token), []);
  const categories = useApiData(loadCategories);

  const query = useDebouncedValue(search.trim(), 300);
  const category = categoryParam(categoryFilter, categories.data);
  const assignee = adminAssigneeParam(assigneeFilter, staff.data);

  // Back to the first page whenever the filters change.
  const filtersKey = filterKey({ q: query, status: statusFilter, priority: priorityFilter, category, assignee });
  const [storedPaging, setPaging] = useState({ key: filtersKey, page: 1 });
  const paging = pagingFor(storedPaging, filtersKey);
  if (paging !== storedPaging) setPaging(paging);
  const page = paging.page;
  const goToPage = (next) => setPaging({ key: filtersKey, page: next });

  const loadTickets = useCallback(
    (token) =>
      listQueue(token, { q: query, status: statusFilter, priority: priorityFilter, category, assignee, page, limit: PAGE_SIZE }),
    [query, statusFilter, priorityFilter, category, assignee, page],
  );
  const list = useApiData(loadTickets);

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="sm:col-span-2 xl:col-span-1">
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

          <div>
            <label htmlFor="admin-ticket-category-filter" className="mb-2 block text-xs font-medium text-slate-600">
              Category
            </label>

            <select
              id="admin-ticket-category-filter"
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value)
              }
              disabled={categories.status !== "ready"}
              style={inputStyle}
            >
              <option value="all">
                {categories.status === "error" ? "Categories unavailable" : "All Categories"}
              </option>
              {categories.data?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.isActive ? option.name : `${option.name} (inactive)`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="admin-ticket-assignee-filter" className="mb-2 block text-xs font-medium text-slate-600">
              Assignee
            </label>

            <select
              id="admin-ticket-assignee-filter"
              value={assigneeFilter}
              onChange={(event) =>
                setAssigneeFilter(event.target.value)
              }
              style={inputStyle}
            >
              <option value="all">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {staff.status === "error" && (
                <option value="" disabled>Staff list unavailable</option>
              )}
              {staff.data?.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.role === "admin" ? `${member.name} (admin)` : member.name}
                </option>
              ))}
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
                  "Status / SLA",
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

                  {/* STATUS AND SLA */}

                  <td className="px-5 py-5">
                    <div className="flex flex-col items-start gap-1.5">
                      <Badge
                        value={STATUS_LABELS[ticket.status]}
                        type="status"
                      />

                      <SlaBadge ticket={ticket} />
                    </div>
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
                    {query || statusFilter !== "all" || priorityFilter !== "all" || category || assignee
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
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 font-medium hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Newer
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
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
