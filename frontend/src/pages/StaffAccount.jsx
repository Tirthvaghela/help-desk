import { useNavigate } from "react-router";
import HelpDeskHeader from "../components/common/helpdeskheader.jsx";
import AccountSecurity from "../components/account/AccountSecurity.jsx";
import { useAuth } from "../auth/useAuth.js";
import { dashboardPathFor } from "../auth/session.js";

// Account settings for agents and admins (email and password), in the dashboard frame.
export default function StaffAccount() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dashboard = dashboardPathFor(user?.role) ?? "/staff/login";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#b9dfd0] px-2 py-3 sm:px-5 sm:py-6 lg:px-10 lg:py-8">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 53% 2%, rgba(0, 157, 115, 0.85) 0%, transparent 39%),
            radial-gradient(ellipse at 8% 5%, rgba(188, 224, 171, 0.85) 0%, transparent 43%),
            radial-gradient(ellipse at 95% 15%, rgba(171, 220, 187, 0.85) 0%, transparent 45%),
            radial-gradient(ellipse at 8% 92%, rgba(121, 210, 251, 0.75) 0%, transparent 50%),
            radial-gradient(ellipse at 95% 100%, rgba(180, 199, 255, 0.80) 0%, transparent 55%),
            linear-gradient(145deg, #b8dec4 0%, #b5e6d8 48%, #d5e4fb 100%)
          `,
        }}
      />

      <div className="relative z-10 mx-auto min-h-[calc(100vh-4rem)] min-w-0 max-w-[1500px] rounded-[22px] border border-white/70 bg-white/15 p-3 shadow-[0_20px_70px_rgba(31,76,65,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-2xl sm:rounded-[28px] sm:p-5 lg:rounded-[32px] lg:p-6">
        <HelpDeskHeader
          role={user?.role}
          activePage="Account"
          onNavigate={(page) => navigate(`${dashboard}?page=${encodeURIComponent(page)}`)}
        />

        <main className="mx-auto mt-4 max-w-2xl rounded-[20px] border border-white/75 bg-white/15 p-3 sm:rounded-[26px] sm:p-6">
          <div className="mb-5 sm:mb-6">
            <h1 className="text-[23px] font-medium tracking-[-0.8px] text-[#1d302d] sm:text-[27px]">Account settings</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#536b65] sm:text-[14px]">
              Change the email you sign in with or your password.
            </p>
          </div>
          <AccountSecurity />
        </main>
      </div>
    </div>
  );
}
