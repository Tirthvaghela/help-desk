# Help Desk API Contract

> **Status: v0.13. Every endpoint below is implemented.** Points still waiting for a team decision are listed in [Section 1](#1-decisions).
> This document is the agreement the backend and frontend build against. Change it through a pull request so everyone sees the change.

Source: project brief *Help Desk — Customer Support Ticket System* v0.2 (Sections 2, 4, 5 and 8). Where the brief leaves a choice open, this document says so.

## Contents

1. [Decisions](#1-decisions)
2. [Conventions](#2-conventions)
3. [Data shapes](#3-data-shapes)
4. [Endpoint summary](#4-endpoint-summary)
5. [Health](#5-health)
6. [Authentication](#6-authentication)
   - [6a. Account security](#6a-account-security--implemented-2026-10-29)
7. [Customer tickets](#7-customer-tickets)
8. [Agent and admin ticket workflow](#8-agent-and-admin-ticket-workflow)
9. [Comments (ticket conversation)](#9-comments-ticket-conversation)
10. [Categories](#10-categories)
11. [Admin: users and statistics](#11-admin-users-and-statistics)
   - [12a. Notifications](#12a-notifications--implemented-2026-10-29)
12. [Error codes](#12-error-codes)
13. [Change log](#13-change-log)

---

## 1. Decisions

States used below:

- **DECIDED**: confirmed by the responsible team member.
- **DEFAULT**: an engineering default chosen by the integration lead so implementation is not blocked. It is **not** a team approval. Code may implement it, and each default is confirmed or changed when the owner reviews the pull request that implements it. Changing a default later means changing the code and its tests in the same pull request.
- **OPEN**: no decision yet. **Do not implement an OPEN item.**

| ID | Topic | State |
| --- | --- | --- |
| OPEN-1 | Agent access policy | **DECIDED** (2026-10-25): option (b), unassigned tickets + tickets assigned to that agent |
| OPEN-2 | How the auth token is sent | **DECIDED** (2026-10-24): JWT Bearer token in the `Authorization` header |
| C-1, C-4, C-5, C-8 | Replies on resolved tickets, category storage, eligible assignees, assignment permissions | **DEFAULT** (2026-10-25), see [Engineering defaults](#engineering-defaults-d-1-to-d-11) |
| D-4, D-5, D-7 | Comment model, shared ticket-access helper, owner of `GET /api/tickets/:id` | **DEFAULT** (2026-10-25), see [Engineering defaults](#engineering-defaults-d-1-to-d-11) |
| C-2 | Admin modifying self | **DEFAULT** (2026-10-29), see D-8 |
| C-3, C-6, C-7 | Token lifetime, token storage, logout | **OPEN**. The proposals are what currently runs (1-day tokens, `sessionStorage`, no server-side logout) so the app works; confirming or changing them is still a team decision. |

> Amended 2026-10-25 (v0.4): this section previously said "Do not implement an option until it is marked DECIDED". Seven open points were blocking the whole agent-workflow module, so the DEFAULT state was added to let implementation proceed while keeping team review explicit.

### OPEN-1: Agent access policy — DECIDED

**Decision (2026-10-25):** Option (b), **Unassigned + own**. Confirmed by Ayushi (agent workflow owner).

> An agent can access tickets where `assignedTo` is `null` **or** `assignedTo` is that agent.

- The backend applies this rule **in the database query** (for lists) **and** on every single-ticket request. Hiding items in the UI is not enough.
- Endpoints that depend on this rule are marked **"Agent\*"** below. An agent requesting a ticket outside the rule gets **403 `FORBIDDEN`**.

Option (a), all tickets, was not chosen.

**Not covered by this decision:** whether an agent may assign a ticket to a *different* agent, or only to themselves (C-8), and who can be an assignee (C-5). Both now have engineering defaults (D-1, D-2 below).

### OPEN-2: How the auth token is sent — DECIDED

**Decision (2026-10-24):** Option (A), **JWT Bearer token**. Confirmed by Swati (authentication owner).

- `POST /api/auth/register` and `POST /api/auth/login` return the JWT in the JSON response body as `token`.
- The frontend sends it on every protected request as `Authorization: Bearer <token>`.
- The API does not set or read authentication cookies. CORS does not need `credentials`.

Option (B), an httpOnly cookie, was not chosen.

**Not covered by this decision** (still open, see the table below): token lifetime (C-3), where the frontend keeps the token (C-6), and logout behaviour (C-7).

### Smaller points

| # | Question | State | Proposal / default |
| --- | --- | --- | --- |
| C-1 | Can replies be added to a **resolved** ticket? | **DEFAULT** (D-3) | Yes, no restriction. |
| C-2 | Can an admin change their **own** role or deactivate themselves? | **DEFAULT** (D-8) | No: returns 400 `CANNOT_MODIFY_SELF`, to avoid locking out the only admin. |
| C-3 | Token lifetime | OPEN | 1 day (`JWT_EXPIRES_IN=1d`). No refresh tokens. The implementation reads `JWT_EXPIRES_IN` (default `1d`), so the value can change without code changes. |
| C-4 | Is `category` a reference to the Category collection or a fixed list? | **DEFAULT** (D-6) | Reference to a Category collection. |
| C-5 | Who can be an assignee? | **DEFAULT** (D-2) | Active users with role `agent` or `admin`. |
| C-6 | Where does the frontend keep the token (e.g. `localStorage`, `sessionStorage`, memory)? | OPEN | `sessionStorage` is what runs today: a session survives a page reload and ends when the tab closes. Not yet confirmed by the team. |
| C-7 | Logout: does the client just discard the token, or does the server also need a logout/revocation endpoint? | OPEN | Client discards the token; no server endpoint. |
| C-8 | Under OPEN-1, may an agent assign a ticket to a *different* agent, or only to themselves? | **DEFAULT** (D-1) | Only to themselves (claim) or to nobody (release). Admins assign anyone eligible. |

<a id="engineering-defaults-d1d7"></a>

### Engineering defaults (D-1 to D-11)

**State: DEFAULT, chosen by Tirth Vaghela (integration lead): D-1 to D-7 on 2026-10-25, D-8 to D-11 on 2026-10-29. Not yet approved by the owners named below.** Each is implemented and covered by tests; the owner confirms or changes it when reviewing the implementing pull request.

| # | Topic | Default | Rationale | Owner to confirm |
| --- | --- | --- | --- | --- |
| D-1 | Assignment permissions (C-8) | An **agent** may set `assignedTo` only to **themselves** (claim) or to `null` (release), on tickets they can access. Anything else → **403 `FORBIDDEN`**. An **admin** may assign any eligible user (D-2) or `null`. Agents and admins may both set `priority` on tickets they can access. | Under OPEN-1, an agent who assigns a ticket to someone else immediately loses access to it, so "assign to another agent" would let agents push work onto colleagues with no way back. Keeping cross-agent assignment with admins gives one accountable triage role. Matches the brief's flow (agent sets priority, assigns, starts work). | Ayushi |
| D-2 | Eligible assignees (C-5) | The assignee must be an **existing** user with role `agent` or `admin` and `isActive: true`. Otherwise → **400 `VALIDATION_ERROR`** ("assignedTo must be an active agent or admin"), including for an id that matches no user (the 404 is reserved for the ticket in the URL). | Same as the existing C-5 proposal and the error already listed for `PATCH /assign`. Customers cannot work tickets; deactivated users cannot act. | Ayushi |
| D-3 | Replies on resolved tickets (C-1) | **Allowed**, with no restriction. Posting a reply never changes the status, and a resolved ticket cannot be reopened (status only moves forward). | Keeps the existing C-1 proposal. Lets a customer confirm the fix or add details without creating a new ticket; reopening stays out of scope because the brief defines only Open → In Progress → Resolved. | Ayushi |
| D-4 | Comment model (Q-2) | Model **`TicketComment`** (handbook collection name). JSON shape and keys stay `comment` / `comments` as in [Section 9](#9-comments-ticket-conversation). Implemented by the agent-workflow module (`backend/src/models/TicketComment.js`). Schema in `docs/DATA_MODEL.md` §3.4. | The handbook names the collection; the API shape is unchanged. The comments API is in this module, so the model is too: one owner, no duplicate. | Ayushi, Swati |
| D-5 | Shared ticket access | **One helper**, `backend/src/utils/ticketAccess.js`, owned by **Swatismita** (ticket ownership and access checks). **Every** route that reads or changes an existing ticket or its comments uses it, including the agent-workflow routes. Customer: `createdBy` is the user. Agent: OPEN-1 (unassigned or assigned to them). Admin: all. Any other role: no access. Single-ticket checks run in the contract's order: 400 `INVALID_ID`, then 404, then 403. List and update queries use the same rule as a database filter. | One rule in one file means lists, details, updates and comments cannot disagree. The helper applies the agent rule Ayushi confirmed (OPEN-1). | Swatismita, Ayushi |
| D-6 | Category storage (C-4, Q-1) | **Database collection** `Category` `{ name, isActive }` with a case-insensitive unique name. Tickets reference it. Inactive categories stay on existing tickets, still appear in ticket details and statistics, and can still be used as a queue filter. They cannot be chosen for **new** tickets (enforced by ticket creation). | The handbook requires admins to manage categories; a fixed list would need a code change for every new category. References keep statistics and filters consistent. | Swati |
| D-7 | Owner of `GET /api/tickets/:id` | **Ayushi's agent-workflow router** registers it (`backend/src/routes/agentTicket.routes.js`). It is the one detail route for customers, agents and admins, authorized by `ticketAccess.js` (D-5, Swatismita). Swatismita's ticket router keeps `POST /api/tickets` and `GET /api/tickets/my` and **must not** register `GET /:id`. | One owner prevents two competing registrations. The route only reads the ticket after the shared access check (D-5), so the route and the access rule each keep one owner. | Swatismita, Ayushi |
| D-8 | Admin modifying self (C-2) | `PATCH /api/admin/users/:id/role` and `/status` on **your own** account → **400 `CANNOT_MODIFY_SELF`**. Admins may change other admins. | The C-2 proposal. Refusing self-changes alone does not keep an admin (two admins can demote each other at the same moment), so a change that would leave no active admin is also refused: **409 `LAST_ACTIVE_ADMIN`**. | Swati |
| D-9 | Additions made while integrating the dashboards (2026-10-29) | All **additive**; no existing field, route or status changed. **(a)** `PATCH /api/auth/me` updates the caller's own `name` (§6). **(b)** Category has an optional `description` (0–200 chars). **(c)** `GET /api/admin/users` items include `ticketCount`. **(d)** `GET /api/admin/stats` adds `byPriority`, `unresolvedByPriority`, `unassigned`, `byAssignee` and an optional `from` date (§11). **(e)** `POST /api/tickets` also accepts the older field name `category` for `categoryId`, and `priority` defaults to `medium` when omitted. **(f)** `GET /api/tickets/my` also accepts the queue's `priority`, `category` and `q` filters. **(g)** Sign-in and sign-up are rate limited per client IP (`429 RATE_LIMITED`, configurable, see README). | The existing admin screens showed category descriptions, per-user ticket counts, per-priority and per-agent figures and report periods; serving them from the API avoids dozens of list requests. (e) keeps clients written before §7 was aligned working. | Swati, Ayushi |
| D-10 | Ticket ownership (2026-10-29, QA D-4/D-5) | An **in-progress or resolved ticket always has an assignee**, and a **resolved ticket is final**. `PATCH /status`: a resolved ticket → **400 `TICKET_RESOLVED`**; otherwise the forward-only rule (`INVALID_STATUS_TRANSITION`); then an unassigned ticket → **400 `ASSIGNEE_REQUIRED`** (start or resolve). Only the assignee or an admin can move an assigned ticket (agents cannot reach other agents' tickets, OPEN-1); an admin resolving keeps the assignee, and `statusHistory` records the admin. `PATCH /assign`: a resolved ticket → **400 `TICKET_RESOLVED`** for any `assignedTo` or `priority` change; `assignedTo: null` on an in-progress ticket → **400 `ASSIGNEE_REQUIRED`** (reassign instead). Admins reassign open and in-progress tickets (D-2). These checks run after validation, `INVALID_ID`, 404, 403 and the D-1/D-2 checks, and again inside the atomic update, so a race gives 409 (or the rule's 400), never an ownerless ticket. Existing tickets that break the rule stay readable and are not changed automatically; an admin repairs them by assigning. When someone else releases or reassigns a ticket, the former assignee gets a `ticket_unassigned` notification (§12a). An assignment history is deferred (phase 2). | Stops tickets being worked or resolved with no owner, and orphaned in-progress tickets. Matches the brief's flow: assign, then start work. | Tirth Vaghela; pending review by Ayushi |
| D-11 | Who may reply (2026-10-29) | `POST /api/tickets/:id/comments`: the **customer who owns** the ticket, the **agent it is assigned to**, and **any admin**. Agents can still **read** unassigned tickets and their comments (OPEN-1) but must claim a ticket before replying → otherwise **403 `FORBIDDEN`** ("Assign this ticket to yourself to reply"). Replies on resolved tickets stay allowed (D-3). | Makes the API match the agent Inbox, which only offers replies on your own tickets; one accountable voice per ticket. | Tirth Vaghela; pending review by Ayushi |

**Router mounting (with D-7):** both ticket routers are mounted at `/api/tickets` in `backend/src/app.js`, **Swatismita's first**, so that `GET /my` is matched before the agent-workflow router's `GET /:id` (otherwise `my` would be read as an id and return 400 `INVALID_ID`). Admin routes: the `/api/admin/users` and `/api/admin/categories` routers, and the router mounted at `/api/admin` that serves `/stats` and `/analytics`, with no overlapping paths. §4 lists the owner of each route.

---

## 2. Conventions

### Base URL

- Local: `http://localhost:4000`
- Frontend reads it from `VITE_API_URL`.
- All routes start with `/api`.

### Requests

- JSON bodies with `Content-Type: application/json`. Maximum body size: 100 kB, measured after decompression. See [Malformed requests](#malformed-requests) for what is refused.
- Protected routes require the header `Authorization: Bearer <token>` (decided, see OPEN-2).
- **Unknown fields in request bodies are ignored.** In particular, the server never accepts `role`, `status`, `ticketNumber`, `createdBy`, `isActive` or timestamps from a client except through the endpoints documented for them.
- String inputs are trimmed before validation.

### Successful responses

- Single resource: wrapped in a named key, e.g. `{ "ticket": { ... } }`.
- Lists: named key plus pagination where listed, e.g. `{ "tickets": [ ... ], "page": 1, "limit": 20, "total": 42 }`.
- `201 Created` for successful creation, `200 OK` otherwise.
- IDs are MongoDB ObjectId strings, returned as `id` (not `_id`).
- Timestamps are ISO 8601 strings in UTC, e.g. `"2026-10-24T09:15:00.000Z"`. The frontend formats them for display.
- `passwordHash` is **never** included in any response.

### Errors (implemented)

Every error uses one envelope. This is already implemented in `backend/src/middleware/errorHandler.js`. The one 4xx or 5xx answer outside it is `GET /api/health` with the database disconnected, which returns its normal health body (§5).

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Subject is required" } }
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid input (missing field, bad value, invalid ID, invalid status transition), or a malformed body or URL (see [Malformed requests](#malformed-requests)) |
| 401 | Not logged in, or token missing/invalid/expired |
| 403 | Logged in, but not allowed (wrong role, not the owner, outside access policy, account deactivated) |
| 404 | Resource or route does not exist |
| 405 | `METHOD_NOT_ALLOWED`: the path exists, but not for this method. The `Allow` header lists the supported methods. A path that does not exist gets 404. |
| 409 | Duplicate (e.g. email already registered) |
| 413 | Request body too large |
| 415 | The request body uses a character set or content encoding the server does not support (see [Malformed requests](#malformed-requests)) |
| 429 | `RATE_LIMITED`: too many requests from one client IP in the current window, with a `Retry-After` header (seconds). Applies to `POST` on `/api/auth/register`, `/login`, `/me/password`, `/me/email`, `/verify-email`, `/forgot-password`, `/reset-password/check` and `/reset-password` (§6, §6a). |
| 500 | Unexpected server error. Message is always generic; details are only logged on the server. |
| 503 | `EMAIL_DELIVERY_FAILED`: the confirmation email for `POST /api/auth/me/email` could not be sent, so nothing stays pending (§6a). `GET /api/health` also returns 503 when MongoDB is disconnected, with its health body rather than an error envelope (§5). |

**`message` is safe to show to users. Frontend logic should branch on `status` and `code`, never on the message text.**

Backend helpers (implemented): `ApiError.badRequest()`, `.unauthorized()`, `.forbidden()`, `.notFound()`, `.conflict()` in `backend/src/utils/ApiError.js`, and `requireString`, `requireOneOf`, `requireEmail` in `backend/src/utils/validate.js`. Mongoose validation errors, invalid ObjectIds and duplicate-key errors are converted to 400 / 400 / 409 automatically.

### Malformed requests

A request the server cannot read gets one of these answers, in the usual envelope. Each `message` is fixed, and repeats nothing from the request or the parser.

| Status | Code | Message | When |
| --- | --- | --- | --- |
| 400 | `INVALID_JSON` | `Request body is not valid JSON` | The body is not valid JSON |
| 400 | `INVALID_BODY_ENCODING` | `Request body could not be decoded` | A gzip, deflate, Brotli or zstd body is corrupt or cut off, or needs a dictionary the server does not have |
| 400 | `INVALID_URL` | `Request URL is not correctly encoded` | A route parameter has bad percent-encoding, such as `/api/tickets/%E0%A4%A` |
| 413 | `PAYLOAD_TOO_LARGE` | `Request body is too large` | The body is over 100 kB, including a compressed body that expands past it |
| 415 | `UNSUPPORTED_CHARSET` | `Request body uses an unsupported character set` | The `Content-Type` charset is not supported, such as `koi8-r` or `utf-99` |
| 415 | `UNSUPPORTED_ENCODING` | `Request body uses an unsupported content encoding` | The `Content-Encoding` is not supported |

- **Only JSON requests are read this way.** The body checks apply when `Content-Type` is `application/json`. A route that needs a body gives 400 `VALIDATION_ERROR` when it has none (§6, §7).
- **zstd depends on the Node.js version.** Node.js 22.15, 23.8 and later can decompress it. On an earlier version, `Content-Encoding: zstd` gives 415 `UNSUPPORTED_ENCODING` whatever the body contains.
- **Body errors come before everything in the next section.** The body is read before any route runs, so these answers do not depend on the token.
- **`INVALID_URL` can come before authentication.** `GET /api/tickets/%E0%A4%A` with no token gives 400, not 401. A parameter that is correctly encoded but is not an ObjectId gives 400 `INVALID_ID` as usual.
- **Other bad URLs are not `INVALID_URL`.** Bad encoding outside a route parameter does not reach this check: a path that matches no route gives 404, and a bad query string is not refused.
- **A fault on the server stays 500.** Running out of memory while decompressing, for example, gives 500 `INTERNAL_ERROR`, as does any decompression failure not listed in the code.

### Order of checks on protected routes

1. Authenticated? Otherwise **401**.
2. Account active? Otherwise **403 `ACCOUNT_DISABLED`**.
3. Role allowed for this route? Otherwise **403 `FORBIDDEN`**.
4. Request valid (IDs, body)? Otherwise **400**.
5. Resource exists? Otherwise **404**.
6. Ownership / access policy allows this resource? Otherwise **403 `FORBIDDEN`**.

---

## 3. Data shapes

These are the JSON shapes the API returns. They are derived from the brief's proposed models; the model owner may adjust field names through a PR to this document.

### User

```json
{
  "id": "6718f0c2a1b2c3d4e5f60001",
  "name": "Asha Customer",
  "email": "asha@example.com",
  "role": "customer",
  "isActive": true,
  "createdAt": "2026-10-24T09:00:00.000Z"
}
```

`role` is one of `customer`, `agent`, `admin`. Default `customer`.

### UserSummary (embedded in other objects)

```json
{ "id": "6718f0c2a1b2c3d4e5f60002", "name": "Ravi Agent", "role": "agent" }
```

### Category

```json
{ "id": "6718f0c2a1b2c3d4e5f60100", "name": "Account & Login", "description": "Login, passwords, and account access", "isActive": true }
```

### Ticket

```json
{
  "id": "6718f0c2a1b2c3d4e5f60200",
  "ticketNumber": "HD-104",
  "subject": "Unable to reset password",
  "description": "The reset link in the email says it has expired.",
  "category": { "id": "6718f0c2a1b2c3d4e5f60100", "name": "Account & Login" },
  "priority": "medium",
  "status": "in_progress",
  "createdBy": { "id": "6718f0c2a1b2c3d4e5f60001", "name": "Asha Customer", "role": "customer" },
  "assignedTo": { "id": "6718f0c2a1b2c3d4e5f60002", "name": "Ravi Agent", "role": "agent" },
  "statusHistory": [
    { "status": "open", "changedBy": { "id": "6718f0c2a1b2c3d4e5f60001", "name": "Asha Customer", "role": "customer" }, "changedAt": "2026-10-24T09:15:00.000Z" },
    { "status": "in_progress", "changedBy": { "id": "6718f0c2a1b2c3d4e5f60002", "name": "Ravi Agent", "role": "agent" }, "changedAt": "2026-10-24T09:40:00.000Z" }
  ],
  "createdAt": "2026-10-24T09:15:00.000Z",
  "updatedAt": "2026-10-24T09:40:00.000Z",
  "resolvedAt": null
}
```

| Field | Values / rules |
| --- | --- |
| `ticketNumber` | `HD-` + sequential number, generated by the server, unique. Recommendation for the model owner: use an atomic counter (`findOneAndUpdate` with `$inc`) rather than counting documents, so two simultaneous tickets never get the same number. |
| `priority` | `low`, `medium`, `high` |
| `status` | `open`, `in_progress`, `resolved`. Display as Open, In Progress, Resolved. |
| `assignedTo` | `UserSummary` or `null` |
| `statusHistory` | Oldest first. The first entry (`open`) is written when the ticket is created. |
| `resolvedAt` | Set when status becomes `resolved`, otherwise `null` |
| `dueAt` | **Staff responses only** (agents and admins; v0.11). The SLA due date: the time by which the ticket should be **resolved** (a resolution target, not a response target). `createdAt` + the target for the priority, in calendar hours: high 24 h, medium 72 h, low 168 h by default (`SLA_HOURS_HIGH`, `SLA_HOURS_MEDIUM`, `SLA_HOURS_LOW`, see README). Recalculated from `createdAt` when the priority changes (§8). `null` for tickets created before SLAs existed. Customers never receive this field. |

In **list** responses, tickets omit `description` and `statusHistory` to keep payloads small.

**SLA states** (worked out from `dueAt` when needed; nothing runs in the background, and no reminders are sent): *met* / *missed* — resolved at or before / after `dueAt`; *overdue* — not resolved and `dueAt` has passed; *due soon* — not resolved, 25% or less of the ticket's own target (`dueAt` − `createdAt`) left, up to and including `dueAt`; *due* — more than 25% left; *no SLA* — no `dueAt`.

### Comment

```json
{
  "id": "6718f0c2a1b2c3d4e5f60300",
  "ticket": "6718f0c2a1b2c3d4e5f60200",
  "author": { "id": "6718f0c2a1b2c3d4e5f60002", "name": "Ravi Agent", "role": "agent" },
  "message": "I've sent a new reset link. Please try again within 30 minutes.",
  "createdAt": "2026-10-24T09:45:00.000Z"
}
```

---

## 4. Endpoint summary

"Agent\*" means: agents only for tickets that are unassigned or assigned to them (OPEN-1, decided). In the Allowed column, "Owner" is the customer who created the ticket. The Team owner column names the responsible team member.

| Method | Route | Allowed | Team owner | Status |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | Public | Tirth | **Implemented** |
| POST | `/api/auth/register` | Public | Swatismita | **Implemented** |
| POST | `/api/auth/login` | Public | Swatismita | **Implemented** |
| GET | `/api/auth/me` | Logged in | Swatismita | **Implemented** |
| PATCH | `/api/auth/me` | Logged in (own profile) | Swatismita | **Implemented** (D-9) |
| POST | `/api/auth/me/password` | Logged in | Swatismita | **Implemented** (§6a) |
| GET/POST/DELETE | `/api/auth/me/email` | Logged in | Swatismita | **Implemented** (§6a) |
| POST | `/api/auth/verify-email` | Public | Swatismita | **Implemented** (§6a) |
| POST | `/api/auth/forgot-password` | Public | Swatismita | **Implemented** (§6a) |
| POST | `/api/auth/reset-password/check`, `/api/auth/reset-password` | Public | Swatismita | **Implemented** (§6a) |
| GET | `/api/notifications`, `/api/notifications/unread-count` | Logged in (own) | Tirth | **Implemented** (§12a) |
| PATCH/POST | `/api/notifications/:id/read`, `/api/notifications/read-all` | Logged in (own) | Tirth | **Implemented** (§12a) |
| POST | `/api/tickets` | Customer | Swatismita | **Implemented** |
| GET | `/api/tickets/my` | Customer | Swatismita | **Implemented** |
| GET | `/api/tickets` | Agent\*, Admin | Ayushi | **Implemented** |
| GET | `/api/tickets/:id` | Owner, Agent\*, Admin | Ayushi (route, D-7); Swatismita (access check, D-5) | **Implemented** |
| PATCH | `/api/tickets/:id/assign` | Agent\*, Admin | Ayushi | **Implemented** |
| PATCH | `/api/tickets/:id/status` | Agent\*, Admin | Ayushi | **Implemented** |
| GET | `/api/tickets/:id/comments` | Owner, Agent\*, Admin | Ayushi | **Implemented** |
| POST | `/api/tickets/:id/comments` | Owner, Agent\*, Admin | Ayushi | **Implemented** |
| GET | `/api/categories` | Logged in | Swatismita | **Implemented** |
| GET | `/api/admin/categories` | Admin | Tirth | **Implemented** |
| POST | `/api/admin/categories` | Admin | Tirth | **Implemented** |
| PATCH | `/api/admin/categories/:id` | Admin | Tirth | **Implemented** |
| GET | `/api/admin/users` | Admin | Tirth | **Implemented** |
| PATCH | `/api/admin/users/:id/role` | Admin | Tirth | **Implemented** |
| PATCH | `/api/admin/users/:id/status` | Admin | Tirth | **Implemented** |
| GET | `/api/admin/stats` | Admin | Ayushi | **Implemented** |
| GET | `/api/admin/analytics` | Admin | Tirth | **Implemented** |

Owners follow the team allocation below and can be reassigned by agreement. `GET /api/admin/categories` is an addition to the brief so admins can see inactive categories.

| Team | Member | Responsibilities |
| --- | --- | --- |
| Backend | **Tirth Vaghela**, Backend Integration, Admin Backend & DevOps | Backend architecture and API integration; admin backend APIs, dashboard data and management operations; shared database and API coordination; backend-to-frontend API integration across customer, agent and admin modules; integration testing, deployment coordination and README/documentation |
| Backend | **Ayushi Rathi**, Agent Workflow & Conversations | Agent ticket queue, search and filters; ticket assignment and status transitions; replies and conversation management; ticket status history and admin ticket summaries |
| Backend | **Swatismita**, Tickets & Authentication | User authentication, JWT and role-based middleware; User, Ticket and Category models; ticket creation and customer ticket history; ticket ownership and access checks |
| Frontend | **Mimansa Narendra Patle**, Customer Frontend & Landing Page | Project landing page; signup, login and customer dashboard; create-ticket form, ticket history and ticket details; loading, validation and error states |
| Frontend | **Shwetaleena Kundu**, Agent/Admin Frontend | Agent dashboard, filters and replies; ticket assignment and status updates; admin user and category management screens |

The frontend team builds its screens against these endpoints and owns no backend route.

---

## 5. Health

### `GET /api/health` — **Implemented**

Public. Used by the frontend status check and by the deployment host.

**200** when MongoDB is connected:

```json
{ "status": "ok", "database": "connected", "uptimeSeconds": 42, "timestamp": "2026-10-24T09:00:00.000Z" }
```

**503** when MongoDB is disconnected:

```json
{ "status": "degraded", "database": "disconnected", "uptimeSeconds": 42, "timestamp": "2026-10-24T09:00:00.000Z" }
```

---

## 6. Authentication

> **Implemented.** All routes below are mounted at `/api/auth`. **Transport decided (OPEN-2):** the JWT is returned as `token` in the response body and sent back as `Authorization: Bearer <token>`. Token lifetime, storage and logout remain team decisions (C-3, C-6, C-7); what currently runs is recorded there.

| Method | Route | Access | Success | Details |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | Public | **201** `{ user, token }` | Below |
| POST | `/api/auth/login` | Public | **200** `{ user, token }` | Below |
| GET | `/api/auth/me` | Logged in | **200** `{ user }` | Below |
| PATCH | `/api/auth/me` | Logged in | **200** `{ user }` | Below |
| POST | `/api/auth/me/password` | Logged in | **200** `{ user, token }` | §6a |
| GET | `/api/auth/me/email` | Logged in | **200** `{ pendingEmail, expiresAt }` | §6a |
| POST | `/api/auth/me/email` | Logged in | **202** `{ pendingEmail, expiresAt }` | §6a |
| DELETE | `/api/auth/me/email` | Logged in | **200** `{ pendingEmail: null, expiresAt: null }` | §6a |
| POST | `/api/auth/verify-email` | Public | **200** `{ email }` | §6a |
| POST | `/api/auth/forgot-password` | Public | **200** `{ message }` | §6a |
| POST | `/api/auth/reset-password/check` | Public | **200** `{ valid: true, expiresAt }` | §6a |
| POST | `/api/auth/reset-password` | Public | **200** `{ message }` | §6a |

### `POST /api/auth/register` — **Implemented**

Public. Creates a **customer** account.

Request:

```json
{ "name": "Asha Customer", "email": "asha@example.com", "password": "correct-horse-battery" }
```

| Field | Rules |
| --- | --- |
| `name` | Required string, 2–80 characters after trimming |
| `email` | Required, valid email, stored lower-cased, unique |
| `password` | Required string, at least 8 characters and **at most 72 bytes** in UTF-8 (bcrypt's input limit; characters such as `€` take 3 bytes). Longer passwords are rejected, never shortened. Leading and trailing spaces are trimmed (existing behaviour, kept so existing accounts still match). |
| `role` | **Ignored if sent.** The server always sets `role: "customer"`. |

**201**:

```json
{ "user": { "id": "…", "name": "Asha Customer", "email": "asha@example.com", "role": "customer", "isActive": true, "createdAt": "…" }, "token": "<jwt>" }
```

Errors: **400** `VALIDATION_ERROR` (including a missing or non-object JSON body) · **400** `INVALID_JSON` · **409** `EMAIL_TAKEN` ("Email is already registered").

### `POST /api/auth/login` — **Implemented**

Public.

Request:

```json
{ "email": "asha@example.com", "password": "correct-horse-battery" }
```

**200**: same shape as register (`user` + `token`).

Errors:

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Email or password missing |
| 401 | `INVALID_CREDENTIALS` | Unknown email, wrong password, **or a deactivated account with a wrong password**. Identical response in every case ("Invalid email or password"), and a password check runs even for unknown emails, so neither the response nor its timing reveals which emails exist. |
| 403 | `ACCOUNT_DISABLED` | Correct password but `isActive` is `false`. Only returned **after** the password is verified. |

Login accepts passwords up to 128 characters (the registration limit before the 72-byte rule), so accounts created earlier can still sign in. A missing or non-object JSON body gives **400** `VALIDATION_ERROR`.

### `GET /api/auth/me` — **Implemented**

Logged in (any role). Used by the frontend to restore the session on page load.

**200**: `{ "user": { …User } }`

Errors: **401** `UNAUTHORIZED` (no/invalid/expired token) · **403** `ACCOUNT_DISABLED`.

### `PATCH /api/auth/me` — **Implemented** (D-9)

Logged in (any role). The caller updates their own profile.

Request: `{ "name": "Asha C. Customer" }` — required, 2–80 characters after trimming.

Only `name` can be changed here. `email`, `role`, `isActive`, `password` and any other field are ignored (§2). Email and password changes have their own implemented flows, which require the current password: see [§6a](#6a-account-security--implemented-2026-10-29). Role and account status are changed by admins (§11).

**200**: `{ "user": { …User } }`

Errors: **400** `VALIDATION_ERROR` · **401** · **403** `ACCOUNT_DISABLED`.

### Rate limiting (D-9)

`POST /api/auth/register` and `POST /api/auth/login` each allow `AUTH_RATE_LIMIT_MAX` requests (default 20) per client IP per `AUTH_RATE_LIMIT_WINDOW_MS` (default 15 minutes). Over the limit: **429 `RATE_LIMITED`** with a `Retry-After` header (seconds).

### Token rules (all protected routes)

Decided (OPEN-2):

- The token is read **only** from the `Authorization` header, in the form `Bearer <token>`. A missing header or any other scheme → **401 `UNAUTHORIZED`**.

Implemented:

- JWT signed with `JWT_SECRET`, payload contains only the user id (`sub`) and the user's token version (`ver`). Lifetime per C-3.
- A token whose `ver` no longer matches the user's stored token version → **401 `UNAUTHORIZED`**. A password change or reset increases the version, which signs the user out everywhere (§6a). Tokens issued before `ver` existed count as version 0.
- **The role is read from the database on every request, not from the token or the client.** This means a role change or deactivation takes effect immediately.
- Malformed, expired or wrongly-signed token → **401 `UNAUTHORIZED`**.
- Token for a user that no longer exists → **401 `UNAUTHORIZED`**.
- Token for a deactivated user → **403 `ACCOUNT_DISABLED`**.
- Logout: see C-7.

---

## 6a. Account security — **Implemented** (2026-10-29)

All of these are rate limited per client IP (`SENSITIVE_RATE_LIMIT_MAX`, default 5 per 15 minutes; **429 `RATE_LIMITED`**). One-time links are 32 random bytes, stored only as a SHA-256 hash, single-use, and expire (reset: `PASSWORD_RESET_TTL_MINUTES`, default 30; email change: `EMAIL_CHANGE_TTL_HOURS`, default 24). Tokens are sent in request **bodies**, never in API URLs, and are never returned or logged. Email links are built from `CLIENT_URL`.

A change to the account also ends the links that depended on the old state: a password change or reset cancels open reset links and any pending email change, and a confirmed email change cancels open reset links. Other users' links are not affected.

### `POST /api/auth/me/password`

Logged in. Request: `{ "currentPassword": "…", "newPassword": "…" }` (new password: same rules as sign-up, and different from the current one).

**200**: `{ "user": { …User }, "token": "…" }`. The token version increases, so **every other session is signed out**; the caller continues with the returned token. Open password-reset links and any pending email change are cancelled. A notice is emailed.

Errors: **400** `VALIDATION_ERROR` · **400 `INVALID_CURRENT_PASSWORD`** (deliberately not 401, so the client keeps its session) · **401** · **429**.

### `GET / POST / DELETE /api/auth/me/email`

Logged in.

- **POST** `{ "newEmail": "…", "currentPassword": "…" }` → **202** `{ "pendingEmail": "…", "expiresAt": "…" }`. Sends a confirmation link to the new address and a notice to the current one. **The email does not change until the link is opened.** A new request replaces any earlier link. Errors: **400** `VALIDATION_ERROR` (bad or same address) · **400** `INVALID_CURRENT_PASSWORD` · **409** `EMAIL_TAKEN` · **503 `EMAIL_DELIVERY_FAILED`** (nothing stays pending) · **429**.
- **GET** → `{ "pendingEmail": "…" | null, "expiresAt": "…" | null }`.
- **DELETE** → cancels the pending change: `{ "pendingEmail": null, "expiresAt": null }`.

### `POST /api/auth/verify-email`

Public (the link may be opened on any device). Request: `{ "token": "…" }`. **200** `{ "email": "…" }`; open password-reset links are cancelled, and the old address gets a notice. A refused change keeps the old email and those links. If the links cannot be cancelled, the change is undone and the answer is **500**. Errors: **400 `INVALID_OR_EXPIRED_TOKEN`** (unknown, expired, already used, or the account is deactivated) · **409** `EMAIL_TAKEN` (registered by someone else meanwhile; the link is used up) · **429**.

### `POST /api/auth/forgot-password`

Public. Request: `{ "email": "…" }`. **Always 200** with the same `{ "message": "If an account exists for that email, …" }`, whether the account exists, is deactivated or not; the email (if any) is sent after the response. At most one reset email per account per minute. Errors: **400** `VALIDATION_ERROR` (not an email address) · **429**.

### `POST /api/auth/reset-password/check` and `POST /api/auth/reset-password`

Public.

- **check** `{ "token": "…" }` → **200** `{ "valid": true, "expiresAt": "…" }` (does not use the link).
- **reset** `{ "token": "…", "newPassword": "…" }` → **200** `{ "message": "…" }`. The password is validated **before** the link is used. Signs the user out everywhere and cancels any pending email change; **does not sign them in**. If the links cannot be cancelled, the password is not changed and the answer is **500**; the link used is then spent, so a new one must be requested.

Errors: **400** `VALIDATION_ERROR` (password rules) · **400 `INVALID_OR_EXPIRED_TOKEN`** · **429**.

---

## 7. Customer tickets

### `POST /api/tickets` — **Implemented**

Customer only. Agents and admins get **403**.

Request:

```json
{ "subject": "Unable to reset password", "description": "The reset link in the email says it has expired.", "categoryId": "6718f0c2a1b2c3d4e5f60100", "priority": "medium" }
```

| Field | Rules |
| --- | --- |
| `subject` | Required string, 5–120 characters |
| `description` | Required string, 10–5000 characters |
| `categoryId` | Required, must be an existing **active** category. A malformed id → **400 `INVALID_ID`**. The older name `category` is accepted as an alias (D-9). |
| `priority` | Optional, one of `low`, `medium`, `high`; defaults to `medium` (D-9). An agent may change it later. |

The server sets `ticketNumber`, `status: "open"`, `createdBy` (from the token), `assignedTo: null`, the first `statusHistory` entry, and the SLA due date `dueAt` (§3; stored but not returned to the customer). A replay with the same `Idempotency-Key` returns the stored ticket unchanged; nothing is recalculated.

**201**: `{ "ticket": { …Ticket } }`

Errors: **400** `VALIDATION_ERROR` (missing or non-JSON body, missing subject, bad priority, unknown/inactive category, etc.) · **400** `INVALID_ID` (malformed `categoryId`) · **400** `INVALID_IDEMPOTENCY_KEY` · **401** · **403** `FORBIDDEN` · **409** `IDEMPOTENCY_KEY_REUSED` · **409** `IDEMPOTENCY_KEY_IN_USE`.

**Duplicate submissions (`Idempotency-Key`, v0.9).** The optional request header `Idempotency-Key` makes ticket creation safe to retry. The client generates one key per intended submission (8–128 characters: letters, digits, `-`, `_`; a UUID is fine) and sends the **same key** on every retry of that submission (double click, network error, lost response). Keys are per user.

| Situation | Response |
| --- | --- |
| First request with a key | **201** `{ ticket }`; the key now belongs to that ticket |
| Same key, same content again (also while the first is still running, or at the same time) | **200** with the **same** `{ ticket }` (same `id` and `ticketNumber`) and the header `Idempotent-Replayed: true`. No second ticket, no new notifications |
| Same key, different content (subject, description, category or priority, after trimming) | **409 `IDEMPOTENCY_KEY_REUSED`**; use a new key for a new ticket |
| Same key while the first request has not finished after a few seconds | **409 `IDEMPOTENCY_KEY_IN_USE`**; retry shortly with the same key |
| Malformed key (wrong length or characters, empty) | **400 `INVALID_IDEMPOTENCY_KEY`** |
| No header | Unchanged: every request creates a ticket |

A request that fails validation, authentication or authorization does not use up its key; the corrected request may reuse it. Different keys always create separate tickets, even with identical content. Concurrent requests with the same key are safe: exactly one creates the ticket (enforced by the database, not by a lookup). The web app sends a key with every submission and also disables the submit button while the request is in flight.

### `GET /api/tickets/my` — **Implemented**

Customer only. Returns only tickets where `createdBy` is the current user, newest first.

Query (all optional): `status`, `page` (default 1), `limit` (default 20, max 100). Also accepted (D-9): `priority`, `category`, `q`, with the same rules as the queue (§8). `assignee` is ignored.

**200**:

```json
{ "tickets": [ { …Ticket without description/statusHistory } ], "page": 1, "limit": 20, "total": 3 }
```

An empty list is `"tickets": []` with `total: 0`, not an error.

Errors: **400** (bad `status`/`page`/`limit`) · **401** · **403** (non-customer).

### `GET /api/tickets/:id` — **Implemented**

Owner, Agent\*, Admin. Returns the full ticket including `description` and `statusHistory`. Comments are fetched separately.

**200**: `{ "ticket": { …Ticket } }`

Errors:

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_ID` | `:id` is not a valid ObjectId |
| 401 | `UNAUTHORIZED` | Not logged in |
| 403 | `FORBIDDEN` | Customer who is not the owner, or agent outside the access policy |
| 404 | `NOT_FOUND` | No ticket with this id |

---

## 8. Agent and admin ticket workflow

### `GET /api/tickets` — **Implemented**

Agent\*, Admin. The ticket queue. Customers get **403** (they use `/api/tickets/my`).

Query (all optional, combined with AND):

| Param | Rules |
| --- | --- |
| `status` | `open`, `in_progress` or `resolved` |
| `priority` | `low`, `medium` or `high` |
| `category` | Category id |
| `assignee` | User id, or `unassigned`, or `me` |
| `q` | Text search on `ticketNumber` and `subject` (case-insensitive). Max 100 characters. |
| `page` | Integer ≥ 1, default 1 |
| `limit` | Integer 1–100, default 20 |

Sorted newest first. The access policy (OPEN-1) is applied **in the query**, so `total` only counts tickets the agent may see.

**200**: `{ "tickets": [ …Ticket list items ], "page": 1, "limit": 20, "total": 57 }`

Errors: **400** (invalid filter value) · **401** · **403**.

### `PATCH /api/tickets/:id/assign` — **Implemented**

Agent\*, Admin. Assign or unassign an agent, and/or set priority. At least one field is required.

Request:

```json
{ "assignedTo": "6718f0c2a1b2c3d4e5f60002", "priority": "high" }
```

| Field | Rules |
| --- | --- |
| `assignedTo` | Optional. User id of an **active** `agent` or `admin` (D-2), or `null` to unassign. **Agents** may only set their own id or `null`; any other id → 403 (D-1). **Admins** may set any eligible user. |
| `priority` | Optional. `low`, `medium` or `high`. A **different** priority also moves `dueAt` to `createdAt` + the new priority's target, in the same update (never from the time of the change). The same priority again, and assignment-only requests, leave `dueAt` unchanged. Tickets without a `dueAt` keep having none. |

**200**: `{ "ticket": { …Ticket } }`

Errors: **400** `VALIDATION_ERROR` (no fields, bad priority, assignee not an active agent/admin) · **400** `INVALID_ID` (ticket id or `assignedTo`) · **401** · **403** (outside the access rule, or an agent assigning someone other than themselves) · **404** · **400** `TICKET_RESOLVED` (any change to a resolved ticket, D-10) · **400** `ASSIGNEE_REQUIRED` (`assignedTo: null` on an in-progress ticket: reassign instead, D-10) · **409** (changed meanwhile; since v0.11 this includes another request changing the priority between reading and writing the ticket, so the priority and due date always match).

Fields other than `assignedTo` and `priority` are ignored (Section 2).

### `PATCH /api/tickets/:id/status` — **Implemented**

Agent\*, Admin. Moves a ticket one step forward.

Request:

```json
{ "status": "in_progress" }
```

Allowed transitions (anything else is rejected):

| From | To |
| --- | --- |
| `open` | `in_progress` |
| `in_progress` | `resolved` |

On success the server appends `{ status, changedBy, changedAt }` to `statusHistory`, and sets `resolvedAt` when the new status is `resolved`.

**Customer email (v0.10).** After a successful change, the ticket's customer gets one email, if their account is active (and they are not the person who made the change). It has an HTML and a plain-text part, and contains the ticket number, the customer's own subject, the previous and new status ("Open", "In progress", "Resolved"), a link to `/tickets/:id` built from `CLIENT_URL`, and why it was sent. It names no agent ("Our support team…") and contains nothing about other users. The email is sent in the background: the response does not wait for it, and a delivery failure is only logged and never undoes the change. The log line has the purpose, the error's code and the numeric SMTP reply code; the address, the link and the server's reply text are not logged. Rejected requests (any error above) send nothing, so a repeated request for the same change cannot send a second email. Assignment, priority changes, replies and ticket creation send no email. Delivery uses `EMAIL_TRANSPORT` (README, "Email").

**200**: `{ "ticket": { …Ticket } }`

Errors:

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `status` missing or not one of the three values |
| 400 | `TICKET_RESOLVED` | The ticket is resolved, so its status can no longer change (D-10) |
| 400 | `INVALID_STATUS_TRANSITION` | e.g. `open → resolved`, `in_progress → open`, or same status. Message names both states: "Cannot change status from open to resolved". |
| 400 | `ASSIGNEE_REQUIRED` | The ticket has no assignee: "Assign the ticket before starting work" (or "…before resolving it") (D-10) |
| 401 / 403 / 404 | | As above |

---

## 9. Comments (ticket conversation)

### `GET /api/tickets/:id/comments` — **Implemented**

Owner, Agent\*, Admin. Same access rule as `GET /api/tickets/:id`.

**200**, oldest first:

```json
{ "comments": [ { …Comment }, { …Comment } ] }
```

No pagination in the first version.

Errors: **400** `INVALID_ID` · **401** · **403** · **404** (ticket not found).

### `POST /api/tickets/:id/comments` — **Implemented**

Owner, Agent\*, Admin.

Request:

```json
{ "message": "I've sent a new reset link. Please try again within 30 minutes." }
```

| Field | Rules |
| --- | --- |
| `message` | Required string, 1–2000 characters after trimming |

The server sets `author` (from the token), `ticket` and `createdAt`. Posting a comment does **not** change the ticket status. Replies are allowed on resolved tickets (D-3).

Who may post (D-11): the owner, the **assigned** agent, and any admin. Other agents can read the conversation of an unassigned ticket (`GET`) but get **403** ("Assign this ticket to yourself to reply") when posting.

**201**: `{ "comment": { …Comment } }`

Errors: **400** `VALIDATION_ERROR` / `INVALID_ID` · **401** · **403** (outside the access rule, or an agent who is not the assignee) · **404**.

---

## 10. Categories

### `GET /api/categories` — **Implemented**

Logged in (any role). Active categories only, sorted by name. Used by the ticket form and filters.

**200**: `{ "categories": [ { …Category } ] }`

### `GET /api/admin/categories` — **Implemented**

Admin. All categories including inactive ones.

**200**: `{ "categories": [ { …Category } ] }`

### `POST /api/admin/categories` — **Implemented**

Admin.

Request: `{ "name": "Billing", "description": "Invoices and refunds" }` — `name` required, 2–50 characters, unique (case-insensitive, including inactive categories); `description` optional, at most 200 characters (D-9). New categories are active.

**201**: `{ "category": { …Category } }`

Errors: **400** `VALIDATION_ERROR` · **401** · **403** · **409** `CATEGORY_EXISTS`.

### `PATCH /api/admin/categories/:id` — **Implemented**

Admin. Rename and/or activate/deactivate. At least one field required.

Request: `{ "name": "Billing & Payments", "description": "…", "isActive": false }` — any of the three; `isActive` must be a boolean.

Deactivated categories stay on existing tickets but cannot be chosen for new ones.

**200**: `{ "category": { …Category } }`

Errors: **400** · **401** · **403** · **404** · **409** `CATEGORY_EXISTS`.

---

## 11. Admin: users and statistics

All routes under `/api/admin/*` return **403** for customers and agents.

### `GET /api/admin/users` — **Implemented**

Query (optional): `role`, `isActive` (`true`/`false`), `q` (name or email search), `page`, `limit`.

**200**: `{ "users": [ { …User, "ticketCount": 3 } ], "page": 1, "limit": 20, "total": 12 }`, newest first. `ticketCount` (D-9) is the number of tickets a customer created, or the number assigned to an agent/admin.

Errors: **400** `VALIDATION_ERROR` (bad `role`, `isActive`, `page`, `limit`, or `q` over 100 characters) · **401** · **403**.

### `PATCH /api/admin/users/:id/role` — **Implemented**

Request: `{ "role": "agent" }` — one of `customer`, `agent`, `admin`.

**200**: `{ "user": { …User } }`

Errors: **400** `VALIDATION_ERROR` · **400** `CANNOT_MODIFY_SELF` (C-2) · **401** · **403** · **404** · **409** `LAST_ACTIVE_ADMIN` (the change would leave no active admin; nothing is changed).

### `PATCH /api/admin/users/:id/status` — **Implemented**

Request: `{ "isActive": false }` — boolean.

A deactivated user cannot log in, and their existing token is refused on the next request (**403 `ACCOUNT_DISABLED`**).

**200**: `{ "user": { …User } }`

Errors: same as the role endpoint.

### `GET /api/admin/stats` — **Implemented**

Ticket volume for the admin dashboard.

**200**:

```json
{
  "total": 57,
  "byStatus": { "open": 12, "in_progress": 20, "resolved": 25 },
  "byCategory": [
    { "category": { "id": "6718f0c2a1b2c3d4e5f60100", "name": "Account & Login" }, "count": 30 },
    { "category": { "id": "6718f0c2a1b2c3d4e5f60101", "name": "Billing" }, "count": 27 }
  ]
}
```

`byStatus` always contains all three keys, with `0` where there are no tickets.

Added for the admin dashboard (D-9), after the fields above:

| Field | Meaning |
| --- | --- |
| `byPriority` | `{ "low": n, "medium": n, "high": n }` for all tickets |
| `unresolvedByPriority` | The same for tickets that are not resolved |
| `unassigned` | Unresolved tickets with no assignee |
| `byAssignee` | `[ { "assignee": UserSummary, "total": n, "byStatus": { … } } ]`, busiest first; only assigned tickets |

Query (optional): `from` — an ISO 8601 date (`2026-10-01`, meaning UTC midnight) or date-time with `Z` or an offset (`2026-10-01T00:00:00Z`); every figure then counts only tickets created at or after it. Anything else, including impossible dates such as `2026-02-31`, → **400** `VALIDATION_ERROR`.

### `GET /api/admin/analytics` — **Implemented**

The figures of the Reports page. Read-only. Every figure covers tickets **created** in the range; there is one date basis, `createdAt`. `GET /api/admin/stats` is separate and unchanged.

Query (optional, both inclusive):

| Parameter | Meaning |
| --- | --- |
| `from` | ISO 8601 date or date-time with `Z` or an offset. A date alone means the start of that UTC day. |
| `to` | The same. A date alone means the **end** of that UTC day (`23:59:59.999Z`). |

Neither means all tickets. The range is `from <= createdAt <= to`. The app sends UTC instants: rolling periods (last 7, 30 or 90 days) send `from` only (N × 24 hours before now), and a custom range sends the first and last millisecond of the chosen days in the browser's time zone, so day boundaries follow the viewer and daylight-saving changes.

**400** `VALIDATION_ERROR`, never a wider range than asked for: a blank value, a malformed or impossible date, a repeated parameter, the operator form (`from[$gt]=…`), or `to` earlier than `from`. Other parameters are ignored (§2).

**200**:

```json
{
  "filters": { "from": "2026-10-01T00:00:00.000Z", "to": null, "basis": "createdAt" },
  "asOf": "2026-10-30T12:00:00.000Z",
  "overview": { "total": 57, "unassigned": 4 },
  "byStatus": { "open": 12, "in_progress": 20, "resolved": 25, "other": 0 },
  "byPriority": { "low": 17, "medium": 30, "high": 10, "other": 0 },
  "byCategory": [{ "category": { "id": "…", "name": "Billing", "isActive": true }, "count": 27 }],
  "resolutionTime": { "averageMilliseconds": 93600000, "eligibleCount": 24, "excludedCount": 1 },
  "sla": {
    "met": 18, "missed": 5, "due": 9, "dueSoon": 3, "overdue": 7, "noSla": 15,
    "compliancePercent": 78.2, "eligibleResolvedCount": 23
  },
  "byAssignee": [{ "assignee": { "id": "…", "name": "Agent Ana" }, "total": 8, "byStatus": { "open": 1, "in_progress": 2, "resolved": 5, "other": 0 } }]
}
```

| Field | Meaning |
| --- | --- |
| `filters` | The range used, as UTC instants (`null` for no limit), and the date basis |
| `asOf` | The one time used for every current SLA state in this response |
| `overview.total` | Tickets in the range |
| `overview.unassigned` | Of those, unresolved with no assignee |
| `byStatus`, `byPriority` | **Current** status and priority of those tickets. A value outside the known ones is counted in `other`, so the totals still add up |
| `byCategory` | Most tickets first, then by name. Inactive categories are included (`isActive: false`). A deleted or missing category has `name: null` (the app shows "Unknown category"; `id` is `null` when the ticket has no reference). Categories with no tickets are left out |
| `resolutionTime` | Mean of `resolvedAt − createdAt`, in milliseconds, for resolved tickets. A resolved ticket with a missing or invalid time, or a resolution before its creation, is counted in `excludedCount` instead. `averageMilliseconds` is `null` with no eligible ticket. `updatedAt` is never used |
| `sla` | The state of each ticket from the one SLA rule (§3) at `asOf`. `met` and `missed` are resolved tickets; `due`, `dueSoon` and `overdue` are unresolved tickets (an overdue ticket is not `missed`); `noSla` has no valid `dueAt`, or is resolved with no valid `resolvedAt`. The six add up to the total |
| `sla.compliancePercent` | `met / (met + missed) × 100`, rounded **down** to one decimal, so a missed ticket never shows as 100%. `null` when `eligibleResolvedCount` (`met + missed`) is 0 |
| `byAssignee` | Assigned tickets by assignee, busiest first: id and name only. `name` is `null` for a deleted user or one who is no longer staff |

No customer details, emails, ticket subjects, descriptions, comments or tokens are returned. Resolved is final (D-3, D-10), so no ticket can be reopened. An unresolved record that has a `resolvedAt` is treated by its status: it is not counted as resolved.

Empty range: zeros, empty lists, `null` for the average and compliance.

**Limits.** The counts and the SLA states are two reads with no snapshot across them, so a ticket changing during the request can make them differ by that ticket. Each query has a 15-second limit (**500** if exceeded). A range is selected without an index on `createdAt`, so every request reads the whole collection (measured with 50,000 tickets, see `docs/TEST_EVIDENCE.md`).

Errors: **400** `VALIDATION_ERROR` · **401** · **403**.

---

## 12a. Notifications — **Implemented** (2026-10-29)

In-app notifications, stored per recipient. Every route acts on the **signed-in user's own** notifications only; the recipient never comes from the client.

**Notification**: `{ "id", "type", "title", "message", "ticket": { "id", "ticketNumber" } | null, "readAt": null | "…", "createdAt" }`. `ticket` is `null` when the reader can no longer open that ticket (e.g. it was reassigned away from them) or it no longer exists.

| Type | Created when | Recipients (never the person who acted; only active users who can access the ticket) |
| --- | --- | --- |
| `ticket_created` | A customer raises a ticket | Every active agent and admin |
| `ticket_assigned` | The assignee changes to someone | The new assignee; the customer ("is being handled") |
| `ticket_unassigned` | Someone else releases or reassigns the ticket (D-10) | The **former** assignee (if active). The one exception to the access rule: they have usually just lost access, so `ticket` is `null` for them. Not sent when you release your own ticket. |
| `priority_changed` | Only the priority changes | Customer and assignee |
| `status_changed` / `ticket_resolved` | Status moves forward (`ticket_resolved` when it becomes resolved) | Customer and assignee |
| `comment_added` | A reply is posted | Customer and assignee |

One action gives each recipient at most one notification (an assignment that also changes the priority is one `ticket_assigned`). A failure to store notifications never fails the ticket action. Reopening is not supported (D-3), so there is no "reopened" notification.

| Method | Route | Response |
| --- | --- | --- |
| GET | `/api/notifications` | Query: `unread` (`true`/`false`), `page`, `limit` (default 20, max 50). Newest first. → `{ "notifications": [ … ], "page", "limit", "total", "unreadCount" }` |
| GET | `/api/notifications/unread-count` | `{ "unreadCount": n }` |
| PATCH | `/api/notifications/:id/read` | `{ "notification": { … }, "unreadCount": n }`; marking twice keeps the first `readAt`. Another user's id → **404** (existence not revealed) |
| POST | `/api/notifications/read-all` | `{ "updated": n, "unreadCount": 0 }` |

Errors: **400** `VALIDATION_ERROR` / `INVALID_ID` · **401** · **404**.

---

## 12. Error codes

| Code | Status | Used for | Implemented |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Missing or invalid input; Mongoose validation errors | **Yes** (helper + mapping) |
| `INVALID_JSON` | 400 | Malformed JSON body | **Yes** |
| `INVALID_BODY_ENCODING` | 400 | Corrupt or cut-off compressed body (§2) | **Yes** |
| `INVALID_URL` | 400 | Bad percent-encoding in a route parameter (§2) | **Yes** |
| `INVALID_ID` | 400 | Path/body id is not a valid ObjectId | **Yes** (Mongoose CastError mapping) |
| `INVALID_STATUS_TRANSITION` | 400 | Status change not allowed | **Yes** |
| `ASSIGNEE_REQUIRED` | 400 | Starting or resolving an unassigned ticket, or releasing an in-progress one (D-10) | **Yes** |
| `TICKET_RESOLVED` | 400 | Status, assignee or priority change on a resolved ticket (D-10) | **Yes** |
| `CANNOT_MODIFY_SELF` | 400 | Admin changing own role/status | **Yes** |
| `INVALID_IDEMPOTENCY_KEY` | 400 | Malformed `Idempotency-Key` header on `POST /api/tickets` (§7) | **Yes** |
| `IDEMPOTENCY_KEY_REUSED` | 409 | `Idempotency-Key` already used for a ticket with different content (§7) | **Yes** |
| `IDEMPOTENCY_KEY_IN_USE` | 409 | The first request with this `Idempotency-Key` is still being processed (§7) | **Yes** |
| `UNAUTHORIZED` | 401 | No/invalid/expired token | **Yes** (helper) |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password | **Yes** |
| `FORBIDDEN` | 403 | Wrong role, not owner, outside access policy | **Yes** (helper) |
| `ACCOUNT_DISABLED` | 403 | Deactivated account | **Yes** |
| `NOT_FOUND` | 404 | Unknown route or resource | **Yes** |
| `METHOD_NOT_ALLOWED` | 405 | Known path, unsupported method; the `Allow` header lists the supported ones | **Yes** |
| `CONFLICT` | 409 | Generic duplicate | **Yes** (helper) |
| `DUPLICATE` | 409 | MongoDB duplicate-key error not handled explicitly | **Yes** (mapping) |
| `EMAIL_TAKEN` | 409 | Register with existing email | **Yes** |
| `CATEGORY_EXISTS` | 409 | Duplicate category name | **Yes** |
| `LAST_ACTIVE_ADMIN` | 409 | Role/status change would leave no active admin (§11) | **Yes** |
| `INVALID_CURRENT_PASSWORD` | 400 | Wrong current password in a security change (§6a) | **Yes** |
| `INVALID_OR_EXPIRED_TOKEN` | 400 | Reset or email-confirmation link unknown, expired or used (§6a) | **Yes** |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 100 kB, measured after decompression | **Yes** |
| `UNSUPPORTED_CHARSET` | 415 | Unsupported `Content-Type` charset (§2) | **Yes** |
| `UNSUPPORTED_ENCODING` | 415 | Unsupported `Content-Encoding` (§2) | **Yes** |
| `EMAIL_DELIVERY_FAILED` | 503 | The confirmation email for an email change could not be sent (§6a) | **Yes** |
| `RATE_LIMITED` | 429 | Too many sign-in or sign-up attempts from one client (D-9); sent with `Retry-After` | **Yes** |
| `INTERNAL_ERROR` | 500 | Anything unexpected | **Yes** |

Modules should throw the specific code where one is listed (e.g. `ApiError.conflict('Email is already registered', 'EMAIL_TAKEN')`) rather than relying on the generic `DUPLICATE` mapping.

---

## 13. Change log

| Date | Change | By |
| --- | --- | --- |
| 2026-10-24 | Draft v0.1: all endpoints from the brief proposed; OPEN-1 and OPEN-2 recorded | Tirth Vaghela |
| 2026-10-24 | v0.2: OPEN-2 DECIDED (JWT Bearer token in `Authorization` header, confirmed by Swati). OPEN-1 stays OPEN. Added C-6 (token storage) and C-7 (logout) as open points. | Tirth Vaghela |
| 2026-10-25 | v0.3: OPEN-1 DECIDED (option (b): unassigned tickets + tickets assigned to that agent, confirmed by Ayushi). OPEN-2 unchanged. Added C-8 (may an agent assign to another agent) as an open point. | Tirth Vaghela |
| 2026-10-25 | v0.4: added the DEFAULT state and amended the "do not implement until DECIDED" rule. Engineering defaults D-1 to D-7 (C-1, C-4, C-5, C-8, comment model, shared access helper, owner of `GET /api/tickets/:id`) and the router mounting order. Pending review by Ayushi and Swati. C-2, C-3, C-6, C-7 stay OPEN. | Tirth Vaghela |
| 2026-10-26 | v0.5: §6 auth: password limit is 72 **bytes** (rejected, not shortened); login never reveals unknown or deactivated accounts before the password is verified; missing/non-object bodies give 400. Responses follow §6 (`{ user, token }`, 409 `EMAIL_TAKEN`, 401 `INVALID_CREDENTIALS`); `GET /api/auth/me` implemented. | Tirth Vaghela |
| 2026-10-29 | v0.6: every endpoint in §4 implemented and tested. §7 customer tickets aligned with this contract (`{ ticket }`, `{ tickets, page, limit, total }`, error envelope, `categoryId`, filters). §10 admin categories and §11 admin users implemented. C-2 → DEFAULT D-8 (`CANNOT_MODIFY_SELF`). D-9 records the additive extensions (profile name update, category description, `ticketCount`, extra stats and `from`, `category` alias and default priority, `/my` filters, sign-in rate limiting with `429 RATE_LIMITED`). C-3, C-6, C-7 stay OPEN. Pending review by Swati and Ayushi. | Tirth Vaghela |
| 2026-10-29 | v0.7: §6a account security (password change, email change with confirmation, forgot/reset password) and §12a in-app notifications. Tokens carry a version (`ver`) so a password change or reset signs the user out everywhere (partly answers C-7). New error codes `INVALID_CURRENT_PASSWORD`, `INVALID_OR_EXPIRED_TOKEN`, `EMAIL_DELIVERY_FAILED`. Review fixes: §11 `409 LAST_ACTIVE_ADMIN` (D-8 no longer relies on self-protection alone); stats `from` accepts ISO 8601 only. | Tirth Vaghela |
| 2026-10-29 | v0.8: D-10 ticket ownership (in-progress and resolved tickets always have an assignee; resolved is final; `ASSIGNEE_REQUIRED`, `TICKET_RESOLVED`; `ticket_unassigned` notification). D-11 replies: agents only on tickets assigned to them. | Tirth Vaghela |
| 2026-10-29 | v0.9: duplicate ticket submissions (§7): optional `Idempotency-Key` header on `POST /api/tickets`; a repeat returns the original ticket (200, `Idempotent-Replayed: true`). New error codes `INVALID_IDEMPOTENCY_KEY`, `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_KEY_IN_USE`. Backward compatible: requests without the header behave as before. | Tirth Vaghela |
| 2026-10-30 | v0.10: §8 `PATCH /api/tickets/:id/status` emails the ticket's active customer after a successful change (background delivery, failures logged only, no email for rejected requests or other ticket changes). No request or response changes. | Tirth Vaghela |
| 2026-10-30 | v0.11: SLA due dates. Ticket `dueAt` (staff responses only) = `createdAt` + resolution target for the priority (defaults 24 / 72 / 168 calendar hours, `SLA_HOURS_*`); set on creation, recalculated from `createdAt` when the priority changes; `null` for older tickets. `PATCH …/assign` returns 409 if the priority changed meanwhile. SLA states defined in §3. Additive: no field removed or renamed. | Tirth Vaghela |
| 2026-10-30 | v0.12: `GET /api/admin/analytics` (§11), the figures of the Reports page: status, priority, category, resolution time, SLA and assignee figures for tickets created in an inclusive `from`..`to` range. Additive: `GET /api/admin/stats` is unchanged. | Tirth Vaghela |
| 2026-10-30 | Documentation only, no API change: removed stray text from the title, replaced the out-of-date "proposal" status, listed §6a and §12a in the contents, recorded that `sessionStorage` is what runs for C-6, and corrected what a failed email logs. | Tirth Vaghela |
| 2026-10-30 | Behaviour only, no request or response field changed: §6a links are cancelled after a password or email change (500 if that fails), and §8 failed emails log only the purpose and error codes. | Tirth Vaghela |
| 2026-10-31 | Documentation only, no API change: §6 described as implemented, with its routes listed; §6 no longer says email and password changes do not exist; D-1 to D-11 joined in one table; 405, 429 and 503 added to the §2 status table; §4, D-5 and D-7 ownership follow the final team responsibilities. | Tirth Vaghela |
| 2026-10-31 | v0.13: malformed requests (§2). New error codes `INVALID_BODY_ENCODING`, `INVALID_URL`, `UNSUPPORTED_CHARSET` and `UNSUPPORTED_ENCODING`, and status 415. These requests previously gave 500 `INTERNAL_ERROR`; existing fields and routes are unchanged. | Tirth Vaghela |
