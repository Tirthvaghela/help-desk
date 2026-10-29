import { Navigate, useLocation } from 'react-router';
import { useAuth } from './useAuth.js';
import { homePathFor } from './session.js';
import SessionGate from './SessionGate.jsx';

// Renders `children` only for a backend-confirmed customer. Signed-out visitors go to the
// customer sign-in and come back here afterwards; staff go to their own dashboard.
// This only controls what the browser shows; the backend authorizes every API request itself.
export default function CustomerRoute({ children }) {
  return (
    <SessionGate>
      <CustomerOnly>{children}</CustomerOnly>
    </SessionGate>
  );
}

function CustomerOnly({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.role !== 'customer') {
    return <Navigate to={homePathFor(user.role) ?? '/login'} replace />;
  }

  return children;
}
