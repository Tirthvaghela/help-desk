import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../../auth/useAuth.js";
import { CUSTOMER_HOME, homePathFor } from "../../auth/session.js";
import AuthShell from "../../components/customer/AuthShell.jsx";
import { ErrorAlert, FieldError, inputClass, labelClass, linkClass, primaryButtonClass } from "../../components/customer/ui.jsx";
import { authErrorMessage, returnPath, validateSignup } from "./validation.js";

const FIELDS = [
  { name: "name", label: "Full name", type: "text", autoComplete: "name", placeholder: "Your name" },
  { name: "email", label: "Email address", type: "email", autoComplete: "email", placeholder: "you@example.com" },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password", placeholder: "At least 8 characters" },
  { name: "confirmPassword", label: "Confirm password", type: "password", autoComplete: "new-password", placeholder: "Type it again" },
];

export default function CustomerSignup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, user, register } = useAuth();

  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const signedInHome = status === "authenticated" ? homePathFor(user?.role) : null;
  if (signedInHome && !submitting) {
    return <Navigate to={signedInHome} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const errors = validateSignup(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await register(values.name.trim(), values.email.trim(), values.password);
      navigate(returnPath(location.state, CUSTOMER_HOME), { replace: true });
    } catch (signupError) {
      setError(authErrorMessage(signupError));
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Sign up to raise support tickets and follow our replies."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" state={location.state} className={linkClass}>Sign in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {FIELDS.map((field) => {
          const id = `signup-${field.name}`;
          const message = fieldErrors[field.name];
          return (
            <div key={field.name}>
              <label htmlFor={id} className={labelClass}>{field.label}</label>
              <input
                id={id}
                type={field.type}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                value={values[field.name]}
                onChange={(event) => setValues((previous) => ({ ...previous, [field.name]: event.target.value }))}
                disabled={submitting}
                aria-invalid={Boolean(message)}
                aria-describedby={message ? `${id}-error` : undefined}
                className={inputClass}
              />
              <FieldError id={`${id}-error`}>{message}</FieldError>
            </div>
          );
        })}

        <ErrorAlert>{error}</ErrorAlert>

        <button type="submit" disabled={submitting} aria-busy={submitting} className={`${primaryButtonClass} w-full`}>
          {submitting ? "Creating account…" : "Create account →"}
        </button>
      </form>
    </AuthShell>
  );
}
