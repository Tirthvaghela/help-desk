import { Navigate } from 'react-router';
import { useAuth } from './useAuth.js';
import { homePathFor } from './session.js';
import SessionGate from './SessionGate.jsx';

// Renders `children` only for a backend-confirmed user with `role`.
// This only controls what the browser shows; the backend authorizes every API request itself.
export default function StaffRoute({ role, children }) {
  return (
    <SessionGate>
      <StaffOnly role={role}>{children}</StaffOnly>
    </SessionGate>
  );
}

function StaffOnly({ role, children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/staff/login" replace />;
  }

  // `role` is one role ("agent") or several (["agent", "admin"]).
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(user.role)) {
    // Users with another role go to their own area (staff dashboard or customer portal).
    return <Navigate to={homePathFor(user.role) ?? '/staff/login'} replace />;
  }

  return children;
}
