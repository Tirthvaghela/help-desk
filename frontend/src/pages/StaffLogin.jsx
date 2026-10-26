import { useState } from "react";
import { useNavigate } from "react-router";

export default function StaffLogin() {
  const navigate = useNavigate();

  const [role, setRole] = useState("agent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    // Temporary frontend session.
    // Replace with real authentication after backend integration.
    sessionStorage.setItem("helpdesk_staff_role", role);

    navigate(
      role === "admin"
        ? "/admin/dashboard"
        : "/agent/dashboard",
      { replace: true }
    );
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#c5e6d7] px-4 py-10 sm:px-6">

      {/* BACKGROUND */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 50% 0%, rgba(33,165,125,0.45), transparent 48%),
            radial-gradient(ellipse at 0% 100%, rgba(130,190,245,0.6), transparent 55%),
            radial-gradient(ellipse at 100% 100%, rgba(191,208,255,0.7), transparent 55%),
            linear-gradient(145deg, #d4ecdb, #e8f4f3 55%, #dce9fb)
          `,
        }}
      />

      {/* LOGIN CONTAINER */}
      <div className="relative z-10 grid w-full max-w-[1050px] overflow-hidden rounded-[30px] border border-white/80 bg-white/75 shadow-[0_25px_80px_rgba(39,82,75,0.13)] backdrop-blur-2xl md:grid-cols-2">

        {/* LEFT PANEL */}
        <div className="flex min-h-[300px] flex-col justify-between bg-gradient-to-br from-[#dcefe5]/80 to-[#e8f1fa]/80 p-7 sm:p-10 md:min-h-[600px] md:p-12">

          {/* LOGO */}
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#172d2a]">
              <span className="h-4 w-4 rounded-full bg-[#83dcb2]" />
            </span>

            <span className="text-[19px] font-semibold tracking-[-0.5px] text-[#172d2a]">
              Help Desk
            </span>
          </div>

          {/* BRAND MESSAGE */}
          <div className="my-12 md:my-0">
            <span className="mb-5 inline-block rounded-full border border-[#badbca] bg-white/55 px-4 py-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#3b8165]">
              Support Management
            </span>

            <h1 className="max-w-[420px] text-[38px] font-semibold leading-[1.13] tracking-[-1.8px] text-[#172d2a] sm:text-[46px]">
              Every request,
              <br />
              one calm thread.
            </h1>

            <p className="mt-6 max-w-[380px] text-[14px] leading-7 text-[#5b746c]">
              A smarter workspace for support teams.
              Manage customer requests, collaborate
              efficiently, and keep every conversation
              organized in one place.
            </p>
          </div>

          <p className="text-[12px] text-[#7b9489]">
            Organized support. Better experiences.
          </p>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex flex-col justify-center bg-white/85 p-7 sm:p-10 md:p-12">

          <div className="mb-8">
            <h2 className="text-[29px] font-semibold tracking-[-1px] text-[#1d302d]">
              Welcome back
            </h2>

            <p className="mt-2 text-[13px] leading-relaxed text-[#7b8f88]">
              Sign in to access your support workspace.
            </p>
          </div>

          {/* ROLE SELECTION */}
          <div className="mb-7">
            <p className="mb-3 text-[12px] font-semibold text-[#40584e]">
              Workspace
            </p>

            <div className="grid grid-cols-2 gap-1 rounded-[15px] bg-[#eef4f0] p-1.5">
              {["agent", "admin"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRole(item)}
                  className={`rounded-[11px] px-4 py-3 text-[13px] font-semibold capitalize transition ${
                    role === item
                      ? "bg-white text-[#1e4738] shadow-[0_3px_12px_rgba(32,75,55,0.09)]"
                      : "text-[#74887e] hover:text-[#294f3d]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* LOGIN FORM */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* EMAIL */}
            <div>
              <label
                htmlFor="staff-email"
                className="mb-2 block text-[12px] font-semibold text-[#40584e]"
              >
                Email address
              </label>

              <input
                id="staff-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your work email"
                autoComplete="email"
                className="w-full rounded-[14px] border border-[#dce8e1] bg-white px-4 py-3.5 text-[13px] text-[#243e35] outline-none transition placeholder:text-[#a2b0a8] focus:border-[#70b995] focus:ring-2 focus:ring-[#70b995]/15"
              />
            </div>

            {/* PASSWORD */}
            <div>
              <label
                htmlFor="staff-password"
                className="mb-2 block text-[12px] font-semibold text-[#40584e]"
              >
                Password
              </label>

              <div className="flex items-center rounded-[14px] border border-[#dce8e1] bg-white focus-within:border-[#70b995] focus-within:ring-2 focus-within:ring-[#70b995]/15">
                <input
                  id="staff-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[13px] text-[#243e35] outline-none placeholder:text-[#a2b0a8]"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((previous) => !previous)
                  }
                  className="mr-2 rounded-lg bg-[#eef4f0] px-3 py-2 text-[11px] font-semibold text-[#4c7060] transition hover:bg-[#e1eee5]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* ERROR */}
            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-[12px] text-red-600">
                {error}
              </p>
            )}

            {/* SIGN IN */}
            <button
              type="submit"
              className="w-full rounded-[14px] bg-[#168461] px-5 py-3.5 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(22,132,97,0.15)] transition hover:bg-[#106c4e]"
            >
              Sign In →
            </button>
          </form>

          <div className="mt-8 border-t border-[#edf1ee] pt-6">
            <p className="text-center text-[12px] text-[#8a9d92]">
              Secure workspace for authorized support staff
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}