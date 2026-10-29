import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth.js";
import { useApiData } from "../../api/useApiData.js";
import { adminErrorMessage, listUsers, updateUserRole, updateUserStatus } from "../../api/admin.js";
import { capitalize, formatIsoDate, initialsOf, pageCount } from "../staff/staffFormat.js";
import { useDebouncedValue } from "../staff/useDebouncedValue.js";

const PAGE_SIZE = 20;

// Avatar colours, picked from the user id so each person keeps the same colour.
const AVATAR_COLORS = [
  { color: "#d7f2e5", textColor: "#246b50" },
  { color: "#dcecff", textColor: "#356a99" },
  { color: "#fce9dd", textColor: "#a66b42" },
  { color: "#e8e4ff", textColor: "#7563aa" },
  { color: "#ffe5e7", textColor: "#b66a76" },
  { color: "#e0f1f1", textColor: "#4b8383" },
  { color: "#f8e8fa", textColor: "#a16aa6" },
];
function avatarFor(id = "") {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

const glassStyle = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(255,255,255,0.85)",
  borderRadius: "22px",
  boxShadow: "0 8px 28px rgba(35,83,72,0.05)",
  backdropFilter: "blur(18px)",
};

const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: "12px",
  border: "1px solid #d9e7df",
  background: "rgba(255,255,255,0.85)",
  color: "#294637",
  fontSize: "13px",
  outlineColor: "#399d79",
};

// ========================================
// SUMMARY CARD
// ========================================

function SummaryCard({ label, value, description }) {
  return (
    <div style={{ ...glassStyle, padding: "20px" }}>
      <p className="text-xs font-medium text-slate-500">{label}</p>

      <h3 className="mt-2 text-3xl font-semibold text-emerald-950">
        {value ?? "—"}
      </h3>

      <p className="mt-1 text-xs text-slate-400">{description}</p>
    </div>
  );
}

// ========================================
// BADGE
// ========================================

function Badge({ value, type }) {
  const styles =
    type === "status"
      ? value === "Active"
        ? { background: "#dff4e8", color: "#278357" }
        : { background: "#f1e8e8", color: "#9b6262" }
      : value === "Agent"
      ? { background: "#e4f1ff", color: "#3274a5" }
      : value === "Admin"
      ? { background: "#fff0d7", color: "#9a6a1f" }
      : { background: "#f0e9ff", color: "#7964a5" };

  return (
    <span
      style={{
        ...styles,
        display: "inline-block",
        padding: "6px 11px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
      }}
    >
      {value}
    </span>
  );
}

// ========================================
// MANAGE USER DIALOG
// ========================================

