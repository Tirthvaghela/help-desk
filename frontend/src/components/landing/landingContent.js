// All copy and sample data for the landing page (design: "Help Desk Landing", 2026-10).
// Ticket names, numbers and figures below are illustrative samples, not live data.
//
// Copy follows the design verbatim, except statements that are not true of the app today.
// Each reworded string is marked "// was: …" so it can be restored once the feature exists.

// Status colours: [background, text, solid dot]
export const STATUS = Object.freeze({
  Open: ["#e3f0ff", "#2556a3", "#2160c4"],
  "In progress": ["#f2dfb0", "#7a4a00", "#d9a020"],
  Resolved: ["#e3f4ea", "#0f6845", "#12855f"],
});

export const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#roles", label: "For your team" },
  { href: "#lifecycle", label: "Ticket lifecycle" },
  { href: "#faq", label: "FAQ" },
];

export const HERO = {
  eyebrow: "Customer support ticketing",
  title: "Every request, one calm thread.",
  // was: "… Admins keep categories and access in order." (category and user management are not built yet)
  text: "Customers open and follow tickets. Agents work a shared inbox. Admins oversee every ticket and the team's workload.",
  primary: "Open a ticket",
  secondary: "See it for agents",
};

export const PREVIEW = {
  inboxCount: "12 open",
  filters: ["Unassigned", "Mine", "All"],
  inbox: [
    { name: "Priya Sharma", initials: "PS", subject: "Invoice PDF won't download", status: "In progress", time: "2m", avatar: ["#e3f0ff", "#2556a3"] },
    { name: "Arjun Nair", initials: "AN", subject: "Can't change shipping address", status: "Open", time: "9m", avatar: ["#fbf3dc", "#7a4a00"] },
    { name: "Meera Joshi", initials: "MJ", subject: "Two-factor code not arriving", status: "Open", time: "24m", avatar: ["#efe9fb", "#5a3fa0"] },
    { name: "Dev Patel", initials: "DP", subject: "Refund for duplicate charge", status: "Resolved", time: "1h", avatar: ["#e3f4ea", "#0f6845"] },
  ],
  ticket: { meta: "HD-1042 · Billing", subject: "Invoice PDF won't download", status: "In progress", priority: "High" },
  customerMessage: "The download button spins and then nothing happens. Tried Chrome and Safari.",
  // was: an "Internal note" bubble — the app has no internal notes; status changes are recorded instead.
  statusEvent: "Status changed to In progress",
  agentMessage: "Fixed on our side. Could you try the download once more?",
  composerPlaceholder: "Write a reply…",
  resolvedCard: {
    title: "HD-1038 resolved",
    // was: "Customer notified" — the app does not send notifications.
    text: "Visible to the customer",
  },
  assignedCard: { label: "Assigned to you", text: "Can't change shipping address on order #8812" },
};

export const STEPS = {
  eyebrow: "How it works",
  title: "From first message to resolved, in three steps.",
  items: [
    { n: "1", title: "Open a ticket", text: "Describe the problem, choose a category and set how urgent it is.", tile: ["#e3f0ff", "#2556a3"] },
    { n: "2", title: "An agent picks it up", text: "The ticket is assigned and the conversation continues in one thread.", tile: ["#f2dfb0", "#7a4a00"] },
    { n: "3", title: "Resolved and recorded", text: "Status updates as it moves. The full history stays on the ticket.", tile: ["#e3f4ea", "#0f6845"] },
  ],
};

