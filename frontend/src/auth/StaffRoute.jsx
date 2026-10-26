import { Navigate } from 'react-router';
import { useAuth } from './useAuth.js';
import { dashboardPathFor } from './session.js';

// Shown full-screen while the session is checked, so a dashboard never renders before the
// backend has confirmed who the user is.
function SessionScreen({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef4f0] px-4 text-center text-[13px] text-[#40584e]">
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// Renders `children` only for a backend-confirmed user with `role`.
// This only controls what the browser shows; the backend authorizes every API request itself.
export default function StaffRoute({ role, children }) {
  const { status, user, restoreSession } = useAuth();

  if (status === 'loading') {
    return <SessionScreen>Checking your session…</SessionScreen>;
  }

  if (status === 'unavailable') {
    return (
      <SessionScreen>
        <p>We couldn't check your session. The server may be unavailable.</p>
        <button
          type="button"
          onClick={restoreSession}
          className="rounded-[11px] bg-[#168461] px-4 py-2 font-semibold text-white transition hover:bg-[#106c4e]"
        >
          Try again
        </button>
      </SessionScreen>
    );
  }

  if (!user) {
    return <Navigate to="/staff/login" replace />;
  }

  if (user.role !== role) {
    // Staff with another role go to their own dashboard; anyone else back to the login page.
    return <Navigate to={dashboardPathFor(user.role) ?? '/staff/login'} replace />;
  }

  return children;
}