function UserModal({ user, isSelf, onClose, onSaved }) {
  const { token, endSessionIfRejected } = useAuth();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(kind, action) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      onSaved(await action());
    } catch (saveError) {
      if (!endSessionIfRejected(saveError)) setError(adminErrorMessage(saveError, "The change could not be saved."));
    } finally {
      setBusy(null);
    }
  }

  const avatar = avatarFor(user.id);
  const status = user.isActive ? "Active" : "Inactive";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-modal-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/80 bg-[#f3faf6] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              style={{
                width: "46px",
                height: "46px",
                flexShrink: 0,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: avatar.color,
                color: avatar.textColor,
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0">
              <h2
                id="user-modal-title"
                className="break-words text-xl font-semibold text-emerald-950"
              >
                {user.name}
              </h2>
              <p className="mt-1 break-all text-sm text-slate-500">
                {user.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            aria-label="Close user details"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-white/70 p-5">
          <div>
            <p className="text-xs text-slate-500">Role</p>
            <div className="mt-2">
              <Badge value={capitalize(user.role)} type="role" />
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500">Tickets</p>
            <p className="mt-2 text-sm font-semibold text-emerald-950">
              {user.ticketCount}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Joined</p>
            <p className="mt-2 text-sm text-slate-700">
              {formatIsoDate(user.createdAt)}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500">Status</p>
            <div className="mt-2">
              <Badge value={status} type="status" />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="manage-user-role"
              className="mb-2 block text-xs font-semibold text-slate-600"
            >
              User Role{busy === "role" && " · saving…"}
            </label>
            <select
              id="manage-user-role"
              value={user.role}
              onChange={(event) => save("role", () => updateUserRole(token, user.id, event.target.value))}
              disabled={isSelf || Boolean(busy)}
              style={inputStyle}
            >
              <option value="customer">Customer</option>
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="manage-user-status"
              className="mb-2 block text-xs font-semibold text-slate-600"
            >
              Account Status{busy === "status" && " · saving…"}
            </label>
            <select
              id="manage-user-status"
              value={user.isActive ? "active" : "inactive"}
              onChange={(event) =>
                save("status", () => updateUserStatus(token, user.id, event.target.value === "active"))
              }
              disabled={isSelf || Boolean(busy)}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
            {error}
          </p>
        )}

        <p className="mt-4 text-xs leading-5 text-slate-500">
          {isSelf
            ? "You cannot change your own role or account status. Ask another admin."
            : "Changes take effect on the user's next request. Deactivated users are signed out and cannot sign in."}
        </p>

        <div className="mt-7 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  // The dialog keeps its own copy, so it stays open if a change moves the user out of the
  // current filters (e.g. deactivating someone while showing active users only).
  const [selectedUser, setSelectedUser] = useState(null);

  const query = useDebouncedValue(search.trim(), 300);
  useEffect(() => {
    setPage(1);
  }, [query, roleFilter, statusFilter]);

  const loadUsers = useCallback(
    (token) => listUsers(token, { q: query, role: roleFilter, isActive: statusFilter, page, limit: PAGE_SIZE }),
    [query, roleFilter, statusFilter, page],
  );
  const list = useApiData(loadUsers);

  const loadSummary = useCallback(async (token) => {
    const [all, agents, customers, active] = await Promise.all([
      listUsers(token, { limit: 1 }),
      listUsers(token, { role: "agent", limit: 1 }),
      listUsers(token, { role: "customer", limit: 1 }),
      listUsers(token, { isActive: "true", limit: 1 }),
    ]);
    return { total: all.total, agents: agents.total, customers: customers.total, active: active.total };
  }, []);
  const summary = useApiData(loadSummary);

  const users = list.data?.users ?? [];
  const totalPages = list.data ? pageCount(list.data.total, PAGE_SIZE) : 1;

  // The list shrank (a change, or another admin) and this page no longer exists.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Shows the server's saved version at once, then reloads the page and the counts: the user
  // may no longer match the filters, and a role change changes what ticketCount means.
  const handleSaved = (saved) => {
    setSelectedUser((previous) => ({ ...previous, ...saved }));
    list.setData((previous) => ({
      ...previous,
      users: previous.users.map((user) => (user.id === saved.id ? { ...user, ...saved } : user)),
    }));
    list.reload();
    summary.reload();
  };

  return (
    <div className="space-y-6">
      {/* SUMMARY */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total Users"
          value={summary.data?.total}
          description="Registered accounts"
        />
        <SummaryCard
          label="Support Agents"
          value={summary.data?.agents}
          description="Team members"
        />
        <SummaryCard
          label="Customers"
          value={summary.data?.customers}
          description="Customer accounts"
        />
        <SummaryCard
          label="Active Users"
          value={summary.data?.active}
          description="Currently enabled"
        />
      </div>

      {/* SEARCH AND FILTERS */}
      <div style={{ ...glassStyle, padding: "20px" }}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="user-search"
              className="mb-2 block text-xs font-medium text-slate-600"
            >
              Search Users
            </label>
            <input
              id="user-search"
              type="search"
              maxLength={100}
              placeholder="Search name or email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label
              htmlFor="user-role-filter"
              className="mb-2 block text-xs font-medium text-slate-600"
            >
              Role
            </label>
            <select
              id="user-role-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              style={inputStyle}
            >
              <option value="all">All Roles</option>
              <option value="agent">Agents</option>
              <option value="admin">Admins</option>
              <option value="customer">Customers</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="user-status-filter"
              className="mb-2 block text-xs font-medium text-slate-600"
            >
              Account Status
            </label>
            <select
              id="user-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={inputStyle}
            >
              <option value="all">All Statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* USER DIRECTORY */}
      <div style={{ ...glassStyle, overflow: "hidden" }}>
        <div className="flex items-center justify-between gap-4 border-b border-white/70 px-5 py-5">
          <div>
            <h2 className="text-base font-semibold text-emerald-950">
              User Directory
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              View and manage registered users
            </p>
          </div>
          <span className="text-xs font-medium text-emerald-800">
            {list.data ? `${list.data.total} users` : "…"}
          </span>
        </div>

        {list.status === "error" && (
          <p role="alert" className="px-5 py-6 text-sm text-red-700">
            {adminErrorMessage(list.error, "Users could not be loaded.")}{" "}
            <button type="button" onClick={list.reload} className="font-semibold underline">Try again</button>
          </p>
        )}

        <div className="overflow-x-auto" aria-busy={list.status === "loading"}>
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/70 bg-white/40">
                {[
                  "User",
                  "Role",
                  "Status",
                  "Tickets",
                  "Joined",
                  "Action",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-5 py-4 text-xs font-semibold text-slate-600"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {users.map((user) => {
                const avatar = avatarFor(user.id);
                return (
                  <tr
                    key={user.id}
                    className="border-b border-white/60 transition hover:bg-white/40"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          style={{
                            width: "42px",
                            height: "42px",
                            flexShrink: 0,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: avatar.color,
                            color: avatar.textColor,
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          {initialsOf(user.name)}
                        </span>

                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-emerald-950">
                            {user.name}
                            {user.id === currentUser?.id && (
                              <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>
                            )}
                          </p>
                          <p className="mt-1 break-all text-xs text-slate-500">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <Badge value={capitalize(user.role)} type="role" />
                    </td>

                    <td className="px-5 py-4">
                      <Badge value={user.isActive ? "Active" : "Inactive"} type="status" />
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {user.ticketCount}
                    </td>

                    <td className="px-5 py-4 text-xs text-slate-600">
                      {formatIsoDate(user.createdAt)}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedUser(user)}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                );
              })}

              {list.data && users.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-slate-500"
                  >
                    No users match your search or filters.
                  </td>
                </tr>
              )}

              {!list.data && list.status === "loading" && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                    Loading users…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {list.data && totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-white/70 px-5 py-4 text-xs text-slate-600">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={page <= 1}
              className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 font-medium hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Newer
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= totalPages}
              className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 font-medium hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Older →
            </button>
          </div>
        )}
      </div>

      {/* USER DETAILS MODAL */}
      {selectedUser && (
        <UserModal
          user={selectedUser}
          isSelf={selectedUser.id === currentUser?.id}
          onClose={() => setSelectedUser(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
