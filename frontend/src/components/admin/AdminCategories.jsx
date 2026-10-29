import { useCallback, useState } from "react";
import { useAuth } from "../../auth/useAuth.js";
import { useApiData } from "../../api/useApiData.js";
import { adminErrorMessage, createCategory, getStats, listAllCategories, updateCategory } from "../../api/admin.js";

const NAME_MIN = 2;
const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;

// ========================================
// STYLES
// ========================================

const glassStyle = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(255,255,255,0.85)",
  borderRadius: "22px",
  boxShadow: "0 8px 28px rgba(35,83,72,0.05)",
  backdropFilter: "blur(18px)",
};

const inputStyle = {
  width: "100%",
  padding: "12px 15px",
  borderRadius: "12px",
  border: "1px solid #d9e7df",
  background: "rgba(255,255,255,0.85)",
  color: "#294637",
  fontSize: "13px",
  outlineColor: "#399d79",
};

function nameError(name) {
  if (!name) return "Please enter a category name.";
  if (name.length < NAME_MIN) return `Category names need at least ${NAME_MIN} characters.`;
  if (name.length > NAME_MAX) return `Category names can be at most ${NAME_MAX} characters.`;
  return null;
}

// Categories with the number of tickets in each (from the statistics endpoint).
async function loadCategories(token) {
  const [categories, stats] = await Promise.all([listAllCategories(token), getStats(token)]);
  const counts = new Map(stats.byCategory.map((row) => [row.category.id, row.count]));
  return categories.map((category) => ({ ...category, tickets: counts.get(category.id) ?? 0 }));
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function AdminCategories() {
  const { token, endSessionIfRejected } = useAuth();
  const { data: categories, status, error: loadError, reload, setData } = useApiData(loadCategories);

  const [newCategory, setNewCategory] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const [busy, setBusy] = useState(null); // "add" | category id
  const [error, setError] = useState("");
  const [rowError, setRowError] = useState({ id: null, message: "" });

  // Replaces one category with the server's saved version, keeping its ticket count.
  const applySaved = (saved) =>
    setData((previous) =>
      previous.map((category) => (category.id === saved.id ? { ...category, ...saved } : category)),
    );

  async function run(key, action, onError) {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (saveError) {
      if (!endSessionIfRejected(saveError)) onError(adminErrorMessage(saveError, "The change could not be saved."));
    } finally {
      setBusy(null);
    }
  }

  // ========================================
  // ADD CATEGORY
  // ========================================

  function handleAddCategory(event) {
    event.preventDefault();

    const name = newCategory.trim();
    const description = newDescription.trim();

    const invalid = nameError(name) ?? (description.length > DESCRIPTION_MAX ? `Descriptions can be at most ${DESCRIPTION_MAX} characters.` : null);
    if (invalid) {
      setError(invalid);
      return;
    }

    setError("");
    run(
      "add",
      async () => {
        const created = await createCategory(token, { name, description });
        setData((previous) =>
          [...previous, { ...created, tickets: 0 }].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
        );
        setNewCategory("");
        setNewDescription("");
      },
      setError,
    );
  }

  // ========================================
  // RENAME CATEGORY
  // ========================================

  function startRename(category) {
    setEditingId(category.id);
    setEditingName(category.name);
    setRowError({ id: null, message: "" });
  }

  function saveRename(id) {
    const name = editingName.trim();
    const invalid = nameError(name);
    if (invalid) {
      setRowError({ id, message: invalid });
      return;
    }

    run(
      id,
      async () => {
        applySaved(await updateCategory(token, id, { name }));
        setEditingId(null);
        setEditingName("");
        setRowError({ id: null, message: "" });
      },
      (message) => setRowError({ id, message }),
    );
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
    setRowError({ id: null, message: "" });
  }

  // ========================================
  // ACTIVATE / DEACTIVATE
  // ========================================

  function toggleCategory(category) {
    run(
      category.id,
      async () => applySaved(await updateCategory(token, category.id, { isActive: !category.isActive })),
      (message) => setRowError({ id: category.id, message }),
    );
  }

  return (
    <div className="space-y-5">

      {/* ========================================
          ADD CATEGORY FORM
      ======================================== */}

      <form
        onSubmit={handleAddCategory}
        noValidate
        style={{
          ...glassStyle,
          padding: "22px",
        }}
      >
        <h2 className="text-base font-semibold text-emerald-950">
          Add New Category
        </h2>

        <p className="mt-1 text-xs text-slate-500">
          Create categories for organizing customer support requests.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">

          {/* CATEGORY NAME */}

          <div>
            <label
              htmlFor="category-name"
              className="mb-2 block text-xs font-semibold text-slate-600"
            >
              Category Name
            </label>

            <input
              id="category-name"
              type="text"
              placeholder="e.g. Data & Privacy"
              value={newCategory}
              maxLength={NAME_MAX + 10}
              onChange={(event) => {
                setNewCategory(event.target.value);
                setError("");
              }}
              disabled={busy === "add"}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "category-add-error" : undefined}
              style={inputStyle}
            />
          </div>

          {/* DESCRIPTION */}

          <div>
            <label
              htmlFor="category-description"
              className="mb-2 block text-xs font-semibold text-slate-600"
            >
              Description
            </label>

            <input
              id="category-description"
              type="text"
              placeholder="Briefly describe this category"
              value={newDescription}
              maxLength={DESCRIPTION_MAX}
              onChange={(event) =>
                setNewDescription(event.target.value)
              }
              disabled={busy === "add"}
              style={inputStyle}
            />
          </div>

          {/* ADD BUTTON */}

          <button
            type="submit"
            disabled={busy === "add"}
            aria-busy={busy === "add"}
            className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy === "add" ? "Adding…" : "+ Add Category"}
          </button>
        </div>

        {error && (
          <p id="category-add-error" role="alert" className="mt-3 text-xs font-medium text-red-600">
            {error}
          </p>
        )}
      </form>

      {/* ========================================
          CATEGORY LIST
      ======================================== */}

      <div
        style={{
          ...glassStyle,
          overflow: "hidden",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 px-5 py-5">
          <div>
            <h2 className="text-base font-semibold text-emerald-950">
              Ticket Categories
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Manage categories available to customers
            </p>
          </div>

          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            {categories ? `${categories.length} Categories` : "…"}
          </span>
        </div>

        {/* CATEGORY ROWS */}

        {status === "error" && !categories && (
          <p role="alert" className="px-5 py-6 text-sm text-red-700">
            {adminErrorMessage(loadError, "Categories could not be loaded.")}{" "}
            <button type="button" onClick={reload} className="font-semibold underline">Try again</button>
          </p>
        )}

        {!categories && status === "loading" && (
          <p role="status" className="px-5 py-6 text-sm text-slate-500">Loading categories…</p>
        )}

        {categories?.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No categories yet. Customers need at least one active category to raise a ticket.
          </p>
        )}

        <div className="divide-y divide-white/70">
          {categories?.map((category) => (
            <div
              key={category.id}
              className="flex flex-col gap-4 px-5 py-5 transition hover:bg-white/30 lg:flex-row lg:items-center lg:justify-between"
            >
              {/* CATEGORY INFORMATION */}

              <div className="min-w-0 flex-1">
                {editingId === category.id ? (
                  <div className="max-w-md">
                    <label
                      htmlFor={`rename-${category.id}`}
                      className="mb-2 block text-xs font-medium text-slate-600"
                    >
                      Rename Category
                    </label>

                    <input
                      id={`rename-${category.id}`}
                      type="text"
                      value={editingName}
                      maxLength={NAME_MAX + 10}
                      onChange={(event) => {
                        setEditingName(event.target.value);
                        setRowError({ id: null, message: "" });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveRename(category.id);
                        }

                        if (event.key === "Escape") {
                          cancelRename();
                        }
                      }}
                      disabled={busy === category.id}
                      style={inputStyle}
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <h3 className="break-words text-sm font-semibold text-emerald-950">
                      {category.name}
                    </h3>

                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {category.description || "No description provided"}
                    </p>
                  </>
                )}

                {rowError.id === category.id && rowError.message && (
                  <p role="alert" className="mt-2 text-xs text-red-600">
                    {rowError.message}
                  </p>
                )}
              </div>

              {/* TICKET COUNT */}

              <div className="w-full text-sm text-slate-600 lg:w-28">
                {category.tickets}{" "}
                {category.tickets === 1 ? "ticket" : "tickets"}
              </div>

              {/* STATUS */}

              <div className="w-full lg:w-28">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    category.isActive
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      category.isActive
                        ? "bg-emerald-600"
                        : "bg-slate-500"
                    }`}
                  />

                  {category.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {/* ACTION BUTTONS */}

              <div className="flex flex-wrap items-center gap-2">
                {editingId === category.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => saveRename(category.id)}
                      disabled={busy === category.id}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-70"
                    >
                      {busy === category.id ? "Saving…" : "Save"}
                    </button>

                    <button
                      type="button"
                      onClick={cancelRename}
                      disabled={busy === category.id}
                      className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startRename(category)}
                      disabled={Boolean(busy)}
                      className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-white disabled:opacity-60"
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      disabled={Boolean(busy)}
                      aria-busy={busy === category.id}
                      className={`rounded-xl border px-4 py-2 text-xs font-medium transition disabled:opacity-60 ${
                        category.isActive
                          ? "border-slate-200 bg-white/80 text-slate-700 hover:bg-white"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {busy === category.id ? "Saving…" : category.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* INFORMATION NOTE */}

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        Deactivated categories stay on existing tickets but are no longer offered to
        customers when they create new tickets.
      </p>
    </div>
  );
}
