import { Routes, Route } from "react-router";

import HomePage from "./pages/HomePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import StaffLogin from "./pages/StaffLogin.jsx";
import StaffRoute from "./auth/StaffRoute.jsx";
import CustomerRoute from "./auth/CustomerRoute.jsx";

import AgentDashboard from "./pages/agent/AgentDashboard.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";

import CustomerLayout from "./components/customer/CustomerLayout.jsx";
import CustomerLogin from "./pages/customer/CustomerLogin.jsx";
import CustomerSignup from "./pages/customer/CustomerSignup.jsx";
import MyTickets from "./pages/customer/MyTickets.jsx";
import NewTicket from "./pages/customer/NewTicket.jsx";
import TicketDetail from "./pages/customer/TicketDetail.jsx";
import Profile from "./pages/customer/Profile.jsx";
import ForgotPassword from "./pages/account/ForgotPassword.jsx";
import ResetPassword from "./pages/account/ResetPassword.jsx";
import VerifyEmail from "./pages/account/VerifyEmail.jsx";
import StaffAccount from "./pages/StaffAccount.jsx";

export default function App() {
  return (
    <Routes>
      {/* PUBLIC LANDING PAGE */}
      <Route index element={<HomePage />} />

      {/* CUSTOMER SIGN-IN AND SIGN-UP */}
      <Route path="/login" element={<CustomerLogin />} />
      <Route path="/signup" element={<CustomerSignup />} />

      {/* PASSWORD RECOVERY AND EMAIL CONFIRMATION (any role, no sign-in needed) */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* CUSTOMER PORTAL */}
      <Route
        element={
          <CustomerRoute>
            <CustomerLayout />
          </CustomerRoute>
        }
      >
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/tickets/new" element={<NewTicket />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* STAFF LOGIN */}
      <Route
        path="/staff/login"
        element={<StaffLogin />}
      />

      {/* STAFF ACCOUNT SETTINGS */}
      <Route
        path="/staff/account"
        element={
          <StaffRoute role={["agent", "admin"]}>
            <StaffAccount />
          </StaffRoute>
        }
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
