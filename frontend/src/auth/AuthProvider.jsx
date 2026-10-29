import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, requestTokenOf } from '../api/client.js';
import { AuthContext } from './useAuth.js';
import {
  clearToken,
  readToken,
  sessionEndedNotice,
  sessionRejection,
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

  // Starts a session from a { user, token } login or register response. If `allowedRoles` is
  // given and the backend returned a different role, nothing is stored and the call fails
  // with code ROLE_NOT_ALLOWED (each sign-in page shows its own message for it).
  const startSession = useCallback((result, allowedRoles) => {
    if (!result?.token || !result?.user) {
      throw Object.assign(new Error('Unexpected response from the server. Please try again.'), {
        code: 'BAD_RESPONSE',
      });
    }
    if (allowedRoles && !allowedRoles.includes(result.user.role)) {
      throw Object.assign(new Error('This account cannot sign in here.'), { code: 'ROLE_NOT_ALLOWED' });
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

  // Signs in with POST /api/auth/login.
  const login = useCallback(
    async (email, password, { allowedRoles } = {}) => {
      const result = await apiRequest('/api/auth/login', { method: 'POST', body: { email, password } });
      return startSession(result, allowedRoles);
    },
    [startSession],
  );

  // Public sign-up with POST /api/auth/register. The backend always creates a customer.
  const register = useCallback(
    async (name, email, password) => {
      const result = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: { name, email, password },
      });
      return startSession(result, ['customer']);
    },
    [startSession],
  );

  // Updates the signed-in user's own name with PATCH /api/auth/me and shows the saved
  // value everywhere (header, profile). Only the name is editable (contract §6).
  // The answer is applied only to the session that sent the request, never to one started
  // since (sign-out, or another account signed in meanwhile).
  const updateProfile = useCallback(async ({ name }) => {
    const token = readToken();
    const result = await apiRequest('/api/auth/me', { method: 'PATCH', token, body: { name } });
    setSession((previous) =>
      previous.status === 'authenticated' && previous.token === token ? { ...previous, user: result.user } : previous,
    );
    return result.user;
  }, []);

  // Changes the signed-in user's password (contract §6a). The backend signs out every
  // other session and returns a new token for this one, which replaces the stored token.
  // If this session ended while the request was running (signed out, or rejected by another
  // request), the new token is not used: signing out must not be undone by a late answer.
  const changePassword = useCallback(
    async ({ currentPassword, newPassword }) => {
      const token = readToken();
      const result = await apiRequest('/api/auth/me/password', {
        method: 'POST',
        token,
        body: { currentPassword, newPassword },
      });
      if (!token || readToken() !== token) return result.user;
      return startSession(result);
    },
    [startSession],
  );

  // For pages that call the API: if `error` shows the backend rejected the token (expired,
  // invalid or deactivated), signs out with a notice and returns true. The route guard then
  // sends the user to sign in. Other errors are left to the page.
  // A rejection of a request sent with an older token (a late answer from before a password
  // change, sign-out or new sign-in) is also "handled" (true) but ends nothing: that session
  // is already over, and the current one was not the one rejected.
  const endSessionIfRejected = useCallback((error) => {
    const rejection = sessionRejection(error, requestTokenOf(error));
    if (!rejection) return false;
    if (rejection === 'stale') return true;
    latestCheck.current += 1;
    clearToken();
    setNotice(sessionEndedNotice(error));
    setSession(SIGNED_OUT);
    return true;
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
    () => ({ ...session, notice, login, register, logout, restoreSession, endSessionIfRejected, updateProfile, changePassword }),
    [session, notice, login, register, logout, restoreSession, endSessionIfRejected, updateProfile, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
