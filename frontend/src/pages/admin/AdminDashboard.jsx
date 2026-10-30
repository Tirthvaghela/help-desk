import { useSearchParams } from "react-router";
import { pageFromSearch, sameSearch, searchForPage } from "../../components/staff/dashboardUrl.js";
import HelpDeskHeader from "../../components/common/helpdeskheader.jsx";
import AdminOverview from "../../components/admin/AdminOverview.jsx";
import AdminTickets from "../../components/admin/AdminTickets.jsx";
import AdminUsers from "../../components/admin/AdminUsers.jsx";
import AdminCategories from "../../components/admin/AdminCategories.jsx";
import AdminReports from "../../components/admin/AdminReports.jsx";

const PAGES = ["Overview", "Tickets", "Users", "Categories", "Reports"];
const URL_OPTIONS = { ticketPage: "Tickets" };

export default function AdminDashboard() {
  // The page lives in the address (?page=Users), so refresh and Back/Forward keep it.
  // ?ticket=… (e.g. from a notification) opens that ticket's details on the Tickets page.
  const [searchParams, setSearchParams] = useSearchParams();
  const activePage = pageFromSearch(searchParams, PAGES, URL_OPTIONS);
  const openTicketId = activePage === "Tickets" ? searchParams.get("ticket") : null;

  // One history entry per page change; choosing the current page again adds none.
  const setActivePage = (page) => {
    const next = searchForPage(searchParams, page, PAGES, URL_OPTIONS);
    if (!sameSearch(next, searchParams)) setSearchParams(next);
  };

  const pageDescriptions = {
    Overview:
      "Monitor support activity, ticket performance, and overall team operations.",
    Tickets:
      "Review, assign, and manage support tickets across your team.",
    Users:
      "Manage customers, support agents, and administrative access.",
    Categories:
      "Organize support requests with clear ticket categories.",
    Reports:
      "Track support performance and identify opportunities to improve.",
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#b9dfd0] px-3 py-4 sm:px-5 sm:py-6 lg:px-8">

      {/* BACKGROUND */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 53% 2%, rgba(0,157,115,0.85) 0%, transparent 39%),
            radial-gradient(ellipse at 8% 5%, rgba(188,224,171,0.85) 0%, transparent 43%),
            radial-gradient(ellipse at 95% 15%, rgba(171,220,187,0.85) 0%, transparent 45%),
            radial-gradient(ellipse at 8% 92%, rgba(121,210,251,0.75) 0%, transparent 50%),
            radial-gradient(ellipse at 95% 100%, rgba(180,199,255,0.80) 0%, transparent 55%),
            linear-gradient(145deg,#b8dec4 0%,#b5e6d8 48%,#d5e4fb 100%)
          `,
        }}
      />

      {/* OUTER GLASS CONTAINER */}
      <div className="relative z-10 mx-auto w-full max-w-[1600px] rounded-3xl border border-white/60 bg-white/20 p-4 shadow-xl backdrop-blur-xl sm:p-5 lg:p-6">

        {/* SHARED HEADER */}
        <HelpDeskHeader
          role="admin"
          activePage={activePage}
          onNavigate={setActivePage}
        />

        {/* MAIN CONTENT */}
        <main className="mt-5 w-full min-w-0 rounded-3xl border border-white/70 bg-white/30 p-5 shadow-lg backdrop-blur-xl sm:p-6 lg:p-7">

          {/* PAGE HEADING */}
          <div className="mb-7">
            <h1 className="text-3xl font-semibold tracking-tight text-emerald-950">
              {activePage}
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              {pageDescriptions[activePage]}
            </p>
          </div>

          {/* ========================================
              ADMIN OVERVIEW
          ======================================== */}
          {activePage === "Overview" && (
            <AdminOverview onNavigate={setActivePage} />
          )}

          {/* ========================================
              ADMIN TICKETS
          ======================================== */}
          {activePage === "Tickets" && (
            <AdminTickets key={openTicketId ?? "tickets"} initialTicketId={openTicketId} />
          )}

          {/* ========================================
              ADMIN USERS
          ======================================== */}
          {activePage === "Users" && <AdminUsers />}

          {/* ========================================
              ADMIN CATEGORIES
          ======================================== */}
          {activePage === "Categories" && <AdminCategories />}

          {/* ========================================
              ADMIN REPORTS
          ======================================== */}
          {activePage === "Reports" && <AdminReports />}

        </main>
      </div>
    </div>
  );
}