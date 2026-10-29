import mongoose from 'mongoose';
import { applyToJSON } from './toJSON.js';

// One-time links for password reset and email-change confirmation (docs/DATA_MODEL.md §3.6).
// Only a SHA-256 hash of the token is stored; the token itself exists only in the email.
// MongoDB deletes expired documents automatically (TTL index on expiresAt); the code also
// checks expiresAt itself, because the TTL monitor only runs about once a minute.

export const AUTH_TOKEN_PURPOSES = Object.freeze(['password_reset', 'email_change']);

const authTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: AUTH_TOKEN_PURPOSES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    // email_change only: the address that becomes the sign-in email once confirmed.
    newEmail: { type: String, trim: true, lowercase: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authTokenSchema.index({ user: 1, purpose: 1, createdAt: -1 });
applyToJSON(authTokenSchema);

export const AuthToken = mongoose.model('AuthToken', authTokenSchema);
