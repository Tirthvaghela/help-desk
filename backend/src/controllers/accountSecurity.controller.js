import { User } from '../models/User.js';
import { AuthToken } from '../models/AuthToken.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { requireEmail, requireJsonBody } from '../utils/validate.js';
import { hashPassword, passwordMatches, requireExistingPassword, requireNewPassword } from '../utils/password.js';
import { consumeToken, findToken, invalidLink, issueToken } from '../utils/oneTimeToken.js';
import { signToken } from '../utils/token.js';
import { serializeUser } from '../utils/userSerializer.js';
import { sendEmail, sendEmailQuietly } from '../services/email.js';
import {
  emailChangedNotice,
  emailChangeRequestedNotice,
  passwordChangedNotice,
  passwordResetEmail,
  verifyEmailChangeEmail,
} from '../services/emailTemplates.js';

// Account security (API contract §6a): password change, email change with confirmation,
// forgot/reset password. Tokens, passwords and hashes are never returned or logged.

const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for that email, we have sent a link to reset the password. Check your inbox.';

// The signed-in user with their password hash, after checking the current password.
// A wrong current password is a 400 (not 401), so the frontend does not end the session.
async function requireCurrentPassword(req, value) {
  const currentPassword = requireExistingPassword(value, 'currentPassword');
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Invalid or expired token');
  if (!(await passwordMatches(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Your current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  }
  return user;
}

// Sets a new password and signs the user out everywhere (tokenVersion + 1). Outstanding
// reset links are removed too. Returns the updated user.
async function setPassword(userId, newPassword) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { passwordHash: await hashPassword(newPassword) }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' },
  );
  await AuthToken.deleteMany({ user: userId, purpose: 'password_reset' });
  return user;
}

// POST /api/auth/me/password — { currentPassword, newPassword }
// → 200 { user, token }: the other sessions end, this one continues with the new token.
export async function changePassword(req, res) {
  const body = requireJsonBody(req.body);
  const newPassword = requireNewPassword(body.newPassword, 'newPassword');
  const user = await requireCurrentPassword(req, body.currentPassword);
  if (await passwordMatches(newPassword, user.passwordHash)) {
    throw ApiError.badRequest('Choose a password that is different from your current one');
  }

  const updated = await setPassword(user._id, newPassword);
  await sendEmailQuietly('password changed', { to: updated.email, ...passwordChangedNotice({ name: updated.name }) });
  res.json({ user: serializeUser(updated), token: signToken(updated) });
}

// POST /api/auth/me/email — { newEmail, currentPassword } → 202 { pendingEmail, expiresAt }
// Nothing changes until the link sent to the new address is opened (POST /verify-email).
export async function requestEmailChange(req, res) {
  const body = requireJsonBody(req.body);
  const newEmail = requireEmail(body.newEmail, 'newEmail');
  const user = await requireCurrentPassword(req, body.currentPassword);

  if (newEmail === user.email) {
    throw ApiError.badRequest('That is already your email address');
  }
  if (await User.exists({ email: newEmail })) {
    throw ApiError.conflict('Email is already registered', 'EMAIL_TAKEN');
  }

  const { token, expiresAt } = await issueToken({
    userId: user._id,
    purpose: 'email_change',
    ttlMs: env.emailChangeTtlHours * 60 * 60 * 1000,
    newEmail,
  });
  try {
    await sendEmail({ to: newEmail, ...verifyEmailChangeEmail({ name: user.name, token, ttlHours: env.emailChangeTtlHours }) });
  } catch (err) {
    // Without the email the change can never be confirmed, so undo it and say so.
    await AuthToken.deleteMany({ user: user._id, purpose: 'email_change' });
    console.error(`Email (email change) could not be sent: ${err?.message ?? err}`);
    throw new ApiError(503, 'EMAIL_DELIVERY_FAILED', 'We could not send the confirmation email. Please try again later.');
  }
  await sendEmailQuietly('email change notice', { to: user.email, ...emailChangeRequestedNotice({ name: user.name, newEmail }) });

  res.status(202).json({ pendingEmail: newEmail, expiresAt });
}