export const ROLES = {
  eyebrow: "For your team",
  title: "One product, three views.",
  defaultRole: "Agent",
  tabs: {
    Customer: {
      lead: "Open a ticket, pick a category and priority, and follow every reply in one thread.",
      points: [
        "Raise tickets about billing, orders or your account",
        "See status move from Open to Resolved",
        "Reply in the same thread, no lost emails",
        // was: "Reopen with a reply if the problem returns" — replies do not reopen tickets.
        "Keep replying even after a ticket is resolved",
      ],
      cta: "Open a ticket",
      panelTitle: "My tickets",
      panelMeta: "3 tickets",
      rows: [
        ["HD-1042", "Invoice PDF won't download", "In progress"],
        ["HD-1031", "Update company billing address", "Resolved"],
        ["HD-1017", "Order arrived damaged", "Resolved"],
      ],
    },
    Agent: {
      // was: "A shared inbox with filters, assignment and internal notes, …" — no internal notes.
      lead: "A shared inbox with filters, assignment and status tracking, so the team can split the work without stepping on each other.",
      points: [
        "Filter by unassigned, mine, status and priority",
        "Assign to yourself in one click",
        // was: "Leave internal notes the customer never sees" — no internal notes.
        "See every status change on the ticket",
        "Change status straight from the conversation",
      ],
      cta: "Open the inbox",
      panelTitle: "Assigned to me",
      panelMeta: "4 active",
      rows: [
        ["HD-1042", "Invoice PDF won't download", "In progress"],
        ["HD-1044", "Can't change shipping address", "Open"],
        ["HD-1045", "Two-factor code not arriving", "Open"],
        ["HD-1039", "Refund for duplicate charge", "Resolved"],
      ],
    },
    Admin: {
      // was: "Keep categories tidy, decide who can do what, and see where tickets pile up."
      lead: "See every ticket, assign work across the team, and spot where tickets pile up.",
      points: [
        "Assign any ticket to any agent",
        // was: "Promote customers to agents or admins" — user management is not built yet.
        "See tickets from every customer and agent",
        // was: "Add and remove ticket categories" — category management is not built yet.
        "Filter the queue by category, status and priority",
        // was: "Track volume and resolution time" — stats cover volume by status and category only.
        "Track ticket volume by status and category",
      ],
      cta: "Open the admin view",
      // was: "This week" / "Oct 21–27" with a "Median 6.4h" tile — stats have no time window or durations.
      panelTitle: "All tickets",
      panelMeta: "by status",
      stats: [["Total", "86"], ["Open", "14"], ["Resolved", "61"]],
      rows: [
        ["Billing", "32% of tickets", "Open"],
        ["Technical", "27% of tickets", "In progress"],
        ["Orders", "21% of tickets", "Resolved"],
      ],
    },
  },
};

export const LIFECYCLE = {
  eyebrow: "Ticket lifecycle",
  title: "Everyone sees the same status.",
  // was: "Status changes post into the thread, so …" — they are recorded on the ticket, not posted as messages.
  text: "Every status change is recorded on the ticket, so the customer and the team never wonder where a ticket stands.",
  defaultStage: 1,
  stages: [
    { label: "Open", text: "The customer submits a ticket. It lands in the shared inbox with its category and priority." },
    // was: "… replies in the thread and adds internal notes as needed." — no internal notes.
    { label: "In progress", text: "An agent assigns it and works with the customer in the same thread." },
    // was: "The fix is confirmed. A reply from the customer reopens it automatically." — replies do not reopen tickets.
    { label: "Resolved", text: "The fix is confirmed. The history stays on the ticket, and the customer can still reply." },
  ],
};

export const FAQ = {
  eyebrow: "FAQ",
  title: "Common questions",
  items: [
    {
      q: "Who can create an account?",
      // was: "… Agent and admin roles are granted by an admin from the People page." — no People page yet.
      a: "Anyone can sign up as a customer. Agent and admin accounts are set up by an administrator.",
    },
    {
      // was: "Can customers see internal notes?" — the app has no internal notes.
      q: "Can customers see other customers' tickets?",
      a: "No. Customers only ever see the tickets they opened. Agents and admins see the tickets they're allowed to work on.",
    },
    {
      q: "What happens when a resolved ticket gets a reply?",
      // was: "It moves back to In progress and returns to the assigned agent's queue." — status does not change.
      a: "The reply is added to the thread for the team to see. The ticket keeps its Resolved status.",
    },
    {
      // was: "Can admins change categories later?" — category management is not built yet.
      q: "Who sets a ticket's priority?",
      a: "The customer picks low, medium or high when opening the ticket, and an agent can change it later.",
    },
  ],
};

export const FINAL_CTA = {
  title: "Got a problem? Start the thread.",
  text: "Create a customer account in under a minute. Agents and admins sign in with the account their admin set up.",
  primary: "Create an account",
  secondary: "Sign in",
};
