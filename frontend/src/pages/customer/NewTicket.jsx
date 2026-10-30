import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  createTicket,
  listCategories,
  submissionFor,
  TICKET_LIMITS,
  TICKET_PRIORITIES,
  ticketErrorMessage,
} from "../../api/tickets.js";
import { useAuth } from "../../auth/useAuth.js";
import { Card, ErrorAlert, FieldError, inputClass, labelClass, linkClass, primaryButtonClass, secondaryButtonClass } from "../../components/customer/ui.jsx";
import { useApiData } from "../../api/useApiData.js";
import { CATEGORY_UNAVAILABLE_MESSAGE, isInactiveCategoryError, validateTicket } from "./validation.js";

function categoriesErrorMessage(error) {
  if (error?.status === 404) return "Ticket categories are not available from the server yet.";
  return ticketErrorMessage(error, "Ticket categories could not be loaded.");
}

function Counter({ value, max }) {
  const length = value.trim().length;
  return (
    <span className={`text-[11px] ${length > max ? "text-red-600" : "text-[#8a9d92]"}`}>
      {length}/{max}
    </span>
  );
}

export default function NewTicket() {
  const navigate = useNavigate();
  const { token, endSessionIfRejected } = useAuth();
  const categories = useApiData(listCategories);

  const [values, setValues] = useState({ subject: "", description: "", categoryId: "", priority: "medium" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // The last submission's { payload, key }: retrying unchanged content reuses its
  // Idempotency-Key, so a request that reached the server is never turned into two tickets.
  const submission = useRef(null);

  const setField = (name) => (event) => setValues((previous) => ({ ...previous, [name]: event.target.value }));
  const describedBy = (name) => (fieldErrors[name] ? `ticket-${name}-error` : undefined);

  const noCategories = categories.status === "ready" && categories.data.length === 0;
  const formDisabled = submitting || categories.status !== "ready" || noCategories;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (formDisabled) return;
    setError(null);

    const errors = validateTicket(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const fields = {
      subject: values.subject.trim(),
      description: values.description.trim(),
      categoryId: values.categoryId,
      priority: values.priority,
    };
    submission.current = submissionFor(submission.current, fields);

    setSubmitting(true);
    try {
      const ticket = await createTicket(token, fields, { idempotencyKey: submission.current.key });
      const created = ticket?.ticketNumber ?? "Your ticket";
      navigate(ticket?.id ? `/tickets/${ticket.id}` : "/tickets", { replace: true, state: { created } });
    } catch (createError) {
      if (endSessionIfRejected(createError)) return;
      setSubmitting(false);
      // Deactivated since the form loaded: refresh the choices and ask for another one.
      if (isInactiveCategoryError(createError)) {
        setValues((previous) => ({ ...previous, categoryId: "" }));
        setFieldErrors({ categoryId: CATEGORY_UNAVAILABLE_MESSAGE });
        categories.reload();
        return;
      }
      setError(ticketErrorMessage(createError, "Your ticket could not be created. Please try again."));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/tickets" className={`${linkClass} text-[13px]`}>← Back to my tickets</Link>
        <h1 className="mt-3 text-[28px] font-semibold tracking-[-1px] text-[#172d2a] sm:text-[32px]">Raise a ticket</h1>
        <p className="mt-1 text-[13px] text-[#5b746c]">Tell us what's wrong and we'll get back to you here.</p>
      </div>

      <Card>
        {categories.status === "error" && (
          <div className="mb-5">
            <ErrorAlert onRetry={categories.reload}>{categoriesErrorMessage(categories.error)}</ErrorAlert>
          </div>
        )}
        {noCategories && (
          <p role="status" className="mb-5 rounded-xl bg-[#fff6e6] px-4 py-3 text-[12px] text-[#8a6223]">
            No ticket categories are available right now, so tickets can't be raised. Please try again later.
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="ticket-subject" className={labelClass}>Subject</label>
              <Counter value={values.subject} max={TICKET_LIMITS.subject.max} />
            </div>
            <input
              id="ticket-subject"
              type="text"
              value={values.subject}
              onChange={setField("subject")}
              disabled={formDisabled}
              placeholder="e.g. I can't reset my password"
              aria-invalid={Boolean(fieldErrors.subject)}
              aria-describedby={describedBy("subject")}
              className={inputClass}
            />
            <FieldError id="ticket-subject-error">{fieldErrors.subject}</FieldError>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="ticket-category" className={labelClass}>Category</label>
              <select
                id="ticket-category"
                value={values.categoryId}
                onChange={setField("categoryId")}
                disabled={formDisabled}
                aria-invalid={Boolean(fieldErrors.categoryId)}
                aria-describedby={describedBy("categoryId")}
                className={inputClass}
              >
                <option value="">{categories.status === "loading" ? "Loading categories…" : "Choose a category"}</option>
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <FieldError id="ticket-categoryId-error">{fieldErrors.categoryId}</FieldError>
            </div>

            <div>
              <label htmlFor="ticket-priority" className={labelClass}>Priority</label>
              <select
                id="ticket-priority"
                value={values.priority}
                onChange={setField("priority")}
                disabled={formDisabled}
                aria-invalid={Boolean(fieldErrors.priority)}
                aria-describedby={describedBy("priority")}
                className={`${inputClass} capitalize`}
              >
                {TICKET_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
              <FieldError id="ticket-priority-error">{fieldErrors.priority}</FieldError>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="ticket-description" className={labelClass}>Description</label>
              <Counter value={values.description} max={TICKET_LIMITS.description.max} />
            </div>
            <textarea
              id="ticket-description"
              rows={7}
              value={values.description}
              onChange={setField("description")}
              disabled={formDisabled}
              placeholder="What happened, what you expected, and anything you've already tried."
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={describedBy("description")}
              className={`${inputClass} resize-y`}
            />
            <FieldError id="ticket-description-error">{fieldErrors.description}</FieldError>
          </div>

          <ErrorAlert>{error}</ErrorAlert>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link to="/tickets" className={secondaryButtonClass}>Cancel</Link>
            <button type="submit" disabled={formDisabled} aria-busy={submitting} className={primaryButtonClass}>
              {submitting ? "Submitting…" : "Submit ticket"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