// GET /api/auth/me/email — { pendingEmail, expiresAt } (both null when nothing is pending)
export async function getEmailChange(req, res) {
  const pending = await AuthToken.findOne({ user: req.user._id, purpose: 'email_change', expiresAt: { $gt: new Date() } });
  res.json({ pendingEmail: pending?.newEmail ?? null, expiresAt: pending?.expiresAt ?? null });
}

// DELETE /api/auth/me/email — cancels a pending email change.
export async function cancelEmailChange(req, res) {
  await AuthToken.deleteMany({ user: req.user._id, purpose: 'email_change' });
  res.json({ pendingEmail: null, expiresAt: null });
}

// POST /api/auth/verify-email — { token } (public: the link may be opened anywhere)
// → 200 { email }. The token is used up even if the address was taken in the meantime.
export async function verifyEmailChange(req, res) {
  const body = requireJsonBody(req.body);
  const record = await consumeToken(body.token, 'email_change');
  const user = await User.findById(record.user);
  if (!user || !user.isActive) throw invalidLink();

  const previousEmail = user.email;
  if (previousEmail === record.newEmail) {
    return res.json({ email: user.email });
  }
  if (await User.exists({ email: record.newEmail, _id: { $ne: user._id } })) {
    throw ApiError.conflict('That email address has been registered by someone else in the meantime', 'EMAIL_TAKEN');
  }
  user.email = record.newEmail;
  try {
    await user.save();
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('That email address has been registered by someone else in the meantime', 'EMAIL_TAKEN');
    throw err;
  }
  await sendEmailQuietly('email changed notice', { to: previousEmail, ...emailChangedNotice({ name: user.name, newEmail: user.email }) });
  res.json({ email: user.email });
}

// POST /api/auth/forgot-password — { email } → always the same 200, whether or not the
// account exists, so the response cannot be used to find registered emails. The email is
// sent after responding, so timing does not reveal it either.
export async function forgotPassword(req, res) {
  const body = requireJsonBody(req.body);
  const email = requireEmail(body.email);
  res.json({ message: FORGOT_PASSWORD_MESSAGE });

  try {
    const user = await User.findOne({ email, isActive: true });
    if (!user) return;
    // At most one reset email per account per minute (repeated clicks, scripted requests).
    const recent = await AuthToken.exists({
      user: user._id,
      purpose: 'password_reset',
      createdAt: { $gt: new Date(Date.now() - RESET_RESEND_COOLDOWN_MS) },
    });
    if (recent) return;

    const { token } = await issueToken({
      userId: user._id,
      purpose: 'password_reset',
      ttlMs: env.passwordResetTtlMinutes * 60 * 1000,
    });
    await sendEmailQuietly('password reset', {
      to: user.email,
      ...passwordResetEmail({ name: user.name, token, ttlMinutes: env.passwordResetTtlMinutes }),
    });
  } catch (err) {
    console.error(`Password reset request failed: ${err?.message ?? err}`);
  }
}

// POST /api/auth/reset-password/check — { token } → 200 { valid: true, expiresAt }
// Lets the reset page show "link expired" before the user types a new password.
export async function checkResetToken(req, res) {
  const body = requireJsonBody(req.body);
  const record = await findToken(body.token, 'password_reset');
  res.json({ valid: true, expiresAt: record.expiresAt });
}

// POST /api/auth/reset-password — { token, newPassword } → 200 { message }
// The password is validated before the token is used, so a too-short password does not
// waste the link. The user is not signed in automatically.
export async function resetPassword(req, res) {
  const body = requireJsonBody(req.body);
  const newPassword = requireNewPassword(body.newPassword, 'newPassword');
  const record = await consumeToken(body.token, 'password_reset');
  const user = await User.findById(record.user);
  if (!user || !user.isActive) throw invalidLink();

  const updated = await setPassword(user._id, newPassword);
  await sendEmailQuietly('password changed', { to: updated.email, ...passwordChangedNotice({ name: updated.name }) });
  res.json({ message: 'Your password has been reset. You can now sign in with your new password.' });
}
