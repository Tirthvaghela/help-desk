import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth.js";
import { useApiData } from "../../api/useApiData.js";
import {
  addComment,
  assignTicket,
  getTicket,
  listCategories,
  listComments,
  listQueue,
  TICKET_LIMITS,
  ticketPermissions,
  ticketErrorMessage,
  updateTicketStatus,
} from "../../api/tickets.js";
import { formatDateTime, formatShortTime, initialsOf, STATUS_LABELS } from "../staff/staffFormat.js";
import { useDebouncedValue } from "../staff/useDebouncedValue.js";
import StatusHistory from "../staff/StatusHistory.jsx";
import SlaBadge from "../staff/SlaBadge.jsx";
import { slaDeadline } from "../staff/slaFormat.js";
import { AGENT_ASSIGNEE_OPTIONS, agentAssigneeParam, categoryParam, filterKey, pagingFor } from "../staff/queueFilters.js";

// ==============================
// STYLES AND LABELS
// ==============================

const statusLabels = STATUS_LABELS;

const statusStyles = {
  open: "bg-[#e4efff] text-[#4b79b2]",
  in_progress: "bg-[#fff0d9] text-[#a77836]",
  resolved: "bg-[#def3e6] text-[#348264]",
};

const priorityStyles = {
  high: "bg-[#ffe7e3] text-[#c45e55]",
  medium: "bg-[#fff0da] text-[#ac7b36]",
  low: "bg-[#e1f4e9] text-[#408267]",
};

const filters = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
];

const PAGE_SIZE = 25;

// ==============================
// SEARCH ICON
// ==============================

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

// ==============================
// TICKET LIST CARD
// ==============================

