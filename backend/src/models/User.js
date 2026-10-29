import mongoose from 'mongoose';
import { applyToJSON } from './toJSON.js';
import { EMAIL_PATTERN } from '../utils/validate.js';

// docs/DATA_MODEL.md §3.1. Owner: Swati (first implementation by the integration lead).

export const USER_ROLES = Object.freeze(['customer', 'agent', 'admin']);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      minlength: [2, 'name must be at least 2 characters'],
      maxlength: [80, 'name must be at most 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'email is required'],
      trim: true,
      lowercase: true,
      maxlength: [254, 'email must be at most 254 characters'],
      match: [EMAIL_PATTERN, 'email must be a valid email address'],
      unique: true,
    },
    // Never returned: excluded from queries by default and removed by toJSON.
    passwordHash: {
      type: String,
      required: [true, 'passwordHash is required'],
      select: false,
    },
    role: {
      type: String,
      enum: { values: USER_ROLES, message: `role must be one of: ${USER_ROLES.join(', ')}` },
      default: 'customer',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Copied into every sign-in token. Incrementing it (password change or reset) makes
    // all earlier tokens invalid, i.e. signs the user out everywhere. Never returned.
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, isActive: 1 });
applyToJSON(userSchema);

export const User = mongoose.model('User', userSchema);
