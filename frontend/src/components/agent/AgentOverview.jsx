import { useCallback, useState } from "react";
import { useAuth } from "../../auth/useAuth.js";
import { useApiData } from "../../api/useApiData.js";
import { assignTicket, listQueue, ticketErrorMessage } from "../../api/tickets.js";
import { capitalize, STATUS_LABELS } from "../staff/staffFormat.js";

const priorityStyles = {
  High: "bg-[#ffe4e0] text-[#c45b51]",
  Medium: "bg-[#fff0d7] text-[#a8752d]",
  Low: "bg-[#dcf3e5] text-[#398264]",
};

const statusStyles = {
  Open: "bg-[#e1edff] text-[#4879b4]",
  "In Progress": "bg-[#fff0d7] text-[#a8752d]",
  Resolved: "bg-[#dcf3e5] text-[#398264]",
};

const STAT_CARDS = [
  { key: "assigned", label: "Assigned to Me", color: "text-[#207a59]", iconBg: "bg-[#d8f3e4]", iconColor: "text-[#23845f]", icon: "assigned" },
  { key: "open", label: "Open Tickets", color: "text-[#467eae]", iconBg: "bg-[#e0edff]", iconColor: "text-[#5389bf]", icon: "open" },
  { key: "in_progress", label: "In Progress", color: "text-[#ad7c39]", iconBg: "bg-[#fff0d9]", iconColor: "text-[#b98945]", icon: "progress" },
  { key: "resolved", label: "Resolved", color: "text-[#8269b1]", iconBg: "bg-[#ede6ff]", iconColor: "text-[#876db6]", icon: "resolved" },
];

const PANEL_SIZE = 5;

function StatIcon({ type }) {
  const iconPaths = {
    assigned: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5h6M9 10h6M9 14h4" />
      </>
    ),
    open: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="M4 10h16M9 14h6" />
      </>
    ),
    progress: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    resolved: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };

  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[type]}
    </svg>
  );
}

function TicketCard({ ticket, unassigned = false, onOpen, onClaim, claiming }) {
  const priority = capitalize(ticket.priority);
  const status = STATUS_LABELS[ticket.status];

  return (
    <article className="group rounded-[20px] border border-white/90 bg-white/75 p-4 shadow-[0_3px_15px_rgba(35,75,65,0.035)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/95 hover:shadow-[0_8px_25px_rgba(35,75,65,0.09)] sm:p-5">

      {/* TICKET NUMBER AND PRIORITY */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold tracking-[0.4px] text-[#668579]">
          {ticket.ticketNumber}
        </span>

        <span
          className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
            priorityStyles[priority]
          }`}
        >
          {priority} Priority
        </span>
      </div>

      {/* TICKET DETAILS */}
      <h3 className="mt-3 text-[14px] font-semibold leading-relaxed text-[#233e35]">
        {ticket.subject}
      </h3>

      <p className="mt-1 text-[12px] text-[#81958c]">
        Requested by {ticket.createdBy?.name ?? "a customer"}
      </p>

      {/* BOTTOM ACTIONS */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e7eee9] pt-4">

        {unassigned ? (
          <>
            <span className="flex items-center gap-2 text-[11px] text-[#8b9e94]">
              <span className="h-2 w-2 rounded-full bg-[#e8b45d]" />
              Awaiting assignment
            </span>

            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              aria-busy={claiming}
              className="rounded-full border border-[#b6dec8] bg-[#d5eee0] px-4 py-2 text-[11px] font-semibold text-[#277253] transition hover:bg-[#c4e8d4] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {claiming ? "Assigning…" : "Assign to Me"}
            </button>
          </>
        ) : (
          <>
            <span
              className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${
                statusStyles[status]
              }`}
            >
              {status}
            </span>

            <button
              type="button"
              onClick={onOpen}
              className="text-[12px] font-semibold text-[#287b5d] transition group-hover:translate-x-1"
            >
              View Details →
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function PanelState({ state, emptyText, onRetry }) {
  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-[20px] bg-red-50/80 px-4 py-6 text-center text-[12px] text-red-700">
        {ticketErrorMessage(state.error, "These tickets could not be loaded.")}
        <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">
          Try again
        </button>
      </div>
    );
  }
  if (!state.data) {
    return <p role="status" className="py-6 text-center text-[12px] text-[#81958c]">Loading…</p>;
  }
  if (state.data.tickets.length === 0) {
    return <p className="rounded-[20px] bg-white/50 px-4 py-6 text-center text-[12px] text-[#81958c]">{emptyText}</p>;
  }
  return null;
}

