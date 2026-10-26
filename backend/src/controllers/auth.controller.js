import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { requireEmail, requireJsonBody, requireString } from '../utils/validate.js';
import { signToken } from '../utils/token.js';

// Authentication endpoints (API contract §6).

const BCRYPT_COST = 12;
const PASSWORD_MIN_LENGTH = 8;
// Registration accepted up to 128 characters before the 72-byte check was added, so login
// keeps that limit and existing accounts can still sign in.
const LOGIN_PASSWORD_MAX_LENGTH = 128;

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

// User shape from the contract (§3). Never includes passwordHash.
function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

// bcrypt only uses the first 72 bytes of a password, so longer ones are rejected rather
// than silently shortened. Bytes, not characters: "€" is one character but three bytes.
function requireNewPassword(value) {
  const password = requireString(value, 'password', { min: PASSWORD_MIN_LENGTH });
  if (bcrypt.truncates(password)) {
    throw ApiError.badRequest('password must be at most 72 bytes (some characters use more than one byte)');
  }
  return password;
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

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
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
  const password = requireString(body.password, 'password', { max: LOGIN_PASSWORD_MAX_LENGTH });

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
