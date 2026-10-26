import { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function HelpDeskHeader({
  role = "agent",
  activePage = "Overview",
  onNavigate,
}) {
  const navigate = useNavigate();

  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Notifications will be populated after backend integration.
  const [notifications] = useState([]);

  const hasUnreadNotifications = notifications.some(
    (notification) => !notification.isRead
  );

  const isAdmin = role === "admin";

  const menuItems = isAdmin
    ? ["Overview", "Tickets", "Users", "Categories", "Reports"]
    : ["Overview", "Inbox"];

  // ==============================
  // SEARCH
  // ==============================

  const handleSearch = () => {
    setShowProfile(false);
    setShowNotifications(false);

    onNavigate?.(isAdmin ? "Tickets" : "Inbox");
  };

  // ==============================
  // NAVIGATION
  // ==============================

  const handleNavigation = (item) => {
    onNavigate?.(item);

    setShowProfile(false);
    setShowNotifications(false);
  };

  // ==============================
  // SIGN OUT
  // ==============================

  const handleSignOut = () => {
    sessionStorage.removeItem("helpdesk_staff_role");

    setShowProfile(false);
    setShowNotifications(false);

    navigate("/staff/login", { replace: true });
  };

  return (
    <header className="relative z-20 grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4 lg:px-2">

      {/* ==============================
          LOGO
      ============================== */}

      <Link
        to="/"
        className="col-start-1 row-start-1 flex h-[48px] w-fit shrink-0 items-center gap-2 rounded-full border border-white/70 bg-white/20 px-2 pr-3 shadow-[0_4px_20px_rgba(35,83,72,0.04)] backdrop-blur-xl transition hover:bg-white/35 sm:h-[54px] sm:gap-2.5 sm:px-2.5 sm:pr-5"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm sm:h-9 sm:w-9">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#172d2a]">
            <span className="h-2 w-2 rounded-[2px] bg-[#c8f5df]" />
          </span>
        </span>

        <span className="whitespace-nowrap text-[14px] font-semibold tracking-[-0.5px] text-[#182d2a] sm:text-[16px]">
          Help Desk
        </span>
      </Link>

      {/* ==============================
          CENTER NAVIGATION
      ============================== */}

      <nav
        aria-label={`${isAdmin ? "Admin" : "Agent"} navigation`}
        className="col-span-2 col-start-1 row-start-2 w-full min-w-0 overflow-x-auto rounded-full border border-white/60 bg-white/20 p-1.5 shadow-[0_5px_25px_rgba(35,83,72,0.04)] backdrop-blur-xl lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:max-w-full lg:w-auto"
      >
        {/* Inner wrapper keeps first item visible when scrolling */}
        <div className="flex w-max min-w-full items-center justify-start gap-1 sm:justify-center">
          {menuItems.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleNavigation(item)}
              aria-current={activePage === item ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2.5 text-[12px] font-medium transition-all duration-200 sm:px-5 sm:text-[13px] ${
                activePage === item
                  ? "bg-white text-[#1c2e2c] shadow-[0_3px_12px_rgba(28,55,45,0.10)]"
                  : "text-[#4d625d] hover:bg-white/30 hover:text-[#1c2e2c]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>

      {/* ==============================
          RIGHT ACTIONS
      ============================== */}

      <div className="relative col-start-2 row-start-1 flex shrink-0 items-center justify-self-end gap-1 rounded-full border border-white/70 bg-white/15 p-1 shadow-[0_4px_20px_rgba(35,83,72,0.04)] backdrop-blur-xl sm:p-1.5 lg:col-start-3">

        {/* SEARCH */}

        <button
          type="button"
          aria-label="Search tickets"
          title="Search tickets"
          onClick={handleSearch}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-white/10 text-[#243b35] transition hover:bg-white/60 sm:h-10 sm:w-10"
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 4.5 4.5" />
          </svg>
        </button>

        {/* ==============================
            NOTIFICATIONS
        ============================== */}

        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            aria-expanded={showNotifications}
            onClick={() => {
              setShowNotifications((previous) => !previous);
              setShowProfile(false);
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-white/10 text-[#243b35] transition hover:bg-white/60 sm:h-10 sm:w-10"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>

            {hasUnreadNotifications && (
              <span className="absolute right-[8px] top-[6px] h-[6px] w-[6px] rounded-full bg-[#e46c6c] ring-2 ring-[#d6f0e3] sm:right-[9px] sm:top-[7px]" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-[-52px] top-12 z-50 w-[min(280px,calc(100vw-48px))] rounded-[20px] border border-white/80 bg-white/95 p-5 shadow-xl backdrop-blur-xl sm:right-0 sm:top-14 sm:w-72">
              <h3 className="text-sm font-semibold text-[#1c302b]">
                Notifications
              </h3>

              {notifications.length === 0 ? (
                <p className="mt-2 text-sm text-[#687c75]">
                  You're all caught up. No new notifications.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="rounded-xl bg-[#edf7f1] p-3"
                    >
                      <p className="text-[12px] text-[#355747]">
                        {notification.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ==============================
            PROFILE
        ============================== */}

        <div className="relative">
          <button
            type="button"
            aria-label="Open profile"
            aria-expanded={showProfile}
            onClick={() => {
              setShowProfile((previous) => !previous);
              setShowNotifications(false);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-[#c6f0d9] text-[12px] font-semibold text-[#155d45] transition hover:bg-[#b2e9cc] sm:h-11 sm:w-11 sm:text-[13px]"
          >
            {isAdmin ? "AM" : "SK"}
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 z-50 w-[min(256px,calc(100vw-48px))] rounded-[20px] border border-white/80 bg-white/95 p-5 shadow-xl backdrop-blur-xl sm:top-14 sm:w-64">
              <p className="font-semibold text-[#1c302b]">
                {isAdmin ? "Aarohi Mehta" : "Shwetaleena Kundu"}
              </p>

              <p className="mt-1 text-xs text-[#687c75]">
                {isAdmin
                  ? "aarohi@helpdesk.team"
                  : "Agent · Support Team"}
              </p>

              <span className="mt-3 inline-block rounded-full bg-[#e2f5e9] px-3 py-1 text-xs font-semibold text-[#17694c]">
                {isAdmin ? "Admin" : "Agent"}
              </span>

              <div className="my-4 border-t border-slate-100" />

              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-[#c45b51] transition hover:bg-[#fff0ed]"
              >
                Sign Out →
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}