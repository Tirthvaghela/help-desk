import { useState } from "react";
import { Link } from "react-router";
import AuthShell from "../../components/customer/AuthShell.jsx";
import { ErrorAlert, FieldError, inputClass, labelClass, linkClass, primaryButtonClass, SuccessAlert } from "../../components/customer/ui.jsx";
import { accountErrorMessage, requestPasswordReset } from "../../api/account.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Step 1 of password recovery. The answer is the same whether or not the email has an
// account, so the page cannot be used to discover registered addresses.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [sentMessage, setSentMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const value = email.trim();
    const invalid = !value ? "Enter your email address." : !EMAIL_PATTERN.test(value) ? "Enter a valid email address." : null;
    setFieldError(invalid);
    if (invalid) return;

    setSubmitting(true);
    try {
      const result = await requestPasswordReset(value);
      setSentMessage(result.message);
    } catch (requestError) {
      setError(accountErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter the email you sign in with and we'll send you a link to choose a new password."
      footer={
        <>
          Remembered it? <Link to="/login" className={linkClass}>Customer sign-in</Link>
          <span className="mx-2 text-[#c3d1ca]">·</span>
          <Link to="/staff/login" className={linkClass}>Staff sign-in</Link>
        </>
      }
    >
      {sentMessage ? (
        <div className="space-y-4">
          <SuccessAlert>{sentMessage}</SuccessAlert>
          <p className="text-[13px] leading-relaxed text-[#5b746c]">
            The link works once and expires soon. Didn't get an email? Check your spam folder, or{" "}
            <button type="button" onClick={() => setSentMessage(null)} className={linkClass}>try again</button>.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="forgot-email" className={labelClass}>Email address</label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? "forgot-email-error" : undefined}
              placeholder="you@example.com"
              className={inputClass}
            />
            <FieldError id="forgot-email-error">{fieldError}</FieldError>
          </div>
          <ErrorAlert>{error}</ErrorAlert>
          <button type="submit" disabled={submitting} aria-busy={submitting} className={`${primaryButtonClass} w-full`}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
