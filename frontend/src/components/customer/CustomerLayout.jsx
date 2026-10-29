import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../../auth/useAuth.js";
import NotificationBell from "../common/NotificationBell.jsx";

const NAV_ITEMS = [
  { to: "/tickets", label: "My tickets", end: true },
  { to: "/tickets/new", label: "New ticket" },
  { to: "/profile", label: "Profile" },
];

function initialsOf(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// Shell for every customer page: background, header with navigation, and the page below.
export default function CustomerLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#c5e6d7] px-3 py-4 sm:px-6 sm:py-6 lg:px-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 50% 0%, rgba(33,165,125,0.40), transparent 45%),
            radial-gradient(ellipse at 0% 100%, rgba(130,190,245,0.55), transparent 55%),
            radial-gradient(ellipse at 100% 100%, rgba(191,208,255,0.65), transparent 55%),
            linear-gradient(145deg, #d4ecdb, #e8f4f3 55%, #dce9fb)
          `,
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center gap-3 rounded-[22px] border border-white/70 bg-white/30 p-2 shadow-[0_4px_20px_rgba(35,83,72,0.05)] backdrop-blur-xl sm:flex-nowrap sm:gap-4 sm:rounded-full">
          <Link
            to="/tickets"
            className="flex shrink-0 items-center gap-2.5 rounded-full px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#172d2a]">
                <span className="h-2 w-2 rounded-[2px] bg-[#c8f5df]" />
              </span>
            </span>
            <span className="whitespace-nowrap text-[16px] font-semibold tracking-[-0.5px] text-[#182d2a]">
              Help Desk
            </span>
          </Link>

          <nav aria-label="Customer navigation" className="order-3 w-full min-w-0 overflow-x-auto sm:order-none sm:flex-1">
            <ul className="flex w-max min-w-full gap-1 sm:justify-center">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `block whitespace-nowrap rounded-full px-4 py-2.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40 ${
                        isActive
                          ? "bg-white text-[#1c2e2c] shadow-[0_3px_12px_rgba(28,55,45,0.10)]"
                          : "text-[#4d625d] hover:bg-white/40 hover:text-[#1c2e2c]"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <NotificationBell buttonClassName="h-10 w-10 rounded-full bg-white/60 text-[#243b35] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40" />
            <span
              aria-hidden="true"
              title={user?.name}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c6f0d9] text-[12px] font-semibold text-[#155d45]"
            >
              {initialsOf(user?.name) || "?"}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full px-3 py-2 text-[13px] font-medium text-[#c45b51] transition hover:bg-[#fff0ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c45b51]/30"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="py-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
