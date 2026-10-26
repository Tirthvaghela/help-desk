import { useState } from "react";

// ========================================
// SAMPLE CATEGORIES
// ========================================

const initialCategories = [
  {
    id: 1,
    name: "Account",
    description: "Login, passwords, and account access",
    tickets: 3,
    active: true,
  },
  {
    id: 2,
    name: "Billing",
    description: "Invoices, payments, refunds, and subscriptions",
    tickets: 1,
    active: true,
  },
  {
    id: 3,
    name: "Technical",
    description: "Application errors, bugs, and technical issues",
    tickets: 1,
    active: true,
  },
  {
    id: 4,
    name: "General Inquiry",
    description: "General questions and customer assistance",
    tickets: 0,
    active: true,
  },
];

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

// ========================================
// MAIN COMPONENT
// ========================================

export default function AdminCategories() {
  const [categories, setCategories] = useState(initialCategories);

  const [newCategory, setNewCategory] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const [error, setError] = useState("");

  // ========================================
  // ADD CATEGORY
  // ========================================

  function handleAddCategory(event) {
    event.preventDefault();

    const name = newCategory.trim();
    const description = newDescription.trim();

    if (!name) {
      setError("Please enter a category name.");
      return;
    }

    const alreadyExists = categories.some(
      (category) =>
        category.name.toLowerCase() === name.toLowerCase()
    );

    if (alreadyExists) {
      setError("This category already exists.");
      return;
    }

    const category = {
      id: Date.now(),
      name,
      description: description || "No description provided",
      tickets: 0,
      active: true,
    };

    setCategories((previous) => [...previous, category]);

    setNewCategory("");
    setNewDescription("");
    setError("");
  }

  // ========================================
  // RENAME CATEGORY
  // ========================================

  function startRename(category) {
    setEditingId(category.id);
    setEditingName(category.name);
    setError("");
  }

  function saveRename(id) {
    const name = editingName.trim();

    if (!name) {
      setError("Category name cannot be empty.");
      return;
    }

    const duplicate = categories.some(
      (category) =>
        category.id !== id &&
        category.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      setError("A category with this name already exists.");
      return;
    }

    setCategories((previous) =>
      previous.map((category) =>
        category.id === id
          ? { ...category, name }
          : category
      )
    );

    setEditingId(null);
    setEditingName("");
    setError("");
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
    setError("");
  }

  // ========================================
  // ACTIVATE / DEACTIVATE
  // ========================================

  function toggleCategory(id) {
    setCategories((previous) =>
      previous.map((category) =>
        category.id === id
          ? { ...category, active: !category.active }
          : category
      )
    );
  }

  return (
    <div className="space-y-5">

      {/* ========================================
          ADD CATEGORY FORM
      ======================================== */}

      <form
        onSubmit={handleAddCategory}
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
              onChange={(event) => {
                setNewCategory(event.target.value);
                setError("");
              }}
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
              onChange={(event) =>
                setNewDescription(event.target.value)
              }
              style={inputStyle}
            />
          </div>

          {/* ADD BUTTON */}

          <button
            type="submit"
            className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            + Add Category
          </button>
        </div>

        {error && editingId === null && (
          <p className="mt-3 text-xs font-medium text-red-600">
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
            {categories.length} Categories
          </span>
        </div>

        {/* CATEGORY ROWS */}

        <div className="divide-y divide-white/70">
          {categories.map((category) => (
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
                      onChange={(event) => {
                        setEditingName(event.target.value);
                        setError("");
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
                      style={inputStyle}
                      autoFocus
                    />

                    {error && (
                      <p className="mt-2 text-xs text-red-600">
                        {error}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-emerald-950">
                      {category.name}
                    </h3>

                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {category.description}
                    </p>
                  </>
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
                    category.active
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      category.active
                        ? "bg-emerald-600"
                        : "bg-slate-500"
                    }`}
                  />

                  {category.active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* ACTION BUTTONS */}

              <div className="flex flex-wrap items-center gap-2">
                {editingId === category.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => saveRename(category.id)}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                    >
                      Save
                    </button>

                    <button
                      type="button"
                      onClick={cancelRename}
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
                      className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className={`rounded-xl border px-4 py-2 text-xs font-medium transition ${
                        category.active
                          ? "border-slate-200 bg-white/80 text-slate-700 hover:bg-white"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {category.active ? "Deactivate" : "Activate"}
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
        Deactivated categories remain visible to administrators but
        should no longer appear as options when customers create new
        tickets.
      </p>
    </div>
  );
}