// Agent overview: counts and the most recent tickets from the agent's queue (unassigned and
// assigned to them). "Assign to Me" claims a ticket through the API.
export default function AgentOverview({ onOpenTicket }) {
  const { user, token, endSessionIfRejected } = useAuth();
  const [claimingId, setClaimingId] = useState(null);
  const [claimError, setClaimError] = useState(null);

  const loadStats = useCallback(async (authToken) => {
    const [assigned, open, inProgress, resolved] = await Promise.all([
      listQueue(authToken, { assignee: "me", limit: 1 }),
      listQueue(authToken, { status: "open", limit: 1 }),
      listQueue(authToken, { status: "in_progress", limit: 1 }),
      listQueue(authToken, { status: "resolved", limit: 1 }),
    ]);
    return { assigned: assigned.total, open: open.total, in_progress: inProgress.total, resolved: resolved.total };
  }, []);
  const stats = useApiData(loadStats);

  const loadMine = useCallback((authToken) => listQueue(authToken, { assignee: "me", limit: PANEL_SIZE }), []);
  const mine = useApiData(loadMine);

  const loadUnassigned = useCallback(
    (authToken) => listQueue(authToken, { assignee: "unassigned", status: "open", limit: PANEL_SIZE }),
    [],
  );
  const unassigned = useApiData(loadUnassigned);

  const reloadAll = () => {
    stats.reload();
    mine.reload();
    unassigned.reload();
  };

  async function claim(ticket) {
    if (claimingId) return;
    setClaimingId(ticket.id);
    setClaimError(null);
    try {
      await assignTicket(token, ticket.id, { assignedTo: user.id });
      reloadAll();
    } catch (error) {
      if (!endSessionIfRejected(error)) {
        setClaimError(ticketErrorMessage(error, "The ticket could not be assigned. Please try again."));
        unassigned.reload();
      }
    } finally {
      setClaimingId(null);
    }
  }

  const format = (value) => (value === undefined ? "—" : String(value).padStart(2, "0"));

  return (
    <div className="space-y-6">

      {/* STATISTICS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[23px] border border-white/85 bg-white/65 p-5 shadow-[0_6px_22px_rgba(35,83,72,0.045)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/85 hover:shadow-[0_12px_30px_rgba(35,83,72,0.08)]"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="pt-1 text-[13px] font-medium text-[#627b70]">
                {stat.label}
              </p>

              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] ${stat.iconBg} ${stat.iconColor}`}
              >
                <StatIcon type={stat.icon} />
              </span>
            </div>

            <div className="mt-3">
              <h2
                className={`text-[36px] font-semibold leading-none tracking-[-1.5px] ${stat.color}`}
              >
                {format(stats.data?.[stat.key])}
              </h2>

              <p className="mt-2 text-[11px] text-[#91a39a]">
                {stat.key === "assigned" ? "Assigned to you" : "In your queue"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {stats.status === "error" && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[12px] text-red-700">
          {ticketErrorMessage(stats.error, "Ticket counts could not be loaded.")}{" "}
          <button type="button" onClick={stats.reload} className="font-semibold underline">Try again</button>
        </p>
      )}

      {claimError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[12px] text-red-700">{claimError}</p>
      )}

      {/* TICKET PANELS */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* MY TICKETS */}
        <section className="rounded-[26px] border border-white/80 bg-white/40 p-5 shadow-[0_8px_30px_rgba(35,83,72,0.045)] backdrop-blur-xl sm:p-6">

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-[#243e35]">
                My Tickets
              </h2>

              <p className="mt-1 text-[12px] text-[#748d81]">
                Support requests assigned to you
              </p>
            </div>

            <span className="rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-[#477b65]">
              {mine.data ? `${mine.data.total} Tickets` : "…"}
            </span>
          </div>

          <div className="space-y-3">
            <PanelState state={mine} emptyText="No tickets are assigned to you yet." onRetry={mine.reload} />
            {mine.data?.tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} onOpen={() => onOpenTicket?.(ticket.id)} />
            ))}
          </div>
        </section>

        {/* UNASSIGNED TICKETS */}
        <section className="rounded-[26px] border border-white/80 bg-white/40 p-5 shadow-[0_8px_30px_rgba(35,83,72,0.045)] backdrop-blur-xl sm:p-6">

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-[#243e35]">
                Unassigned Tickets
              </h2>

              <p className="mt-1 text-[12px] text-[#748d81]">
                Requests waiting for an agent
              </p>
            </div>

            <span className="rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-[#477b65]">
              {unassigned.data ? `${unassigned.data.total} Tickets` : "…"}
            </span>
          </div>

          <div className="space-y-3">
            <PanelState state={unassigned} emptyText="No open tickets are waiting for an agent." onRetry={unassigned.reload} />
            {unassigned.data?.tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                unassigned
                claiming={claimingId === ticket.id}
                onClaim={() => claim(ticket)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
