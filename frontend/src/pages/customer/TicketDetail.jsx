import { useCallback, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { addComment, getTicket, listComments, TICKET_LIMITS, ticketErrorMessage } from "../../api/tickets.js";
import { useAuth } from "../../auth/useAuth.js";
import {
  Card,
  ErrorAlert,
  FieldError,
  formatDateTime,
  inputClass,
  linkClass,
  PriorityBadge,
  primaryButtonClass,
  StatusBadge,
  statusLabel,
  SuccessAlert,
} from "../../components/customer/ui.jsx";
import { useApiData } from "../../api/useApiData.js";
import { validateComment } from "./validation.js";

// The backend returns comments oldest first. Every comment on a ticket is visible to its owner;
// there are no internal notes in the data model.
function Conversation({ comments, currentUserId }) {
  if (comments.length === 0) {
    return <p className="text-[13px] text-[#6f857b]">No replies yet. Our support team will respond here.</p>;
  }
  return (
    <ol className="space-y-4">
      {comments.map((comment) => {
        const mine = comment.author?.id === currentUserId;
        const authorName = mine ? "You" : comment.author?.name ?? "Support team";
        return (
          <li key={comment.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-[18px] px-4 py-3 sm:max-w-[75%] ${mine ? "rounded-br-md bg-[#d2efdf] text-[#244f3b]" : "rounded-bl-md bg-white text-[#2a3f39] shadow-sm"}`}>
              <p className="text-[11px] font-semibold">
                {authorName}
                {!mine && comment.author?.role !== "customer" && <span className="font-normal text-[#6f857b]"> · Support</span>}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-6">{comment.message}</p>
              <p className="mt-1 text-[11px] text-[#6f857b]">
                <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ReplyForm({ ticket, onPosted }) {
  const { token, endSessionIfRejected } = useAuth();
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const invalid = validateComment(message);
    setFieldError(invalid);
    if (invalid) return;

    setSubmitting(true);
    try {
      const comment = await addComment(token, ticket.id, message.trim());
      setMessage("");
      onPosted(comment);
    } catch (postError) {
      if (endSessionIfRejected(postError)) return;
      setError(ticketErrorMessage(postError, "Your reply could not be sent. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const length = message.trim().length;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3 border-t border-[#e6eee9] pt-5">
      {ticket.status === "resolved" && (
        <p className="text-[12px] text-[#6f857b]">
          This ticket is resolved. You can still reply, but replying does not reopen it.
        </p>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="reply-message" className="text-[12px] font-semibold text-[#40584e]">Your reply</label>
        <span className={`text-[11px] ${length > TICKET_LIMITS.comment.max ? "text-red-600" : "text-[#8a9d92]"}`}>
          {length}/{TICKET_LIMITS.comment.max}
        </span>
      </div>
      <textarea
        id="reply-message"
        rows={4}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        disabled={submitting}
        placeholder="Add more detail or answer our team's questions."
        aria-invalid={Boolean(fieldError)}
        aria-describedby={fieldError ? "reply-message-error" : undefined}
        className={`${inputClass} resize-y`}
      />
      <FieldError id="reply-message-error">{fieldError}</FieldError>
      <ErrorAlert>{error}</ErrorAlert>
      <div className="flex justify-end">
        <button type="submit" disabled={submitting} aria-busy={submitting} className={primaryButtonClass}>
          {submitting ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.8px] text-[#7b8f88]">{label}</dt>
      <dd className="mt-1 text-[13px] text-[#243e35]">{children}</dd>
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();

  const load = useCallback(
    async (token) => {
      const [ticket, comments] = await Promise.all([getTicket(token, id), listComments(token, id)]);
      return { ticket, comments };
    },
    [id],
  );
  const { status, data, error, reload, setData } = useApiData(load);

  const handlePosted = useCallback(
    (comment) => {
      if (comment) setData((previous) => ({ ...previous, comments: [...previous.comments, comment] }));
      else reload();
    },
    [reload, setData],
  );

  // inline-block so the parent's space-y margin applies to it.
  const backLink = <Link to="/tickets" className={`${linkClass} inline-block text-[13px]`}>← Back to my tickets</Link>;

  if (status === "loading" && !data) {
    return (
      <div className="space-y-6">
        {backLink}
        <Card aria-busy="true">
          <p role="status" className="text-[13px] text-[#5b746c]">Loading ticket…</p>
        </Card>
      </div>
    );
  }

  if (status === "error" || !data?.ticket) {
    // Not found and forbidden won't change by retrying; anything else might.
    const permanent = error?.status === 403 || error?.status === 404 || error?.code === "INVALID_ID";
    return (
      <div className="space-y-6">
        {backLink}
        <ErrorAlert onRetry={permanent ? undefined : reload}>
          {ticketErrorMessage(error, "This ticket could not be loaded.")}
        </ErrorAlert>
      </div>
    );
  }

  const { ticket, comments } = data;
  const created = location.state?.created;

  return (
    <div className="space-y-6">
      {backLink}

      <SuccessAlert>{created && `${created} was created. Our team will reply here.`}</SuccessAlert>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#5b8f78]">{ticket.ticketNumber}</p>
            <h1 className="mt-1 break-words text-[22px] font-semibold tracking-[-0.5px] text-[#172d2a] sm:text-[26px]">
              {ticket.subject}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail label="Category">{ticket.category?.name ?? "—"}</Detail>
          <Detail label="Assigned to">{ticket.assignedTo?.name ?? "Not assigned yet"}</Detail>
          <Detail label="Opened">{formatDateTime(ticket.createdAt)}</Detail>
          <Detail label={ticket.resolvedAt ? "Resolved" : "Last updated"}>
            {formatDateTime(ticket.resolvedAt ?? ticket.updatedAt)}
          </Detail>
        </dl>

        <div className="mt-6 border-t border-[#e6eee9] pt-5">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.8px] text-[#7b8f88]">Description</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-7 text-[#243e35]">{ticket.description}</p>
        </div>

        {ticket.statusHistory?.length > 0 && (
          <div className="mt-6 border-t border-[#e6eee9] pt-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.8px] text-[#7b8f88]">Status history</h2>
            <ol className="mt-3 space-y-2">
              {ticket.statusHistory.map((entry, index) => (
                <li key={`${entry.status}-${entry.changedAt}-${index}`} className="flex flex-wrap items-center gap-2 text-[13px] text-[#40584e]">
                  <span className="h-2 w-2 rounded-full bg-[#83dcb2]" aria-hidden="true" />
                  <span className="font-medium">{statusLabel(entry.status)}</span>
                  <time dateTime={entry.changedAt} className="text-[#7b8f88]">{formatDateTime(entry.changedAt)}</time>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>

      <Card aria-labelledby="conversation-heading">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="conversation-heading" className="text-[18px] font-semibold text-[#1d302d]">Conversation</h2>
          <button
            type="button"
            onClick={reload}
            disabled={status === "loading"}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#168461] transition hover:bg-[#e1f4e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40 disabled:opacity-60"
          >
            {status === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <Conversation comments={comments} currentUserId={user?.id} />
        <div className="mt-6">
          <ReplyForm ticket={ticket} onPosted={handlePosted} />
        </div>
      </Card>
    </div>
  );
}
