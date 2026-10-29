// Small shared pieces for the customer portal. Colours follow the staff workspace
// (StaffLogin, AgentInbox) so both sides of the app look like one product.

export const inputClass =
  "w-full rounded-[14px] border border-[#dce8e1] bg-white px-4 py-3.5 text-[13px] text-[#243e35] outline-none transition placeholder:text-[#a2b0a8] focus:border-[#70b995] focus:ring-2 focus:ring-[#70b995]/15 disabled:cursor-not-allowed disabled:bg-[#f4f7f5] aria-[invalid=true]:border-red-300";

export const labelClass = "mb-2 block text-[12px] font-semibold text-[#40584e]";

export const primaryButtonClass =
  "inline-flex items-center justify-center rounded-[14px] bg-[#168461] px-5 py-3.5 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(22,132,97,0.15)] transition hover:bg-[#106c4e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-[14px] border border-[#cfe3d8] bg-white/80 px-5 py-3 text-[13px] font-semibold text-[#2c5a47] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40";

export const linkClass =
  "font-semibold text-[#168461] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40 rounded";

// A white glass panel.
export function Card({ as: Tag = "section", className = "", children, ...props }) {
  return (
    <Tag
      className={`rounded-[22px] border border-white/80 bg-white/80 p-5 shadow-[0_10px_40px_rgba(39,82,75,0.08)] backdrop-blur-xl sm:p-7 ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function ErrorAlert({ children, onRetry }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-[12px] text-red-700">
      <span>{children}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-white px-3 py-1.5 font-semibold text-red-700 shadow-sm transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function SuccessAlert({ children }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-xl bg-[#e1f4e9] px-4 py-3 text-[12px] font-medium text-[#24684d]">
      {children}
    </p>
  );
}

// A form field's error message, linked to the input with aria-describedby.
export function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-[12px] text-red-600">
      {children}
    </p>
  );
}

const STATUS_LABELS = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
const STATUS_STYLES = {
  open: "bg-[#e4efff] text-[#4b79b2]",
  in_progress: "bg-[#fff0d9] text-[#a77836]",
  resolved: "bg-[#def3e6] text-[#348264]",
};
const PRIORITY_STYLES = {
  high: "bg-[#ffe7e3] text-[#c45e55]",
  medium: "bg-[#fff0da] text-[#ac7b36]",
  low: "bg-[#e1f4e9] text-[#408267]",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
      {statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  if (!priority) return null;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${PRIORITY_STYLES[priority] ?? "bg-slate-100 text-slate-600"}`}>
      {priority[0].toUpperCase()}{priority.slice(1)} priority
    </span>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function format(formatter, value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? formatter.format(date) : "—";
}

export const formatDate = (value) => format(dateFormat, value);
export const formatDateTime = (value) => format(dateTimeFormat, value);
