// User shape from the contract (§3). Fields are copied one by one, so passwordHash or any
// other stored field can never leak. Used by the auth and admin user endpoints.
export function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
