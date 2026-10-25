import mongoose from 'mongoose';
import { applyToJSON } from './toJSON.js';

// docs/DATA_MODEL.md §3.2, contract D-6 (stored as a collection). Owner: Swati.
// Inactive categories stay on existing tickets; only ticket creation rejects them.

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      minlength: [2, 'name must be at least 2 characters'],
      maxlength: [50, 'name must be at most 50 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Case-insensitive uniqueness: "Billing" and "billing" are the same category.
categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
applyToJSON(categorySchema);

export const Category = mongoose.model('Category', categorySchema);
