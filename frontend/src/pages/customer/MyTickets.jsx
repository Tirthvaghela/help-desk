import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router";
import { listMyTickets, ticketErrorMessage } from "../../api/tickets.js";
import { useAuth } from "../../auth/useAuth.js";
import { Card, ErrorAlert, formatDate, PriorityBadge, primaryButtonClass, secondaryButtonClass, StatusBadge, SuccessAlert } from "../../components/customer/ui.jsx";
import { useApiData } from "../../api/useApiData.js";

const PAGE_SIZE = 10;
const FILTERS = [
  { status: "all", label: "All" },
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In progress" },
  { status: "resolved", label: "Resolved" },
];

function TicketSkeleton() {
  return (
    <li aria-hidden="true" className="animate-pulse rounded-[18px] border border-white/80 bg-white/60 p-5">
      <div className="h-3 w-20 rounded bg-[#dfe9e3]" />
      <div className="mt-3 h-4 w-2/3 rounded bg-[#dfe9e3]" />
      <div className="mt-3 h-3 w-1/3 rounded bg-[#e8efeb]" />
    </li>
  );
}

// Totals per status, each from GET /api/tickets/my?status=…&limit=1 (the backend counts).
async function loadCounts(token) {
  const results = await Promise.all(
    FILTERS.map((filter) => listMyTickets(token, { status: filter.status, limit: 1 })),
  );
  return Object.fromEntries(FILTERS.map((filter, index) => [filter.status, results[index].total]));
}

// Customer dashboard: the signed-in customer's tickets, newest first, with status filters and
// pages. The backend returns only tickets this customer created.
export default function MyTickets() {
  const { user } = useAuth();
  const location = useLocation();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);

  const loadPage = useCallback(
    (token) => listMyTickets(token, { status: filter, page, limit: PAGE_SIZE }),
    [filter, page],
  );
  const { status, data, error, reload } = useApiData(loadPage);
  const counts = useApiData(loadCounts);
  const [retryingCounts, setRetryingCounts] = useState(false);

  const tickets = data?.tickets;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const created = location.state?.created;
  const firstName = user?.name?.split(/\s+/)[0];
  const hasAnyTicket = counts.data ? counts.data.all > 0 : null;
  // A retry clears the error while it runs; the notice stays up until it has an answer.
  const countsFailed = counts.status === "error" || (retryingCounts && counts.status === "loading" && !counts.data);
  // Without counts the filters still work, as long as there is something to filter.
  const showFilters = hasAnyTicket || (countsFailed && (data?.total > 0 || filter !== "all"));

  const chooseFilter = (next) => {
    setFilter(next);
    setPage(1);
  };

  // Reloads the counts only; the ticket list is loaded separately and keeps what it has.
  const retryCounts = () => {
    if (counts.status === "loading") return;
    setRetryingCounts(true);
    counts.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-1px] text-[#172d2a] sm:text-[32px]">
            {firstName ? `Hi ${firstName}, here are your tickets` : "Your tickets"}
          </h1>
          <p className="mt-1 text-[13px] text-[#5b746c]">Track the status of every request you've raised.</p>
        </div>
        <Link to="/tickets/new" className={primaryButtonClass}>New ticket</Link>
      </div>

      <SuccessAlert>{created && `${created} was created. Our team will reply here.`}</SuccessAlert>

      {countsFailed && (
        <ErrorAlert>
          We couldn't load your ticket counts, so the filter totals are unavailable.{" "}
          <button
            type="button"
            onClick={retryCounts}
            disabled={counts.status === "loading"}
            aria-busy={counts.status === "loading"}
            className="font-semibold underline disabled:opacity-60"
          >
            {counts.status === "loading" ? "Retrying…" : "Retry counts"}
          </button>
        </ErrorAlert>
      )}

      {showFilters && (
        <div role="group" aria-label="Filter tickets by status" className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
          {FILTERS.map((item) => {
            const active = filter === item.status;
            return (
              <button
                key={item.status}
                type="button"
                aria-pressed={active}
                onClick={() => chooseFilter(item.status)}
                className={`rounded-[18px] border p-4 text-left backdrop-blur-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40 ${
                  active ? "border-[#a5d7be] bg-white" : "border-white/80 bg-white/70 hover:bg-white/90"
                }`}
              >
                <span className="block text-[12px] font-medium text-[#5b746c]">{item.label}</span>
                <span className="mt-1 block text-[24px] font-semibold text-[#172d2a]">{counts.data?.[item.status] ?? "—"}</span>
              </button>
            );
          })}
        </div>
      )}

      {status === "loading" && !tickets && (
        <ul className="space-y-3" aria-label="Loading tickets">
          <TicketSkeleton />
          <TicketSkeleton />
          <TicketSkeleton />
        </ul>
      )}

      {status === "error" && (
        <ErrorAlert onRetry={reload}>{ticketErrorMessage(error, "Your tickets could not be loaded.")}</ErrorAlert>
      )}

      {status === "ready" && data.total === 0 && filter === "all" && (
        <Card className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#e1f3e9]">
            <span className="h-4 w-4 rounded-full bg-[#83dcb2]" />
          </div>
          <h2 className="text-[18px] font-semibold text-[#1d302d]">No tickets yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6f857b]">
            When you need help, raise a ticket and our support team will reply here.
          </p>
          <Link to="/tickets/new" className={`${primaryButtonClass} mt-5`}>Raise your first ticket</Link>
        </Card>
      )}

      {status === "ready" && data.total === 0 && filter !== "all" && (
        <Card className="text-center">
          <p className="text-[13px] text-[#6f857b]">No tickets with this status.</p>
        </Card>
      )}

      {tickets?.length > 0 && (
        <ul className="space-y-3" aria-busy={status === "loading"}>
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                to={`/tickets/${ticket.id}`}
                className="block rounded-[18px] border border-white/80 bg-white/75 p-4 shadow-[0_4px_20px_rgba(35,83,72,0.04)] backdrop-blur-xl transition hover:border-[#a5d7be] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[#5b8f78]">{ticket.ticketNumber}</p>
                    <h2 className="mt-1 break-words text-[15px] font-semibold text-[#1d302d]">{ticket.subject}</h2>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-[#6f857b]">
                  {ticket.category?.name && <span>{ticket.category.name}</span>}
                  <PriorityBadge priority={ticket.priority} />
                  <span>Opened {formatDate(ticket.createdAt)}</span>
                  <span>Updated {formatDate(ticket.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && totalPages > 1 && (
        <nav aria-label="Ticket pages" className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((current) => current - 1)}
            disabled={page <= 1 || status === "loading"}
            className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            ← Newer
          </button>
          <span className="text-[12px] text-[#5b746c]">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages || status === "loading"}
            className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Older →
          </button>
        </nav>
      )}
    </div>
  );
}
