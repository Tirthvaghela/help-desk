import { useMemo, useState } from "react";

// ========================================
// SAMPLE USERS
// ========================================

const initialUsers = [
  {
    id: "USR-001",
    name: "Shwetaleena Kundu",
    email: "shwetaleena@helpdesk.team",
    role: "Agent",
    status: "Active",
    joined: "2026-10-15",
    tickets: 2,
    initials: "SK",
    color: "#d7f2e5",
    textColor: "#246b50",
  },
  {
    id: "USR-002",
    name: "Mimansa Das",
    email: "mimansa@helpdesk.team",
    role: "Agent",
    status: "Active",
    joined: "2026-10-16",
    tickets: 1,
    initials: "MD",
    color: "#dcecff",
    textColor: "#356a99",
  },
  {
    id: "USR-003",
    name: "Riya Sharma",
    email: "riya@example.com",
    role: "Customer",
    status: "Active",
    joined: "2026-10-18",
    tickets: 1,
    initials: "RS",
    color: "#fce9dd",
    textColor: "#a66b42",
  },
  {
    id: "USR-004",
    name: "Arjun Patel",
    email: "arjun@example.com",
    role: "Customer",
    status: "Active",
    joined: "2026-10-19",
    tickets: 1,
    initials: "AP",
    color: "#e8e4ff",
    textColor: "#7563aa",
  },
  {
    id: "USR-005",
    name: "Neha Verma",
    email: "neha@example.com",
    role: "Customer",
    status: "Inactive",
    joined: "2026-10-20",
    tickets: 1,
    initials: "NV",
    color: "#ffe5e7",
    textColor: "#b66a76",
  },
  {
    id: "USR-006",
    name: "Kabir Singh",
    email: "kabir@example.com",
    role: "Customer",
    status: "Active",
    joined: "2026-10-21",
    tickets: 1,
    initials: "KS",
    color: "#e0f1f1",
    textColor: "#4b8383",
  },
  {
    id: "USR-007",
    name: "Ananya Das",
    email: "ananya@example.com",
    role: "Customer",
    status: "Active",
    joined: "2026-10-22",
    tickets: 1,
    initials: "AD",
    color: "#f8e8fa",
    textColor: "#a16aa6",
  },
];

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
        {value}
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
// MAIN COMPONENT
// ========================================

export default function AdminUsers() {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedUserId, setSelectedUserId] = useState(null);

  const selectedUser = users.find(
    (user) => user.id === selectedUserId
  );

  const filteredUsers = useMemo(() => {
    const query = search.toLowerCase().trim();

    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.id.toLowerCase().includes(query);

      const matchesRole =
        roleFilter === "All" || user.role === roleFilter;

      const matchesStatus =
        statusFilter === "All" || user.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const totalUsers = users.length;
  const totalAgents = users.filter((user) => user.role === "Agent").length;
  const totalCustomers = users.filter(
    (user) => user.role === "Customer"
  ).length;
  const activeUsers = users.filter(
    (user) => user.status === "Active"
  ).length;

  function updateUser(id, field, value) {
    setUsers((previous) =>
      previous.map((user) =>
        user.id === id ? { ...user, [field]: value } : user
      )
    );
  }

  return (
    <div className="space-y-6">
      {/* SUMMARY */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total Users"
          value={totalUsers}
          description="Registered accounts"
        />
        <SummaryCard
          label="Support Agents"
          value={totalAgents}
          description="Team members"
        />
        <SummaryCard
          label="Customers"
          value={totalCustomers}
          description="Customer accounts"
        />
        <SummaryCard
          label="Active Users"
          value={activeUsers}
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
              placeholder="Search name, email, or ID..."
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
              <option value="All">All Roles</option>
              <option value="Agent">Agents</option>
              <option value="Customer">Customers</option>
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
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
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
            {filteredUsers.length} users
          </span>
        </div>

        <div className="overflow-x-auto">
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
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-white/60 transition hover:bg-white/40"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        style={{
                          width: "42px",
                          height: "42px",
                          flexShrink: 0,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: user.color,
                          color: user.textColor,
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {user.initials}
                      </span>

                      <div>
                        <p className="text-sm font-semibold text-emerald-950">
                          {user.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <Badge value={user.role} type="role" />
                  </td>

                  <td className="px-5 py-4">
                    <Badge value={user.status} type="status" />
                  </td>

                  <td className="px-5 py-4 text-sm text-slate-600">
                    {user.tickets}
                  </td>

                  <td className="px-5 py-4 text-xs text-slate-600">
                    {user.joined}
                  </td>

                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}

              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-slate-500"
                  >
                    No users match your search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* USER DETAILS MODAL */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedUserId(null);
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
              <div>
                <p className="text-xs font-semibold text-emerald-700">
                  {selectedUser.id}
                </p>
                <h2
                  id="user-modal-title"
                  className="mt-2 text-xl font-semibold text-emerald-950"
                >
                  {selectedUser.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedUser.email}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
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
                  <Badge value={selectedUser.role} type="role" />
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500">Tickets</p>
                <p className="mt-2 text-sm font-semibold text-emerald-950">
                  {selectedUser.tickets}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Joined</p>
                <p className="mt-2 text-sm text-slate-700">
                  {selectedUser.joined}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Status</p>
                <div className="mt-2">
                  <Badge value={selectedUser.status} type="status" />
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="manage-user-role"
                  className="mb-2 block text-xs font-semibold text-slate-600"
                >
                  User Role
                </label>
                <select
                  id="manage-user-role"
                  value={selectedUser.role}
                  onChange={(event) =>
                    updateUser(
                      selectedUser.id,
                      "role",
                      event.target.value
                    )
                  }
                  style={inputStyle}
                >
                  <option value="Agent">Agent</option>
                  <option value="Customer">Customer</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="manage-user-status"
                  className="mb-2 block text-xs font-semibold text-slate-600"
                >
                  Account Status
                </label>
                <select
                  id="manage-user-status"
                  value={selectedUser.status}
                  onChange={(event) =>
                    updateUser(
                      selectedUser.id,
                      "status",
                      event.target.value
                    )
                  }
                  style={inputStyle}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Changes are currently saved only in this page's state.
              Backend integration will be added later.
            </p>

            <div className="mt-7 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}