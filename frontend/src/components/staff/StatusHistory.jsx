import { statusHistoryRows } from "./staffFormat.js";

// A ticket's status changes for the staff views, oldest first. Collapsible so it does not
// crowd the ticket header; `defaultOpen` starts it expanded.
export default function StatusHistory({ ticket, defaultOpen = false, className = "" }) {
  const rows = statusHistoryRows(ticket?.statusHistory, ticket?.status);

  return (
    <details className={className} open={defaultOpen || undefined}>
      <summary className="cursor-pointer select-none text-[11px] font-semibold text-[#60796e] hover:text-[#2e8666]">
        Status history
        {rows.length > 0 && (
          <span className="ml-1 font-normal text-[#8b9d93]">
            · {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </span>
        )}
      </summary>

      {rows.length === 0 ? (
        <p className="mt-2 text-[12px] text-[#8b9d93]">
          No status changes recorded.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#40584e]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#83dcb2]" aria-hidden="true" />
              <span className="font-medium">{row.title}</span>

              {row.current && (
                <span className="rounded-full bg-[#def3e6] px-2 py-0.5 text-[10px] font-semibold text-[#348264]">
                  Current
                </span>
              )}

              {row.at ? (
                <time dateTime={row.at} className="text-[#7b8f88]">{row.when}</time>
              ) : (
                <span className="text-[#7b8f88]">Time not recorded</span>
              )}

              {row.by && <span className="text-[#7b8f88]">by {row.by}</span>}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
