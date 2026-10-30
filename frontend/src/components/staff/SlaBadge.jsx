import { slaDisplay } from "./slaFormat.js";

const STATE_STYLES = {
  due: "bg-[#e4efff] text-[#2f5f94]",
  due_soon: "bg-[#fff0d9] text-[#855510]",
  overdue: "bg-[#ffe3df] text-[#a32f27]",
  met: "bg-[#def3e6] text-[#1f6b4c]",
  missed: "bg-[#ffe3df] text-[#a32f27]",
  no_sla: "bg-[#eef2ef] text-[#55675e]",
};

const SIZES = {
  small: "px-3 py-1 text-[10px]",
  medium: "px-3 py-1.5 text-[11px]",
};

// A ticket's SLA state for the staff views. The time left is worked out when the badge renders,
// so it follows ticket refreshes; there is no timer. `now` is for tests.
export default function SlaBadge({ ticket, size = "medium", now }) {
  const { state, label, title } = slaDisplay(ticket, now);

  return (
    <span
      data-sla-state={state}
      title={title}
      className={`inline-block whitespace-nowrap rounded-full font-semibold ${SIZES[size]} ${STATE_STYLES[state]}`}
    >
      <span className="sr-only">SLA: </span>
      {label}
    </span>
  );
}
