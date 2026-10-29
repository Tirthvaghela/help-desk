import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../../auth/useAuth.js";
import { CUSTOMER_HOME, CUSTOMER_ONLY_MESSAGE, homePathFor } from "../../auth/session.js";
import AuthShell from "../../components/customer/AuthShell.jsx";
import { ErrorAlert, FieldError, inputClass, labelClass, linkClass, primaryButtonClass } from "../../components/customer/ui.jsx";
import { authErrorMessage, returnPath, validateLogin } from "./validation.js";

export default function CustomerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, user, notice, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in: go to the right area for the role.
  const signedInHome = status === "authenticated" ? homePathFor(user?.role) : null;
  if (signedInHome && !submitting) {
    return <Navigate to={user.role === "customer" ? returnPath(location.state, signedInHome) : signedInHome} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const errors = validateLogin({ email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password, { allowedRoles: ["customer"] });
      navigate(returnPath(location.state, CUSTOMER_HOME), { replace: true });
    } catch (loginError) {
      setError(
        loginError.code === "ROLE_NOT_ALLOWED" ? (
          <>
            {CUSTOMER_ONLY_MESSAGE}{" "}
            <Link to="/staff/login" className={linkClass}>Go to staff sign-in</Link>
          </>
        ) : (
          authErrorMessage(loginError)
        ),
      );
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to raise a ticket or check on an existing one."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" state={location.state} className={linkClass}>Create an account</Link>
          <span className="mx-2 text-[#c3d1ca]">·</span>
          <Link to="/staff/login" className={linkClass}>Staff sign-in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="customer-email" className={labelClass}>Email address</label>
          <input
            id="customer-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "customer-email-error" : undefined}
            placeholder="you@example.com"
            className={inputClass}
          />
          <FieldError id="customer-email-error">{fieldErrors.email}</FieldError>
        </div>

        <div>
          <label htmlFor="customer-password" className={labelClass}>Password</label>
          <div className="flex items-center gap-2">
            <input
              id="customer-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "customer-password-error" : undefined}
              placeholder="Your password"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowPassword((previous) => !previous)}
              aria-pressed={showPassword}
              aria-controls="customer-password"
              className="shrink-0 rounded-lg bg-[#eef4f0] px-3 py-3 text-[11px] font-semibold text-[#4c7060] transition hover:bg-[#e1eee5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <FieldError id="customer-password-error">{fieldErrors.password}</FieldError>
          <p className="mt-2 text-right text-[12px]">
            <Link to="/forgot-password" className={linkClass}>Forgot password?</Link>
          </p>
        </div>

        <ErrorAlert>{error || notice}</ErrorAlert>

        <button type="submit" disabled={submitting} aria-busy={submitting} className={`${primaryButtonClass} w-full`}>
          {submitting ? "Signing in…" : "Sign in →"}
        </button>
      </form>
    </AuthShell>
  );
}
