import mongoose from 'mongoose';
import { Category } from '../models/Category.js';
import { ApiError } from '../utils/ApiError.js';
import { requireJsonBody, requireString } from '../utils/validate.js';

// Category endpoints (API contract §10). Owner: Swatismita.

const NAME_RULES = { min: 2, max: 50 };
const DESCRIPTION_MAX = 200;
// Same collation as the unique index, so lookups and sorting ignore case.
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

// Category shape (§3), plus the optional description.
export function serializeCategory(category) {
  return {
    id: String(category._id),
    name: category.name,
    description: category.description ?? '',
    isActive: category.isActive,
  };
}

function categoryExists() {
  return ApiError.conflict('A category with this name already exists', 'CATEGORY_EXISTS');
}

function readDescription(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw ApiError.badRequest('description must be a string');
  }
  const description = value.trim();
  if (description.length > DESCRIPTION_MAX) {
    throw ApiError.badRequest(`description must be at most ${DESCRIPTION_MAX} characters`);
  }
  return description;
}

async function assertNameFree(name, exceptId) {
  const filter = exceptId ? { name, _id: { $ne: exceptId } } : { name };
  if (await Category.exists(filter).collation(CASE_INSENSITIVE)) {
    throw categoryExists();
  }
}

// Saves, turning a unique-index race (two admins creating the same name) into 409.
async function saveCategory(work) {
  try {
    return await work();
  } catch (err) {
    if (err?.code === 11000) throw categoryExists();
    throw err;
  }
}

// GET /api/categories — any logged-in user. Active categories only, sorted by name.
export async function listActiveCategories(req, res) {
  const categories = await Category.find({ isActive: true }).collation(CASE_INSENSITIVE).sort({ name: 1 });
  res.json({ categories: categories.map(serializeCategory) });
}

// GET /api/admin/categories — admin. All categories, including inactive ones.
export async function listAllCategories(req, res) {
  const categories = await Category.find().collation(CASE_INSENSITIVE).sort({ name: 1 });
  res.json({ categories: categories.map(serializeCategory) });
}

// POST /api/admin/categories — admin. { name, description? }
export async function createCategory(req, res) {
  const body = requireJsonBody(req.body);
  const name = requireString(body.name, 'name', NAME_RULES);
  const description = readDescription(body.description);

  await assertNameFree(name);
  const category = await saveCategory(() => Category.create({ name, description: description ?? '' }));
  res.status(201).json({ category: serializeCategory(category) });
}

// PATCH /api/admin/categories/:id — admin. Rename, describe and/or (de)activate.
// Deactivated categories stay on existing tickets but cannot be chosen for new ones (D-6).
export async function updateCategory(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    throw ApiError.badRequest('Invalid category id', 'INVALID_ID');
  }
  const body = requireJsonBody(req.body);

  const update = {};
  if (body.name !== undefined) update.name = requireString(body.name, 'name', NAME_RULES);
  const description = readDescription(body.description);
  if (description !== undefined) update.description = description;
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      throw ApiError.badRequest('isActive must be true or false');
    }
    update.isActive = body.isActive;
  }
  if (Object.keys(update).length === 0) {
    throw ApiError.badRequest('Provide name, description or isActive to update');
  }

  if (!(await Category.exists({ _id: req.params.id }))) {
    throw ApiError.notFound('Category not found');
  }
  if (update.name !== undefined) await assertNameFree(update.name, req.params.id);

  const category = await saveCategory(() =>
    Category.findByIdAndUpdate(req.params.id, { $set: update }, { returnDocument: 'after', runValidators: true }),
  );
  if (!category) throw ApiError.notFound('Category not found');
  res.json({ category: serializeCategory(category) });
}
