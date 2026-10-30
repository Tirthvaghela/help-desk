# Customer ticket API: gaps against the contract (resolved)

**For:** Swatismita (owner of `customerTicket.controller.js` and category administration)
**Status:** all items below were resolved on 2026-10-29 (contract v0.6). Kept as a record of
what changed in her module and why; please review the changes.

| # | Gap found (2026-10-28) | Resolution (2026-10-29) |
| --- | --- | --- |
| 1 | No way to create categories; a fresh database blocks ticket creation | `GET/POST/PATCH /api/admin/categories` implemented (contract §10) with tests in `backend/test/categories.test.js`. `npm run seed:categories` adds the default categories safely (README → First run). The admin dashboard's Categories screen uses the API. |
| 2 | Responses were `{ success, data }` and errors `{ success: false, message }` | `POST /api/tickets` returns `{ ticket }` (the shared `serializeTicket` shape) and `GET /api/tickets/my` returns `{ tickets, page, limit, total }`. Every error uses the `{ error: { code, message } }` envelope. The frontend was updated in the same change. |
| 3 | The contract's `categoryId` was rejected (only `category` was read) | `categoryId` is the documented field; `category` stays accepted as an alias (D-9). A malformed id gives `400 INVALID_ID`; an unknown or inactive category gives `400 VALIDATION_ERROR`. |
| 4 | `GET /my` ignored `page`, `limit` and `status` | Implemented with the queue's validation (`utils/ticketQuery.js`), scoped by the shared access rule; bad values give `400`. The customer portal has status filters and pages. |
| 5 | Controller allowed `urgent`, the model did not; `priority` handling differed from the contract | The controller validates against `TICKET_PRIORITIES` (`low`, `medium`, `high`). Omitted priority defaults to `medium` (recorded in the contract as D-9). |
| 6 | No body → `500` | `requireJsonBody` → `400 VALIDATION_ERROR` (first fixed on 2026-10-28). |

Tests: `backend/test/customerTickets.test.js` (contract shapes, validation codes, ownership,
pagination and filters) and the HD-104 scenario in `backend/test/agentWorkflow.test.js`,
which now starts with the customer creating the ticket through `POST /api/tickets`.
