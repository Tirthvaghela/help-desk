import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import AuthShell from "../../components/customer/AuthShell.jsx";
import { ErrorAlert, linkClass, primaryButtonClass, SuccessAlert } from "../../components/customer/ui.jsx";
import { tokenFromSearch } from "../../components/account/accountValidation.js";
import { accountErrorMessage, verifyEmailChange } from "../../api/account.js";
import { useAuth } from "../../auth/useAuth.js";
import { homePathFor } from "../../auth/session.js";

// Opened from the confirmation link sent to a new email address (/verify-email?token=…).
// Confirms once; the token is removed from the address bar straight away.
export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, user, restoreSession } = useAuth();
  const [token] = useState(() => tokenFromSearch(location.search));
  const [state, setState] = useState(token ? { kind: "working" } : { kind: "error", message: "This confirmation link is invalid." });
  const started = useRef(false);

  useEffect(() => {
    if (location.search) navigate("/verify-email", { replace: true });
  }, [location.search, navigate]);

  useEffect(() => {
    // The link is single-use, so it must be sent once even if the effect runs twice.
    if (!token || started.current) return;
    started.current = true;
    verifyEmailChange(token).then(
      (result) => {
        setState({ kind: "done", email: result.email });
        restoreSession(); // a signed-in user sees the new address everywhere
      },
      (verifyError) => setState({ kind: "error", message: accountErrorMessage(verifyError) }),
    );
  }, [token, restoreSession]);

  const home = status === "authenticated" ? homePathFor(user?.role) : null;

  return (
    <AuthShell title="Confirm your email" subtitle="Confirming the new address for your Help Desk account.">
      {state.kind === "working" && <p role="status" className="text-[13px] text-[#5b746c]">Confirming…</p>}
      {state.kind === "done" && (
        <div className="space-y-4">
          <SuccessAlert>
            Your sign-in email is now <span className="break-all">{state.email}</span>.
          </SuccessAlert>
          {home ? (
            <Link to={home} className={`${primaryButtonClass} w-full`}>Continue</Link>
          ) : (
            <p className="text-[13px] text-[#5b746c]">
              Sign in with it: <Link to="/login" className={linkClass}>customer</Link> or{" "}
              <Link to="/staff/login" className={linkClass}>staff</Link>.
            </p>
          )}
        </div>
      )}
      {state.kind === "error" && (
        <div className="space-y-4">
          <ErrorAlert>{state.message}</ErrorAlert>
          <p className="text-[13px] text-[#5b746c]">
            You can request a new link from your account settings after signing in.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
