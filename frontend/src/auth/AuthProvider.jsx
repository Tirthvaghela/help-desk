import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../api/client.js';
import { AuthContext } from './useAuth.js';
import {
  clearToken,
  readToken,
  sessionEndedNotice,
  STAFF_ONLY_MESSAGE,
  storeToken,
} from './session.js';

const SIGNED_OUT = { status: 'unauthenticated', user: null, token: null };
const UNAVAILABLE = { status: 'unavailable', user: null, token: null };

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(() =>
    readToken() ? { status: 'loading', user: null, token: null } : SIGNED_OUT,
  );
  const [notice, setNotice] = useState(null);
  // Ignores answers to /me requests that were overtaken by a newer check, login or logout.
  const latestCheck = useRef(0);

  // Confirms the stored token with GET /api/auth/me. The role always comes from the backend.
  const restoreSession = useCallback(async () => {
    const token = readToken();
    const check = ++latestCheck.current;
    if (!token) {
      setSession(SIGNED_OUT);
      return;
    }

    setSession({ status: 'loading', user: null, token: null });
    try {
      const result = await apiRequest('/api/auth/me', { token });
      if (check !== latestCheck.current) return;
      if (!result?.user) {
        // Malformed answer: the session is unknown, not invalid.
        setSession(UNAVAILABLE);
        return;
      }
      setSession({ status: 'authenticated', user: result.user, token });
    } catch (error) {
      if (check !== latestCheck.current) return;
      const ended = sessionEndedNotice(error);
      if (!ended) {
        // Network failure, 5xx or anything unexpected: keep the token and offer a retry.
        setSession(UNAVAILABLE);
        return;
      }
      // The backend rejected the token (expired, invalid or deactivated): forget it.
      clearToken();
      setNotice(ended);
      setSession(SIGNED_OUT);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Signs in with POST /api/auth/login. If `allowedRoles` is given and the backend returns a
  // different role, nothing is stored and the call fails with code ROLE_NOT_ALLOWED.
  const login = useCallback(async (email, password, { allowedRoles } = {}) => {
    const result = await apiRequest('/api/auth/login', { method: 'POST', body: { email, password } });
    if (!result?.token || !result?.user) {
      throw Object.assign(new Error('Unexpected response from the server. Please try again.'), {
        code: 'BAD_RESPONSE',
      });
    }
    if (allowedRoles && !allowedRoles.includes(result.user.role)) {
      throw Object.assign(new Error(STAFF_ONLY_MESSAGE), { code: 'ROLE_NOT_ALLOWED' });
    }

    latestCheck.current += 1;
    if (!storeToken(result.token)) {
      // Without a stored token the session would silently end on reload, so refuse it.
      clearToken();
      setSession(SIGNED_OUT);
      throw Object.assign(
        new Error(
          'Your browser is blocking site storage, so you cannot stay signed in. Allow site data for this site (or leave private browsing) and try again.',
        ),
        { code: 'TOKEN_STORAGE_FAILED' },
      );
    }
    setNotice(null);
    setSession({ status: 'authenticated', user: result.user, token: result.token });
    return result.user;
  }, []);

  // Ends the session in this browser. Tokens are not revoked server-side (contract C-7 is open),
  // so a copied token stays valid until it expires.
  const logout = useCallback(() => {
    latestCheck.current += 1;
    clearToken();
    setNotice(null);
    setSession(SIGNED_OUT);
  }, []);

  const value = useMemo(
    () => ({ ...session, notice, login, logout, restoreSession }),
    [session, notice, login, logout, restoreSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
