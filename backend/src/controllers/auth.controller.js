import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { requireEmail, requireJsonBody, requireString } from '../utils/validate.js';
import { signToken } from '../utils/token.js';
import { BCRYPT_COST, hashPassword, requireExistingPassword, requireNewPassword } from '../utils/password.js';
import { serializeUser } from '../utils/userSerializer.js';

// Authentication endpoints (API contract §6).

function invalidCredentials() {
  return ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
}

// Compared against when the email is unknown, so a failed login takes as long as a wrong
// password and the response time does not reveal which emails are registered.
let dummyHashPromise;
function dummyHash() {
  dummyHashPromise ??= bcrypt.hash('placeholder-password-for-timing', BCRYPT_COST);
  return dummyHashPromise;
}

// POST /api/auth/register — public sign-up. Always creates a customer: any role or other
// field in the body is ignored (contract §6).
export async function register(req, res) {
  const body = requireJsonBody(req.body);
  const name = requireString(body.name, 'name', { min: 2, max: 80 });
  const email = requireEmail(body.email);
  const password = requireNewPassword(body.password);

  const emailTaken = () => ApiError.conflict('Email is already registered', 'EMAIL_TAKEN');
  if (await User.exists({ email })) {
    throw emailTaken();
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await User.create({ name, email, passwordHash, role: 'customer' });
  } catch (err) {
    // Two simultaneous registrations with the same email.
    if (err.code === 11000) throw emailTaken();
    throw err;
  }

  res.status(201).json({ user: serializeUser(user), token: signToken(user) });
}

// POST /api/auth/login — the password is always checked first, and every failure before
// that point gets the same 401, so the response never reveals whether an email is
// registered or an account is deactivated.
export async function login(req, res) {
  const body = requireJsonBody(req.body);
  const email = requireEmail(body.email);
  const password = requireExistingPassword(body.password);

  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !passwordMatches) {
    throw invalidCredentials();
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated', 'ACCOUNT_DISABLED');
  }

  res.json({ user: serializeUser(user), token: signToken(user) });
}

// GET /api/auth/me — the signed-in user, for restoring a session after a page reload.
export function me(req, res) {
  res.json({ user: serializeUser(req.user) });
}

// PATCH /api/auth/me — the signed-in user updates their own profile. Only `name` can be
// changed here: email changes would need verification, password changes need their own
// flow with the current password, and role/status are admin-only (§11). Other fields are
// ignored, like everywhere else in the API (§2).
export async function updateMe(req, res) {
  const body = requireJsonBody(req.body);
  if (body.name === undefined) {
    throw ApiError.badRequest('Provide a name to update');
  }
  const name = requireString(body.name, 'name', { min: 2, max: 80 });

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { name } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!user) {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  res.json({ user: serializeUser(user) });
}
