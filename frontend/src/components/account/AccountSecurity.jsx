import { useCallback, useId, useState } from "react";
import { useAuth } from "../../auth/useAuth.js";
import { useApiData } from "../../api/useApiData.js";
import { accountErrorMessage, cancelEmailChange, getPendingEmailChange, requestEmailChange } from "../../api/account.js";
import { Card, ErrorAlert, FieldError, formatDateTime, inputClass, labelClass, primaryButtonClass, secondaryButtonClass, SuccessAlert } from "../customer/ui.jsx";
import { validateEmailChange, validatePasswordChange } from "./accountValidation.js";

// Email and password settings for any signed-in user (customer profile and staff account
// page). Nothing is shown as done until the server confirms it.

export function PasswordInput({ id, value, onChange, disabled, autoComplete, invalid, describedBy, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={inputClass}
      />
      <button
        type="button"
        onClick={() => setVisible((previous) => !previous)}
        aria-pressed={visible}
        aria-controls={id}
        aria-label={visible ? "Hide password" : "Show password"}
        className="shrink-0 rounded-lg bg-[#eef4f0] px-3 py-3 text-[11px] font-semibold text-[#4c7060] transition hover:bg-[#e1eee5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function EmailSection() {
  const { user, token, endSessionIfRejected } = useAuth();
  const ids = useId();
  const loadPending = useCallback((authToken) => getPendingEmailChange(authToken), []);
  const pending = useApiData(loadPending);

  const [values, setValues] = useState({ newEmail: "", currentPassword: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pendingEmail = pending.data?.pendingEmail;

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (requestError) {
      if (!endSessionIfRejected(requestError)) setError(accountErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    const errors = validateEmailChange(values, user?.email);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    run(async () => {
      const result = await requestEmailChange(token, { newEmail: values.newEmail.trim(), currentPassword: values.currentPassword });
      pending.setData(() => result);
      setValues({ newEmail: "", currentPassword: "" });
    });
  };

  const handleCancel = () =>
    run(async () => {
      await cancelEmailChange(token);
      pending.setData(() => ({ pendingEmail: null, expiresAt: null }));
    });

  return (
    <Card aria-labelledby={`${ids}-email`}>
      <h2 id={`${ids}-email`} className="text-[17px] font-semibold text-[#1d302d]">Email address</h2>
      <p className="mt-1 text-[13px] text-[#5b746c]">
        You sign in with <span className="break-all font-semibold text-[#1d302d]">{user?.email}</span>.
      </p>

      {pendingEmail && (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff6e6] px-4 py-3 text-[12px] text-[#7a5418]">
          <span>
            Waiting for confirmation of <strong className="break-all">{pendingEmail}</strong>. Open the link we sent there
            {pending.data?.expiresAt ? ` before ${formatDateTime(pending.data.expiresAt)}` : ""}.
          </span>
          <button type="button" onClick={handleCancel} disabled={busy} className="font-semibold underline disabled:opacity-60">
            Cancel change
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
        <div>
          <label htmlFor={`${ids}-new-email`} className={labelClass}>New email address</label>
          <input
            id={`${ids}-new-email`}
            type="email"
            autoComplete="email"
            value={values.newEmail}
            onChange={(event) => setValues((previous) => ({ ...previous, newEmail: event.target.value }))}
            disabled={busy}
            aria-invalid={Boolean(fieldErrors.newEmail)}
            aria-describedby={fieldErrors.newEmail ? `${ids}-new-email-error` : undefined}
            className={inputClass}
          />
          <FieldError id={`${ids}-new-email-error`}>{fieldErrors.newEmail}</FieldError>
        </div>
        <div>
          <label htmlFor={`${ids}-email-password`} className={labelClass}>Current password</label>
          <PasswordInput
            id={`${ids}-email-password`}
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={(event) => setValues((previous) => ({ ...previous, currentPassword: event.target.value }))}
            disabled={busy}
            invalid={Boolean(fieldErrors.currentPassword)}
            describedBy={fieldErrors.currentPassword ? `${ids}-email-password-error` : undefined}
          />
          <FieldError id={`${ids}-email-password-error`}>{fieldErrors.currentPassword}</FieldError>
        </div>
        <ErrorAlert>{error}</ErrorAlert>
        <button type="submit" disabled={busy} aria-busy={busy} className={primaryButtonClass}>
          {busy ? "Sending…" : "Send confirmation link"}
        </button>
        <p className="text-[12px] text-[#6f857b]">
          Your email changes only after you open the link we send to the new address.
        </p>
      </form>
    </Card>
  );
}

function PasswordSection() {
  const { changePassword, endSessionIfRejected } = useAuth();
  const ids = useId();
  const empty = { currentPassword: "", newPassword: "", confirmPassword: "" };
  const [values, setValues] = useState(empty);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const field = (name) => ({
    id: `${ids}-${name}`,
    value: values[name],
    onChange: (event) => setValues((previous) => ({ ...previous, [name]: event.target.value })),
    disabled: busy,
    invalid: Boolean(fieldErrors[name]),
    describedBy: fieldErrors[name] ? `${ids}-${name}-error` : undefined,
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setDone(false);
    const errors = validatePasswordChange(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setValues(empty);
      setDone(true);
    } catch (changeError) {
      if (!endSessionIfRejected(changeError)) setError(accountErrorMessage(changeError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby={`${ids}-password`}>
      <h2 id={`${ids}-password`} className="text-[17px] font-semibold text-[#1d302d]">Password</h2>
      <p className="mt-1 text-[13px] text-[#5b746c]">Changing it signs you out on your other devices.</p>

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
        <div>
          <label htmlFor={`${ids}-currentPassword`} className={labelClass}>Current password</label>
          <PasswordInput {...field("currentPassword")} autoComplete="current-password" />
          <FieldError id={`${ids}-currentPassword-error`}>{fieldErrors.currentPassword}</FieldError>
        </div>
        <div>
          <label htmlFor={`${ids}-newPassword`} className={labelClass}>New password</label>
          <PasswordInput {...field("newPassword")} autoComplete="new-password" placeholder="At least 8 characters" />
          <FieldError id={`${ids}-newPassword-error`}>{fieldErrors.newPassword}</FieldError>
        </div>
        <div>
          <label htmlFor={`${ids}-confirmPassword`} className={labelClass}>Confirm new password</label>
          <PasswordInput {...field("confirmPassword")} autoComplete="new-password" />
          <FieldError id={`${ids}-confirmPassword-error`}>{fieldErrors.confirmPassword}</FieldError>
        </div>
        <ErrorAlert>{error}</ErrorAlert>
        <SuccessAlert>{done && "Your password was changed. You were signed out on other devices."}</SuccessAlert>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} aria-busy={busy} className={primaryButtonClass}>
            {busy ? "Saving…" : "Change password"}
          </button>
          {(values.currentPassword || values.newPassword || values.confirmPassword) && (
            <button type="button" onClick={() => { setValues(empty); setFieldErrors({}); }} disabled={busy} className={secondaryButtonClass}>
              Clear
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}

export default function AccountSecurity() {
  return (
    <div className="space-y-6">
      <EmailSection />
      <PasswordSection />
    </div>
  );
}
