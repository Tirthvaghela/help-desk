import { useAuth } from './useAuth.js';

// Shown full-screen while the session is checked, so a protected page never renders before the
// backend has confirmed who the user is.
function SessionScreen({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef4f0] px-4 text-center text-[13px] text-[#40584e]">
      <div role="status" className="space-y-3">{children}</div>
    </div>
  );
}

// Renders `children` once the session check has finished (signed in or not). While it is
// loading, or the server could not answer, shows a holding screen instead.
export default function SessionGate({ children }) {
  const { status, restoreSession } = useAuth();

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
          className="rounded-[11px] bg-[#168461] px-4 py-2 font-semibold text-white transition hover:bg-[#106c4e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40"
        >
          Try again
        </button>
      </SessionScreen>
    );
  }

  return children;
}
