const stats = [
  {
    label: "Assigned to Me",
    value: "03",
    color: "text-[#207a59]",
    iconBg: "bg-[#d8f3e4]",
    iconColor: "text-[#23845f]",
    icon: "assigned",
  },
  {
    label: "Open Tickets",
    value: "02",
    color: "text-[#467eae]",
    iconBg: "bg-[#e0edff]",
    iconColor: "text-[#5389bf]",
    icon: "open",
  },
  {
    label: "In Progress",
    value: "01",
    color: "text-[#ad7c39]",
    iconBg: "bg-[#fff0d9]",
    iconColor: "text-[#b98945]",
    icon: "progress",
  },
  {
    label: "Resolved",
    value: "01",
    color: "text-[#8269b1]",
    iconBg: "bg-[#ede6ff]",
    iconColor: "text-[#876db6]",
    icon: "resolved",
  },
];

const myTickets = [
  {
    id: "HD-104",
    subject: "Unable to reset password",
    customer: "Asha Customer",
    priority: "Medium",
    status: "In Progress",
  },
  {
    id: "HD-105",
    subject: "Payment confirmation not received",
    customer: "Riya Sharma",
    priority: "High",
    status: "Open",
  },
  {
    id: "HD-106",
    subject: "Account details need updating",
    customer: "Arjun Patel",
    priority: "Low",
    status: "Resolved",
  },
];

const unassignedTickets = [
  {
    id: "HD-107",
    subject: "Unable to access dashboard",
    customer: "Neha Singh",
    priority: "High",
  },
  {
    id: "HD-108",
    subject: "Invoice download issue",
    customer: "Kabir Mehta",
    priority: "Medium",
  },
];

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
    >
      {iconPaths[type]}
    </svg>
  );
}

function TicketCard({ ticket, unassigned = false }) {
  return (
    <article className="group rounded-[20px] border border-white/90 bg-white/75 p-4 shadow-[0_3px_15px_rgba(35,75,65,0.035)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/95 hover:shadow-[0_8px_25px_rgba(35,75,65,0.09)] sm:p-5">

      {/* TICKET NUMBER AND PRIORITY */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold tracking-[0.4px] text-[#668579]">
          {ticket.id}
        </span>

        <span
          className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
            priorityStyles[ticket.priority]
          }`}
        >
          {ticket.priority} Priority
        </span>
      </div>

      {/* TICKET DETAILS */}
      <h3 className="mt-3 text-[14px] font-semibold leading-relaxed text-[#233e35]">
        {ticket.subject}
      </h3>

      <p className="mt-1 text-[12px] text-[#81958c]">
        Requested by {ticket.customer}
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
              disabled
              title="Assignment will be available after API integration"
              className="cursor-not-allowed rounded-full border border-[#b6dec8] bg-[#d5eee0] px-4 py-2 text-[11px] font-semibold text-[#277253] opacity-80"
            >
              Assign to Me
            </button>
          </>
        ) : (
          <>
            <span
              className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${
                statusStyles[ticket.status]
              }`}
            >
              {ticket.status}
            </span>

            <span className="text-[12px] font-semibold text-[#287b5d] transition group-hover:translate-x-1">
              View Details →
            </span>
          </>
        )}
      </div>
    </article>
  );
}

export default function AgentOverview() {
  return (
    <div className="space-y-6">

      {/* STATISTICS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
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
                {stat.value}
              </h2>

              <p className="mt-2 text-[11px] text-[#91a39a]">
                Current ticket count
              </p>
            </div>
          </div>
        ))}
      </div>

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
              {myTickets.length} Tickets
            </span>
          </div>

          <div className="space-y-3">
            {myTickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
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
              {unassignedTickets.length} Tickets
            </span>
          </div>

          <div className="space-y-3">
            {unassignedTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                unassigned
              />
            ))}
          </div>
        </section>
      </div>

      {/* DEMO DATA NOTE */}
      <p className="text-center text-[11px] text-[#718a80]">
        Preview data · Live tickets will appear after backend integration.
      </p>
    </div>
  );
}