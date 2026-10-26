import { Routes, Route, Navigate } from "react-router";

import Layout from "./components/Layout.jsx";
import HomePage from "./pages/HomePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import StaffLogin from "./pages/StaffLogin.jsx";

import AgentDashboard from "./pages/agent/AgentDashboard.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";

// Temporary frontend role protection.
// Real authentication will be connected later.
function StaffRoute({ role, children }) {
  const savedRole = sessionStorage.getItem("helpdesk_staff_role");

  if (savedRole !== role) {
    return <Navigate to="/staff/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      {/* EXISTING HOMEPAGE — UNCHANGED */}
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
      </Route>

      {/* STAFF LOGIN */}
      <Route
        path="/staff/login"
        element={<StaffLogin />}
      />

      {/* AGENT DASHBOARD */}
      <Route
        path="/agent/dashboard"
        element={
          <StaffRoute role="agent">
            <AgentDashboard />
          </StaffRoute>
        }
      />

      {/* ADMIN DASHBOARD */}
      <Route
        path="/admin/dashboard"
        element={
          <StaffRoute role="admin">
            <AdminDashboard />
          </StaffRoute>
        }
      />

      {/* 404 PAGE */}
      <Route
        path="*"
        element={<NotFoundPage />}
      />
    </Routes>
  );
}