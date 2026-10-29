import { useAuth } from "../../auth/useAuth.js";
import { homePathFor } from "../../auth/session.js";

const NEW_TICKET = { from: "/tickets/new" };

// Where the landing page's links lead, based on who is signed in. The protected routes still
// do their own checks; this only picks the most useful starting point.
//   signed out: the existing sign-in/sign-up pages, returning to the new-ticket form afterwards
//   customer:   straight into the portal
//   staff:      their dashboard (customer actions do not apply)
// While a stored session is being checked, the signed-out links are shown. They still work,
// because the sign-in pages redirect anyone already signed in.
// Each link is { to, state?, label? }; a label overrides the design's default text.
export function useLandingLinks() {
  const { status, user } = useAuth();
  const role = status === "authenticated" ? user?.role : null;

  if (role === "customer") {
    const newTicket = { to: "/tickets/new" };
    return {
      headerSecondary: { to: "/tickets", label: "My tickets" },
      headerPrimary: { ...newTicket, label: "Open a ticket" },
      openTicket: newTicket,
      staffArea: { to: "/staff/login" },
      finalPrimary: { ...newTicket, label: "Open a ticket" },
      finalSecondary: { to: "/tickets", label: "My tickets" },
      footerSignIn: { to: "/tickets", label: "My tickets" },
    };
  }

  const dashboard = role ? homePathFor(role) : null;
  if (dashboard) {
    const toDashboard = { to: dashboard, label: "Open dashboard" };
    return {
      headerSecondary: null,
      headerPrimary: toDashboard,
      openTicket: toDashboard,
      staffArea: { to: dashboard },
      finalPrimary: toDashboard,
      finalSecondary: null,
      footerSignIn: { to: dashboard, label: "Dashboard" },
    };
  }

  return {
    headerSecondary: { to: "/login" },
    headerPrimary: { to: "/signup", state: NEW_TICKET },
    openTicket: { to: "/login", state: NEW_TICKET },
    staffArea: { to: "/staff/login" },
    finalPrimary: { to: "/signup", state: NEW_TICKET },
    finalSecondary: { to: "/login" },
    footerSignIn: { to: "/login" },
  };
}
