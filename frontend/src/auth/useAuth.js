import { createContext, useContext } from 'react';

// Shared auth state, provided by AuthProvider.
//   status:  'loading'        — checking a stored token with the backend
//            'authenticated'  — user is set and was confirmed by the backend
//            'unauthenticated'
//            'unavailable'    — a stored token could not be checked (server unreachable or erroring)
//   user:    { id, name, email, role, isActive, createdAt } or null
//   token:   JWT for API requests, or null
//   notice:  message for the login page after a session ended (expired, deactivated), or null
//   login(email, password, { allowedRoles }), register(name, email, password), logout(),
//   restoreSession(), endSessionIfRejected(error), updateProfile({ name }),
//   changePassword({ currentPassword, newPassword })
export const AuthContext = createContext(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return auth;
}
