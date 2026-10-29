import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import AuthShell from "../../components/customer/AuthShell.jsx";
import { ErrorAlert, FieldError, labelClass, linkClass, primaryButtonClass, SuccessAlert } from "../../components/customer/ui.jsx";
import { PasswordInput } from "../../components/account/AccountSecurity.jsx";
import { tokenFromSearch, validateResetPassword } from "../../components/account/accountValidation.js";
import { accountErrorMessage, checkResetToken, resetPassword } from "../../api/account.js";

const EXPIRED_TEXT = "This reset link is invalid, has expired or was already used.";

// Step 2 of password recovery, opened from the link in the email (/reset-password?token=…).
// The token is moved out of the address bar straight away, then checked with the server.
export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => tokenFromSearch(location.search));
  const [linkState, setLinkState] = useState(token ? "checking" : "invalid"); // checking | valid | invalid | error
  const [values, setValues] = useState({ newPassword: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (location.search) navigate("/reset-password", { replace: true });
  }, [location.search, navigate]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    checkResetToken(token).then(
      () => active && setLinkState("valid"),
      (checkError) => active && setLinkState(checkError?.code === "INVALID_OR_EXPIRED_TOKEN" ? "invalid" : "error"),
    );
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const errors = validateResetPassword(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await resetPassword(token, values.newPassword);
      setDone(result.message);
    } catch (resetError) {
      if (resetError?.code === "INVALID_OR_EXPIRED_TOKEN") setLinkState("invalid");
      else setError(accountErrorMessage(resetError));
    } finally {
      setSubmitting(false);
    }
  };

  const field = (name) => ({
    id: `reset-${name}`,
    value: values[name],
    onChange: (event) => setValues((previous) => ({ ...previous, [name]: event.target.value })),
    disabled: submitting,
    invalid: Boolean(fieldErrors[name]),
    describedBy: fieldErrors[name] ? `reset-${name}-error` : undefined,
  });

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Use at least 8 characters. You'll sign in with it afterwards."
      footer={
        <>
          <Link to="/login" className={linkClass}>Customer sign-in</Link>
          <span className="mx-2 text-[#c3d1ca]">·</span>
          <Link to="/staff/login" className={linkClass}>Staff sign-in</Link>
        </>
      }
    >
      {done ? (
        <div className="space-y-4">
          <SuccessAlert>{done}</SuccessAlert>
          <p className="text-[13px] text-[#5b746c]">
            For your security you were signed out everywhere. Sign in with your new password:{" "}
            <Link to="/login" className={linkClass}>customer</Link> or <Link to="/staff/login" className={linkClass}>staff</Link>.
          </p>
        </div>
      ) : linkState === "checking" ? (
        <p role="status" className="text-[13px] text-[#5b746c]">Checking your reset link…</p>
      ) : linkState === "invalid" ? (
        <div className="space-y-4">
          <ErrorAlert>{EXPIRED_TEXT}</ErrorAlert>
          <Link to="/forgot-password" className={`${primaryButtonClass} w-full`}>Request a new link</Link>
        </div>
      ) : linkState === "error" ? (
        <ErrorAlert onRetry={() => window.location.reload()}>We couldn't check your reset link. Please try again.</ErrorAlert>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="reset-newPassword" className={labelClass}>New password</label>
            <PasswordInput {...field("newPassword")} autoComplete="new-password" placeholder="At least 8 characters" />
            <FieldError id="reset-newPassword-error">{fieldErrors.newPassword}</FieldError>
          </div>
          <div>
            <label htmlFor="reset-confirmPassword" className={labelClass}>Confirm new password</label>
            <PasswordInput {...field("confirmPassword")} autoComplete="new-password" />
            <FieldError id="reset-confirmPassword-error">{fieldErrors.confirmPassword}</FieldError>
          </div>
          <ErrorAlert>{error}</ErrorAlert>
          <button type="submit" disabled={submitting} aria-busy={submitting} className={`${primaryButtonClass} w-full`}>
            {submitting ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