function TicketItem({ ticket, selected, onClick }) {
  const customer = ticket.createdBy?.name ?? "Customer";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={`w-full rounded-[20px] border p-4 text-left transition-all duration-200 ${
        selected
          ? "border-[#a5d7be] bg-[#e1f4e9] shadow-[0_5px_18px_rgba(45,112,82,0.09)]"
          : "border-white/85 bg-white/65 hover:bg-white/90"
      }`}
    >
      {/* CUSTOMER AVATAR AND NAME */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d7f0e3] text-[12px] font-semibold text-[#307b58]">
          {initialsOf(customer)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-semibold text-[#243e35]">
                {customer}
              </h3>

              <p className="mt-1 text-[11px] text-[#789084]">
                {ticket.ticketNumber}
              </p>
            </div>

            <span className="text-[10px] text-[#8b9d94]">
              {formatShortTime(ticket.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* SUBJECT */}
      <p className="mt-3 text-[13px] font-medium leading-relaxed text-[#354e42]">
        {ticket.subject}
      </p>

      {/* STATUS AND PRIORITY */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
            statusStyles[ticket.status]
          }`}
        >
          {statusLabels[ticket.status]}
        </span>

        <span
          className={`rounded-full px-3 py-1 text-[10px] font-semibold capitalize ${
            priorityStyles[ticket.priority]
          }`}
        >
          {ticket.priority}
        </span>

        <SlaBadge ticket={ticket} size="small" />

        {!ticket.assignedTo && (
          <span className="rounded-full border border-[#dce8e0] bg-white/80 px-3 py-1 text-[10px] font-medium text-[#758b80]">
            Unassigned
          </span>
        )}
      </div>
    </button>
  );
}

// ==============================
// CONVERSATION MESSAGE
// ==============================

function MessageBubble({ message }) {
  const isAgent = message.role !== "customer";

  return (
    <div
      className={`flex ${
        isAgent ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[90%] rounded-[20px] px-4 py-3 sm:max-w-[78%] ${
          isAgent
            ? "rounded-br-md bg-[#d2efdf] text-[#244f3b]"
            : "rounded-bl-md border border-white/85 bg-white/85 text-[#354b41]"
        }`}
      >
        <p className="text-[11px] font-semibold opacity-75">
          {message.sender}
        </p>

        <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
          {message.message}
        </p>

        <p className="mt-2 text-right text-[10px] opacity-55">
          {message.time}
        </p>
      </div>
    </div>
  );
}

// Turns the ticket's description and comments into chat messages, oldest first.
function toMessages(ticket, comments, currentUserId) {
  const opening = {
    id: "description",
    sender: `${ticket.createdBy?.name ?? "Customer"} · original request`,
    role: "customer",
    message: ticket.description,
    time: formatShortTime(ticket.createdAt),
  };
  return [
    opening,
    ...comments.map((comment) => ({
      id: comment.id,
      sender: comment.author?.id === currentUserId ? "You" : comment.author?.name ?? "Unknown",
      role: comment.author?.role ?? "customer",
      message: comment.message,
      time: formatShortTime(comment.createdAt),
    })),
  ];
}

// ==============================
// MAIN AGENT INBOX
// ==============================

// The agent's queue: unassigned tickets and tickets assigned to them (contract OPEN-1).
// Every change is sent to the API, and the screen only changes once the server confirms it.
export default function AgentInbox({ initialTicketId = null }) {
  const { user, token, endSessionIfRejected } = useAuth();

  const [selectedId, setSelectedId] = useState(initialTicketId);

  const [activeFilter, setActiveFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");

  const [busy, setBusy] = useState(null); // "assign" | "priority" | "status" | "reply"
  const [actionError, setActionError] = useState(null);

  const loadCategories = useCallback((authToken) => listCategories(authToken), []);
  const categories = useApiData(loadCategories);

  const query = useDebouncedValue(search.trim(), 300);
  const assignee = agentAssigneeParam(assigneeFilter);
  const category = categoryParam(categoryFilter, categories.data);

  // Back to the first page whenever the filters change.
  const filtersKey = filterKey({ status: activeFilter, priority: priorityFilter, category, assignee, q: query });
  const [storedPaging, setPaging] = useState({ key: filtersKey, page: 1 });
  const paging = pagingFor(storedPaging, filtersKey);
  if (paging !== storedPaging) setPaging(paging);
  const page = paging.page;
  const goToPage = (next) => setPaging({ key: filtersKey, page: next });

  // ==============================
  // LOAD QUEUE, COUNTS AND THE SELECTED TICKET
  // ==============================

  const loadQueue = useCallback(
    (authToken) =>
      listQueue(authToken, {
        status: activeFilter,
        priority: priorityFilter,
        category,
        assignee,
        q: query,
        page,
        limit: PAGE_SIZE,
      }),
    [activeFilter, priorityFilter, category, assignee, query, page],
  );
  const queue = useApiData(loadQueue);

  const loadCounts = useCallback(
    async (authToken) => {
      const results = await Promise.all(
        filters.map((filter) =>
          listQueue(authToken, { status: filter.value, priority: priorityFilter, category, assignee, q: query, limit: 1 }),
        ),
      );
      return Object.fromEntries(filters.map((filter, index) => [filter.value, results[index].total]));
    },
    [priorityFilter, category, assignee, query],
  );
  const counts = useApiData(loadCounts);

  const tickets = queue.data?.tickets ?? [];
  const totalPages = queue.data ? Math.max(1, Math.ceil(queue.data.total / PAGE_SIZE)) : 1;

  // Open the first ticket in the list when nothing is selected yet.
  const firstTicketId = tickets[0]?.id ?? null;
  useEffect(() => {
    if (!selectedId && firstTicketId) setSelectedId(firstTicketId);
  }, [selectedId, firstTicketId]);

  const loadSelected = useCallback(
    async (authToken) => {
      if (!selectedId) return null;
      const [ticket, comments] = await Promise.all([
        getTicket(authToken, selectedId),
        listComments(authToken, selectedId),
      ]);
      return { ticket, comments };
    },
    [selectedId],
  );
  const detail = useApiData(loadSelected);
  const selectedTicket = detail.data?.ticket ?? null;
  const comments = detail.data?.comments ?? [];

  const refreshLists = () => {
    queue.reload();
    counts.reload();
  };

  const selectTicket = (id) => {
    setSelectedId(id);
    setReply("");
    setActionError(null);
  };

  // ==============================
  // SERVER ACTIONS
  // ==============================

  const assignedToMe = selectedTicket?.assignedTo?.id === user?.id;

  async function runAction(kind, action) {
    if (busy || !selectedTicket) return;
    setBusy(kind);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      if (!endSessionIfRejected(error)) {
        setActionError(ticketErrorMessage(error, "The change could not be saved. Please try again."));
      }
    } finally {
      setBusy(null);
    }
  }

  const applyTicket = (ticket) => {
    detail.setData((previous) => ({ ...previous, ticket }));
    refreshLists();
  };

  const handleStatusChange = (event) => {
    const status = event.target.value;
    if (status === selectedTicket.status) return;
    runAction("status", async () => applyTicket(await updateTicketStatus(token, selectedTicket.id, status)));
  };

  const handlePriorityChange = (event) => {
    const priority = event.target.value;
    runAction("priority", async () => applyTicket(await assignTicket(token, selectedTicket.id, { priority })));
  };

  const handleAssigneeChange = (event) => {
    const assignedTo = event.target.value === "me" ? user.id : null;
    runAction("assign", async () => applyTicket(await assignTicket(token, selectedTicket.id, { assignedTo })));
  };

  const handleSendReply = () => {
    const message = reply.trim();
    if (!message || !assignedToMe) return;
    runAction("reply", async () => {
      const comment = await addComment(token, selectedTicket.id, message);
      detail.setData((previous) => ({ ...previous, comments: [...previous.comments, comment] }));
      setReply("");
      refreshLists();
    });
  };

  const replyTooLong = reply.trim().length > TICKET_LIMITS.comment.max;
  // D-10: status only for your own tickets; no release while in progress; resolved is final.
  const permissions = ticketPermissions(selectedTicket, user);
  const allowedNext = permissions.nextStatus;
  const messages = selectedTicket ? toMessages(selectedTicket, comments, user?.id) : [];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 xl:min-h-[650px] xl:grid-cols-[minmax(280px,390px)_minmax(0,1fr)]">

      {/* ==========================
          LEFT — SUPPORT INBOX
      ========================== */}

      <section className="flex min-w-0 flex-col rounded-[20px] border border-white/80 bg-white/40 p-3 shadow-[0_8px_28px_rgba(35,83,72,0.05)] backdrop-blur-xl sm:rounded-[26px] sm:p-5">

        {/* HEADING */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-[#243e35]">
              Support Inbox
            </h2>

            <p className="mt-1 text-[12px] text-[#789084]">
              Unassigned tickets and tickets assigned to you
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-[#477b65]">
            {queue.data ? `${queue.data.total} Tickets` : "…"}
          </span>
        </div>

        {/* SEARCH */}
        <div className="flex items-center gap-3 rounded-[15px] border border-white/85 bg-white/75 px-4 py-3 text-[#789084]">
          <SearchIcon />

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            maxLength={100}
            placeholder="Search ticket ID or subject..."
            aria-label="Search tickets"
            className="w-full min-w-0 bg-transparent text-[13px] text-[#263e35] outline-none placeholder:text-[#9aaba1]"
          />
        </div>

        {/* STATUS FILTERS */}
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={activeFilter === filter.value}
              onClick={() =>
                setActiveFilter(filter.value)
              }
              className={`rounded-full px-3 py-2 text-[11px] font-medium transition ${
                activeFilter === filter.value
                  ? "bg-[#2e8666] text-white shadow-[0_4px_12px_rgba(46,134,102,0.18)]"
                  : "border border-white/80 bg-white/55 text-[#617b6d] hover:bg-white/85"
              }`}
            >
              {filter.label}

              <span className="ml-1 opacity-70">
                {counts.data?.[filter.value] ?? "·"}
              </span>
            </button>
          ))}
        </div>

        {/* ASSIGNMENT FILTER (always within the agent's own scope) */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[12px] font-medium text-[#6d8579]">
            Show
          </span>

          <select
            value={assigneeFilter}
            onChange={(event) =>
              setAssigneeFilter(event.target.value)
            }
            aria-label="Filter by assignment"
            className="rounded-xl border border-white/85 bg-white/75 px-3 py-2 text-[12px] text-[#395c4b] outline-none"
          >
            {AGENT_ASSIGNEE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* PRIORITY FILTER */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[12px] font-medium text-[#6d8579]">
            Priority
          </span>

          <select
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(event.target.value)
            }
            aria-label="Filter by priority"
            className="rounded-xl border border-white/85 bg-white/75 px-3 py-2 text-[12px] text-[#395c4b] outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* CATEGORY FILTER */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[12px] font-medium text-[#6d8579]">
            Category
          </span>

          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value)
            }
            disabled={categories.status !== "ready"}
            aria-label="Filter by category"
            className="min-w-0 max-w-[60%] rounded-xl border border-white/85 bg-white/75 px-3 py-2 text-[12px] text-[#395c4b] outline-none disabled:opacity-60"
          >
            <option value="all">
              {categories.status === "error" ? "Categories unavailable" : "All Categories"}
            </option>
            {categories.data?.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        {/* TICKET LIST */}
        <div
          className="mt-5 max-h-[380px] space-y-3 overflow-y-auto pr-1 sm:max-h-[500px] xl:max-h-[680px]"
          aria-busy={queue.status === "loading"}
        >

          {queue.status === "error" ? (
            <div role="alert" className="rounded-[20px] border border-red-100 bg-red-50/80 px-5 py-8 text-center">
              <p className="text-[13px] font-semibold text-red-700">
                {ticketErrorMessage(queue.error, "The inbox could not be loaded.")}
              </p>
              <button
                type="button"
                onClick={refreshLists}
                className="mt-3 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-red-700 shadow-sm hover:bg-red-100"
              >
                Try again
              </button>
            </div>
          ) : !queue.data ? (
            <p role="status" className="px-2 py-10 text-center text-[13px] text-[#789084]">
              Loading tickets…
            </p>
          ) : tickets.length > 0 ? (
            tickets.map((ticket) => (
              <TicketItem
                key={ticket.id}
                ticket={ticket}
                selected={
                  selectedId === ticket.id
                }
                onClick={() => selectTicket(ticket.id)}
              />
            ))
          ) : (
            <div className="rounded-[20px] border border-white/80 bg-white/60 px-5 py-12 text-center">
              <p className="text-[14px] font-semibold text-[#375b48]">
                No tickets found
              </p>

              <p className="mt-2 text-[12px] text-[#83988a]">
                {query || activeFilter !== "all" || priorityFilter !== "all" || category || assignee
                  ? "Try changing your search or filters."
                  : "New customer tickets will appear here."}
              </p>
            </div>
          )}
        </div>

        {/* PAGES */}
        {queue.data && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-2 text-[11px] text-[#617b6d]">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="rounded-full border border-white/80 bg-white/60 px-3 py-2 font-medium hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Newer
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="rounded-full border border-white/80 bg-white/60 px-3 py-2 font-medium hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Older →
            </button>
          </div>
        )}
      </section>

      {/* ==========================
          RIGHT — CONVERSATION
      ========================== */}

      <section className="flex min-h-[480px] min-w-0 flex-col overflow-hidden rounded-[20px] border border-white/85 bg-white/70 shadow-[0_8px_30px_rgba(35,83,72,0.06)] backdrop-blur-xl sm:min-h-[560px] sm:rounded-[26px] xl:min-h-[620px]">

        {selectedId && detail.status === "error" && !selectedTicket ? (
          <div role="alert" className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-[14px] font-semibold text-red-700">
              {ticketErrorMessage(detail.error, "This ticket could not be loaded.")}
            </p>
            <button
              type="button"
              onClick={detail.reload}
              className="mt-4 rounded-full bg-[#2e8666] px-5 py-2.5 text-[12px] font-semibold text-white hover:bg-[#246d52]"
            >
              Try again
            </button>
          </div>
        ) : selectedId && !selectedTicket ? (
          <p role="status" className="flex flex-1 items-center justify-center text-[13px] text-[#789084]">
            Loading ticket…
          </p>
        ) : selectedTicket ? (
          <>

            {/* TICKET HEADER */}
            <div className="border-b border-[#e3eee7] px-3 py-4 sm:px-6 sm:py-5">

              <div className="flex flex-wrap items-start justify-between gap-3">

                <div className="flex min-w-0 items-start gap-3">

                  {/* CUSTOMER AVATAR */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#d9f0e3] text-[12px] font-bold text-[#307b58]">
                    {initialsOf(selectedTicket.createdBy?.name)}
                  </div>

                  {/* TICKET DETAILS */}
                  <div className="min-w-0">
                    <h2 className="break-words text-[17px] font-semibold tracking-[-0.4px] text-[#203c30] sm:text-[19px]">
                      {selectedTicket.subject}
                    </h2>

                    <p className="mt-1 break-words text-[11px] text-[#728b7e]">
                      {selectedTicket.ticketNumber} ·{" "}
                      {selectedTicket.createdBy?.name}
                    </p>

                    <p className="mt-1 break-words text-[11px] text-[#728b7e]">
                      {selectedTicket.assignedTo
                        ? `Assigned to ${assignedToMe ? "you" : selectedTicket.assignedTo.name}`
                        : "Not assigned yet"}
                    </p>
                  </div>
                </div>

                {/* BADGES */}
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize ${
                      priorityStyles[selectedTicket.priority]
                    }`}
                  >
                    {selectedTicket.priority}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                      statusStyles[selectedTicket.status]
                    }`}
                  >
                    {statusLabels[selectedTicket.status]}
                  </span>

                  <SlaBadge ticket={selectedTicket} />
                </div>
              </div>

              {/* ==========================
                  MANAGEMENT CONTROLS
              ========================== */}

              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#e3eee7] pt-4 sm:grid-cols-3">

                {/* STATUS */}
                <label className="min-w-0 text-[11px] font-semibold text-[#60796e]">
                  Status{busy === "status" && " · saving…"}

                  <select
                    value={selectedTicket.status}
                    onChange={handleStatusChange}
                    disabled={Boolean(busy) || !allowedNext}
                    className="mt-1.5 w-full cursor-pointer rounded-xl border border-white/90 bg-white/75 px-3 py-2.5 text-[12px] font-medium text-[#355647] outline-none transition focus:border-[#83c6a0] focus:ring-2 focus:ring-[#83c6a0]/30 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {/* Status only moves forward, one step at a time. */}
                    {["open", "in_progress", "resolved"].map((status) => (
                      <option
                        key={status}
                        value={status}
                        disabled={status !== selectedTicket.status && status !== allowedNext}
                      >
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>

                {/* PRIORITY */}
                <label className="min-w-0 text-[11px] font-semibold text-[#60796e]">
                  Priority{busy === "priority" && " · saving…"}

                  <select
                    value={selectedTicket.priority}
                    onChange={handlePriorityChange}
                    disabled={Boolean(busy) || !permissions.canChangePriority}
                    className="mt-1.5 w-full cursor-pointer rounded-xl border border-white/90 bg-white/75 px-3 py-2.5 text-[12px] font-medium text-[#355647] outline-none transition focus:border-[#83c6a0] focus:ring-2 focus:ring-[#83c6a0]/30 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>

                {/* ASSIGNEE */}
                <label className="min-w-0 text-[11px] font-semibold text-[#60796e]">
                  Assignee{busy === "assign" && " · saving…"}

                  <select
                    value={
                      assignedToMe ? "me" : "unassigned"
                    }
                    onChange={handleAssigneeChange}
                    disabled={Boolean(busy) || !permissions.canChangeAssignee}
                    className="mt-1.5 w-full cursor-pointer rounded-xl border border-white/90 bg-white/75 px-3 py-2.5 text-[12px] font-medium text-[#355647] outline-none transition focus:border-[#83c6a0] focus:ring-2 focus:ring-[#83c6a0]/30 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {/* An in-progress ticket must keep its assignee (D-10). */}
                    <option value="unassigned" disabled={!permissions.canUnassign && assignedToMe}>
                      Unassigned
                    </option>

                    <option value="me">
                      You (Agent)
                    </option>
                  </select>
                </label>
              </div>

              {/* CATEGORY AND DATE */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#779085]">
                <span>
                  {selectedTicket.category?.name ?? "No category"} · Opened{" "}
                  {formatDateTime(selectedTicket.createdAt)}
                  {slaDeadline(selectedTicket) && ` · Due ${slaDeadline(selectedTicket)}`}
                </span>

                {!selectedTicket.assignedTo && (
                  <span className="rounded-full border border-[#b7dfc8] bg-[#def1e5] px-3 py-1.5 font-medium text-[#347657]">
                    Awaiting assignment
                  </span>
                )}
              </div>

              {permissions.statusHint && (
                <p className="mt-2 text-[11px] text-[#8b9d93]">{permissions.statusHint}</p>
              )}

              <StatusHistory ticket={selectedTicket} className="mt-3" />

              {actionError && (
                <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">
                  {actionError}
                </p>
              )}
            </div>

            {/* ==========================
                CONVERSATION MESSAGES
            ========================== */}

            <div className="flex-1 space-y-4 overflow-y-auto bg-white/20 px-3 py-5 sm:px-6 sm:py-6">

              <div className="mb-5 text-center">
                <span className="rounded-full bg-white/75 px-4 py-1.5 text-[11px] text-[#81988a]">
                  Ticket conversation
                </span>
              </div>

              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                />
              ))}
            </div>

            {/* ==========================
                REPLY COMPOSER
            ========================== */}

            <div className="border-t border-[#e4eee7] bg-white/45 p-3 sm:p-4">

              <div className="rounded-[16px] border border-[#dceae2] bg-white/80 p-2 focus-within:border-[#8ac9a6]">

                <label
                  htmlFor="agent-reply"
                  className="sr-only"
                >
                  Your Reply
                </label>

                <textarea
                  id="agent-reply"
                  rows={2}
                  value={reply}
                  onChange={(event) =>
                    setReply(event.target.value)
                  }
                  disabled={busy === "reply"}
                  placeholder={`Reply to ${
                    (selectedTicket.createdBy?.name ?? "the customer").split(" ")[0]
                  }...`}
                  className="min-h-[68px] w-full resize-y bg-transparent px-2 py-2 text-[13px] text-[#294534] outline-none placeholder:text-[#9aaba1]"
                />

                <div className="flex items-center justify-between gap-3">
                  <span className={`px-2 text-[10px] ${replyTooLong ? "text-red-600" : "text-[#9aaba1]"}`}>
                    {reply.trim().length}/{TICKET_LIMITS.comment.max}
                  </span>
                  <button
                    type="button"
                    onClick={handleSendReply}
                    disabled={
                      !reply.trim() ||
                      replyTooLong ||
                      !assignedToMe ||
                      Boolean(busy)
                    }
                    aria-busy={busy === "reply"}
                    title={
                      !assignedToMe
                        ? "Assign this ticket to yourself before replying"
                        : "Send reply"
                    }
                    className="rounded-full bg-[#2e8666] px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#246d52] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "reply" ? "Sending…" : "Send Reply →"}
                  </button>
                </div>
              </div>

              {!assignedToMe && (
                <p className="mt-2 text-[11px] text-[#8b9d93]">
                  Assign this ticket to yourself to reply.
                </p>
              )}
            </div>
          </>
        ) : (
          /* NO TICKET SELECTED */
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">

            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#e1f3e9] text-[26px]" aria-hidden="true">
              ✉
            </div>

            <h2 className="text-[18px] font-semibold text-[#294a38]">
              Select a ticket
            </h2>

            <p className="mt-2 max-w-xs text-[13px] text-[#82988a]">
              Choose a ticket from the inbox to view
              its details and conversation.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
