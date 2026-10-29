import { useState } from "react";
import { Card, ErrorAlert, FieldError, formatDate, inputClass, labelClass, primaryButtonClass, secondaryButtonClass, SuccessAlert } from "../../components/customer/ui.jsx";
import { useAuth } from "../../auth/useAuth.js";
import { authErrorMessage } from "./validation.js";
import AccountSecurity from "../../components/account/AccountSecurity.jsx";

const NAME_MIN = 2;
const NAME_MAX = 80;

// The signed-in customer's details. Only the name can be changed (PATCH /api/auth/me);
// email and password changes need their own verified flows, which the API does not offer yet.
export default function Profile() {
  const { user, updateProfile, endSessionIfRejected } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setName(user?.name ?? "");
    setFieldError(null);
    setError(null);
    setSaved(false);
    setEditing(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError(null);

    const trimmed = name.trim();
    const invalid =
      trimmed.length < NAME_MIN
        ? `Name must be at least ${NAME_MIN} characters.`
        : trimmed.length > NAME_MAX
          ? `Name must be at most ${NAME_MAX} characters.`
          : null;
    setFieldError(invalid);
    if (invalid) return;

    setSaving(true);
    try {
      await updateProfile({ name: trimmed });
      setEditing(false);
      setSaved(true);
    } catch (saveError) {
      if (!endSessionIfRejected(saveError)) setError(authErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    { label: "Email", value: user?.email },
    { label: "Account type", value: "Customer" },
    { label: "Member since", value: formatDate(user?.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-1px] text-[#172d2a] sm:text-[32px]">Your profile</h1>
        <p className="mt-1 text-[13px] text-[#5b746c]">The details we have for your account.</p>
      </div>

      <SuccessAlert>{saved && "Your name was updated."}</SuccessAlert>

      <Card>
        <dl className="divide-y divide-[#e6eee9]">
          <div className="grid gap-1 pb-4 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className="pt-0.5 text-[12px] font-semibold text-[#5b746c]">Name</dt>
            <dd className="text-[14px] text-[#1d302d]">
              {editing ? (
                <form onSubmit={handleSubmit} noValidate className="space-y-3">
                  <label htmlFor="profile-name" className={labelClass}>Your name</label>
                  <input
                    id="profile-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={saving}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? "profile-name-error" : undefined}
                    className={inputClass}
                  />
                  <FieldError id="profile-name-error">{fieldError}</FieldError>
                  <ErrorAlert>{error}</ErrorAlert>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={saving} aria-busy={saving} className={primaryButtonClass}>
                      {saving ? "Saving…" : "Save name"}
                    </button>
                    <button type="button" onClick={() => setEditing(false)} disabled={saving} className={secondaryButtonClass}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="break-words">{user?.name || "—"}</span>
                  <button type="button" onClick={startEditing} className={secondaryButtonClass}>
                    Edit name
                  </button>
                </div>
              )}
            </dd>
          </div>
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 py-4 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="text-[12px] font-semibold text-[#5b746c]">{row.label}</dt>
              <dd className="break-all text-[14px] text-[#1d302d]">{row.value || "—"}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <AccountSecurity />
    </div>
  );
}
