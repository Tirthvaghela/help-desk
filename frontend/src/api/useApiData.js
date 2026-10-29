import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';

// Loads data with the signed-in user's token: `load(token)` must be stable (useCallback).
// Returns { status: 'loading' | 'ready' | 'error', data, error, reload, setData }.
// If the backend rejects the token, the session is ended and the route guard redirects, so
// the page never shows that error itself.
export function useApiData(load) {
  const { token, endSessionIfRejected } = useAuth();
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    load(token).then(
      (data) => {
        if (active) setState({ status: 'ready', data, error: null });
      },
      (error) => {
        if (!active || endSessionIfRejected(error)) return;
        setState({ status: 'error', data: null, error });
      },
    );
    return () => {
      active = false;
    };
  }, [load, token, attempt, endSessionIfRejected]);

  const reload = useCallback(() => setAttempt((previous) => previous + 1), []);
  // For updating loaded data in place, e.g. adding a comment that was just posted.
  const setData = useCallback(
    (update) => setState((previous) => ({ ...previous, data: update(previous.data) })),
    [],
  );

  return { ...state, reload, setData };
}
