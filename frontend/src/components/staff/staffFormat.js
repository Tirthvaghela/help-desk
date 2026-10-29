// Display helpers shared by the agent and admin dashboards.

export const STATUS_LABELS = Object.freeze({
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
});

export function capitalize(text = "") {
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

// Up to two initials from a name, e.g. "Asha Customer" → "AC".
export function initialsOf(name = "") {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "?"
  );
}

function toDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

// "10:42 AM" today, "Yesterday", otherwise "Oct 22" (or "Oct 22, 2025" in another year).
export function formatShortTime(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return "—";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  if (date >= startOfToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date >= startOfYesterday) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

// "Oct 25, 2026 · 10:42 AM"
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  const day = date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

// Number of pages for a paginated list (at least 1, so "page 1 of 1" for an empty list).
export function pageCount(total, pageSize) {
  return Math.max(1, Math.ceil((Number(total) || 0) / pageSize));
}

// "2026-10-25" (local date), for tables and CSV exports.
export function formatIsoDate(value) {
  const date = toDate(value);
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
