# Help Desk API Contract

> **Status: PROPOSAL (draft v0.3).** Except for `GET /api/health`, **none of the endpoints below are implemented yet.**
> This document is the agreement the backend and frontend build against. Change it through a pull request so everyone sees the change, and update the **Status** column when an endpoint is merged into `main`.

Source: project brief *Help Desk — Customer Support Ticket System* v0.2 (Sections 2, 4, 5 and 8). Where the brief leaves a choice open, this document says so.

## Contents

1. [Decisions](#1-decisions)
2. [Conventions](#2-conventions)
3. [Data shapes](#3-data-shapes)
4. [Endpoint summary](#4-endpoint-summary)
5. [Health](#5-health)
6. [Authentication](#6-authentication)
7. [Customer tickets](#7-customer-tickets)
8. [Agent and admin ticket workflow](#8-agent-and-admin-ticket-workflow)
9. [Comments (ticket conversation)](#9-comments-ticket-conversation)
10. [Categories](#10-categories)
11. [Admin: users and statistics](#11-admin-users-and-statistics)
12. [Error codes](#12-error-codes)
13. [Change log](#13-change-log)

---

## 1. Decisions

These must be agreed by the team before the related code is written. **Do not implement an option until it is marked DECIDED here.**

| ID | Topic | State |
| --- | --- | --- |
| OPEN-1 | Agent access policy | **DECIDED** (2026-10-25): option (b), unassigned tickets + tickets assigned to that agent |
| OPEN-2 | How the auth token is sent | **DECIDED** (2026-10-24): JWT Bearer token in the `Authorization` header |
| C-1 … C-8 | Smaller points | **OPEN** (proposals only) |

### OPEN-1: Agent access policy — DECIDED

**Decision (2026-10-25):** Option (b), **Unassigned + own**. Confirmed by Ayushi (agent workflow owner).

> An agent can access tickets where `assignedTo` is `null` **or** `assignedTo` is that agent.

- The backend applies this rule **in the database query** (for lists) **and** on every single-ticket request. Hiding items in the UI is not enough.
- Endpoints that depend on this rule are marked **"Agent\*"** below. An agent requesting a ticket outside the rule gets **403 `FORBIDDEN`**.

Option (a), all tickets, was not chosen.

**Not covered by this decision** (still open): whether an agent may assign a ticket to a *different* agent, or only to themselves (C-8), and who can be an assignee (C-5).

### OPEN-2: How the auth token is sent — DECIDED

**Decision (2026-10-24):** Option (A), **JWT Bearer token**. Confirmed by Swati (authentication owner).

- `POST /api/auth/register` and `POST /api/auth/login` return the JWT in the JSON response body as `token`.
- The frontend sends it on every protected request as `Authorization: Bearer <token>`.
- The API does not set or read authentication cookies. CORS does not need `credentials`.

Option (B), an httpOnly cookie, was not chosen.

**Not covered by this decision** (still open, see the table below): token lifetime (C-3), where the frontend keeps the token (C-6), and logout behaviour (C-7).

### Smaller points to confirm (all OPEN)

| # | Question | Proposal in this document |
| --- | --- | --- |
| C-1 | Can replies be added to a **resolved** ticket? | Yes (no restriction). |
| C-2 | Can an admin change their **own** role or deactivate themselves? | No: returns 400 `CANNOT_MODIFY_SELF`, to avoid locking out the only admin. |
| C-3 | Token lifetime | 1 day (`JWT_EXPIRES_IN=1d`). No refresh tokens. |
| C-4 | Is `category` a reference to the Category collection or a fixed list? | Reference to an active Category (admins manage categories, per the brief). |
| C-5 | Who can be an assignee? | Active users with role `agent` or `admin`. |
| C-6 | Where does the frontend keep the token (e.g. `localStorage`, `sessionStorage`, memory)? | No proposal yet. Affects whether a session survives a page reload or a closed tab. |
| C-7 | Logout: does the client just discard the token, or does the server also need a logout/revocation endpoint? | Client discards the token; no server endpoint. |
| C-8 | Under OPEN-1, may an agent assign a ticket to a *different* agent, or only to themselves? | No proposal yet. |

---

## 2. Conventions

### Base URL

- Local: `http://localhost:4000`
- Frontend reads it from `VITE_API_URL`.
- All routes start with `/api`.

### Requests

- JSON bodies with `Content-Type: application/json`. Maximum body size: 100 kB.
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

Every error uses one envelope. This is already implemented in `backend/src/middleware/errorHandler.js`.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Subject is required" } }
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid input (missing field, bad value, invalid ID, invalid status transition) |
| 401 | Not logged in, or token missing/invalid/expired |
| 403 | Logged in, but not allowed (wrong role, not the owner, outside access policy, account deactivated) |
| 404 | Resource or route does not exist |
| 409 | Duplicate (e.g. email already registered) |
| 413 | Request body too large |
| 500 | Unexpected server error. Message is always generic; details are only logged on the server. |

**`message` is safe to show to users. Frontend logic should branch on `status` and `code`, never on the message text.**

Backend helpers (implemented): `ApiError.badRequest()`, `.unauthorized()`, `.forbidden()`, `.notFound()`, `.conflict()` in `backend/src/utils/ApiError.js`, and `requireString`, `requireOneOf`, `requireEmail` in `backend/src/utils/validate.js`. Mongoose validation errors, invalid ObjectIds and duplicate-key errors are converted to 400 / 400 / 409 automatically.

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
{ "id": "6718f0c2a1b2c3d4e5f60100", "name": "Account & Login", "isActive": true }
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

In **list** responses, tickets omit `description` and `statusHistory` to keep payloads small.

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

"Agent\*" means: agents only for tickets that are unassigned or assigned to them (OPEN-1, decided). Owners are the customer who created the ticket.

| Method | Route | Allowed | Owner (proposed) | Status |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | Public | Tirth | **Implemented** |
| POST | `/api/auth/register` | Public | Swatismita | Proposed |
| POST | `/api/auth/login` | Public | Swatismita | Proposed |
| GET | `/api/auth/me` | Logged in | Swatismita | Proposed |
| POST | `/api/tickets` | Customer | Swatismita | Proposed |
| GET | `/api/tickets/my` | Customer | Swatismita | Proposed |
| GET | `/api/tickets` | Agent\*, Admin | Ayushi | Proposed |
| GET | `/api/tickets/:id` | Owner, Agent\*, Admin | Swatismita (ownership) / Ayushi (agent access) | Proposed |
| PATCH | `/api/tickets/:id/assign` | Agent\*, Admin | Ayushi | Proposed |
| PATCH | `/api/tickets/:id/status` | Agent\*, Admin | Ayushi | Proposed |
| GET | `/api/tickets/:id/comments` | Owner, Agent\*, Admin | Ayushi | Proposed |
| POST | `/api/tickets/:id/comments` | Owner, Agent\*, Admin | Ayushi | Proposed |
| GET | `/api/categories` | Logged in | Swatismita | Proposed |
| GET | `/api/admin/categories` | Admin | Swatismita | Proposed |
| POST | `/api/admin/categories` | Admin | Swatismita | Proposed |
| PATCH | `/api/admin/categories/:id` | Admin | Swatismita | Proposed |
| GET | `/api/admin/users` | Admin | Swatismita | Proposed |
| PATCH | `/api/admin/users/:id/role` | Admin | Swatismita | Proposed |
| PATCH | `/api/admin/users/:id/status` | Admin | Swatismita | Proposed |
| GET | `/api/admin/stats` | Admin | Ayushi | Proposed |

Owners follow the team allocation and can be reassigned by agreement. `GET /api/admin/categories` is an addition to the brief so admins can see inactive categories.

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

> **Transport decided (OPEN-2):** the JWT is returned as `token` in the response body and sent back as `Authorization: Bearer <token>`. The endpoints below are still **proposed, not implemented**, and token lifetime, storage and logout remain open (C-3, C-6, C-7).

### `POST /api/auth/register` — Proposed

Public. Creates a **customer** account.

Request:

```json
{ "name": "Asha Customer", "email": "asha@example.com", "password": "correct-horse-battery" }
```

| Field | Rules |
| --- | --- |
| `name` | Required string, 2–80 characters after trimming |
| `email` | Required, valid email, stored lower-cased, unique |
| `password` | Required string, 8–72 characters (72 is bcrypt's input limit) |
| `role` | **Ignored if sent.** The server always sets `role: "customer"`. |

**201**:

```json
{ "user": { "id": "…", "name": "Asha Customer", "email": "asha@example.com", "role": "customer", "isActive": true, "createdAt": "…" }, "token": "<jwt>" }
```

Errors: **400** `VALIDATION_ERROR` · **409** `EMAIL_TAKEN` ("Email is already registered").

### `POST /api/auth/login` — Proposed

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
| 401 | `INVALID_CREDENTIALS` | Unknown email **or** wrong password. Same message for both ("Invalid email or password") so attackers cannot discover which emails exist. |
| 403 | `ACCOUNT_DISABLED` | Correct credentials but `isActive` is `false` |

### `GET /api/auth/me` — Proposed

Logged in (any role). Used by the frontend to restore the session on page load.

**200**: `{ "user": { …User } }`

Errors: **401** `UNAUTHORIZED` (no/invalid/expired token) · **403** `ACCOUNT_DISABLED`.

### Token rules (all protected routes)

Decided (OPEN-2):

- The token is read **only** from the `Authorization` header, in the form `Bearer <token>`. A missing header or any other scheme → **401 `UNAUTHORIZED`**.

Proposed (not yet confirmed):

- JWT signed with `JWT_SECRET`, payload contains only the user id (`sub`). Lifetime per C-3.
- **The role is read from the database on every request, not from the token or the client.** This means a role change or deactivation takes effect immediately.
- Malformed, expired or wrongly-signed token → **401 `UNAUTHORIZED`**.
- Token for a user that no longer exists → **401 `UNAUTHORIZED`**.
- Token for a deactivated user → **403 `ACCOUNT_DISABLED`**.
- Logout: see C-7.

---

## 7. Customer tickets

### `POST /api/tickets` — Proposed

Customer only. Agents and admins get **403**.

Request:

```json
{ "subject": "Unable to reset password", "description": "The reset link in the email says it has expired.", "categoryId": "6718f0c2a1b2c3d4e5f60100", "priority": "medium" }
```

| Field | Rules |
| --- | --- |
| `subject` | Required string, 5–120 characters |
| `description` | Required string, 10–5000 characters |
| `categoryId` | Required, must be an existing **active** category |
| `priority` | Required, one of `low`, `medium`, `high` (an agent may change it later) |

The server sets `ticketNumber`, `status: "open"`, `createdBy` (from the token), `assignedTo: null`, and the first `statusHistory` entry.

**201**: `{ "ticket": { …Ticket } }`

Errors: **400** `VALIDATION_ERROR` (missing subject, bad priority, unknown/inactive category, etc.) · **401** · **403** `FORBIDDEN`.

Duplicate submissions: the frontend must disable the submit button while the request is in flight, so a double-click creates one ticket.

### `GET /api/tickets/my` — Proposed

Customer only. Returns only tickets where `createdBy` is the current user, newest first.

Query (all optional): `status`, `page` (default 1), `limit` (default 20, max 100).

**200**:

```json
{ "tickets": [ { …Ticket without description/statusHistory } ], "page": 1, "limit": 20, "total": 3 }
```

An empty list is `"tickets": []` with `total: 0`, not an error.

Errors: **400** (bad `status`/`page`/`limit`) · **401** · **403** (non-customer).

### `GET /api/tickets/:id` — Proposed

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

### `GET /api/tickets` — Proposed

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

### `PATCH /api/tickets/:id/assign` — Proposed

Agent\*, Admin. Assign or unassign an agent, and/or set priority. At least one field is required.

Request:

```json
{ "assignedTo": "6718f0c2a1b2c3d4e5f60002", "priority": "high" }
```

| Field | Rules |
| --- | --- |
| `assignedTo` | Optional. User id of an **active** `agent` or `admin` (C-5), or `null` to unassign. Whether an agent may set this to someone other than themselves is open (C-8). |
| `priority` | Optional. `low`, `medium` or `high`. |

**200**: `{ "ticket": { …Ticket } }`

Errors: **400** `VALIDATION_ERROR` (no fields, bad priority, assignee not an active agent/admin) · **400** `INVALID_ID` · **401** · **403** · **404**.

### `PATCH /api/tickets/:id/status` — Proposed

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

**200**: `{ "ticket": { …Ticket } }`

Errors:

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `status` missing or not one of the three values |
| 400 | `INVALID_STATUS_TRANSITION` | e.g. `open → resolved`, `resolved → open`, or same status. Message names both states: "Cannot change status from open to resolved". |
| 401 / 403 / 404 | | As above |

---

## 9. Comments (ticket conversation)

### `GET /api/tickets/:id/comments` — Proposed

Owner, Agent\*, Admin. Same access rule as `GET /api/tickets/:id`.

**200**, oldest first:

```json
{ "comments": [ { …Comment }, { …Comment } ] }
```

No pagination in the first version.

Errors: **400** `INVALID_ID` · **401** · **403** · **404** (ticket not found).

### `POST /api/tickets/:id/comments` — Proposed

Owner, Agent\*, Admin.

Request:

```json
{ "message": "I've sent a new reset link. Please try again within 30 minutes." }
```

| Field | Rules |
| --- | --- |
| `message` | Required string, 1–2000 characters after trimming |

The server sets `author` (from the token), `ticket` and `createdAt`. Posting a comment does **not** change the ticket status. Resolved tickets: see C-1.

**201**: `{ "comment": { …Comment } }`

Errors: **400** `VALIDATION_ERROR` / `INVALID_ID` · **401** · **403** · **404**.

---

## 10. Categories

### `GET /api/categories` — Proposed

Logged in (any role). Active categories only, sorted by name. Used by the ticket form and filters.

**200**: `{ "categories": [ { …Category } ] }`

### `GET /api/admin/categories` — Proposed

Admin. All categories including inactive ones.

**200**: `{ "categories": [ { …Category } ] }`

### `POST /api/admin/categories` — Proposed

Admin.

Request: `{ "name": "Billing" }` — required, 2–50 characters, unique (case-insensitive).

**201**: `{ "category": { …Category } }`

Errors: **400** `VALIDATION_ERROR` · **401** · **403** · **409** `CATEGORY_EXISTS`.

### `PATCH /api/admin/categories/:id` — Proposed

Admin. Rename and/or activate/deactivate. At least one field required.

Request: `{ "name": "Billing & Payments", "isActive": false }`

Deactivated categories stay on existing tickets but cannot be chosen for new ones.

**200**: `{ "category": { …Category } }`

Errors: **400** · **401** · **403** · **404** · **409** `CATEGORY_EXISTS`.

---

## 11. Admin: users and statistics

All routes under `/api/admin/*` return **403** for customers and agents.

### `GET /api/admin/users` — Proposed

Query (optional): `role`, `isActive` (`true`/`false`), `q` (name or email search), `page`, `limit`.

**200**: `{ "users": [ { …User } ], "page": 1, "limit": 20, "total": 12 }`

### `PATCH /api/admin/users/:id/role` — Proposed

Request: `{ "role": "agent" }` — one of `customer`, `agent`, `admin`.

**200**: `{ "user": { …User } }`

Errors: **400** `VALIDATION_ERROR` · **400** `CANNOT_MODIFY_SELF` (C-2) · **401** · **403** · **404**.

### `PATCH /api/admin/users/:id/status` — Proposed

Request: `{ "isActive": false }` — boolean.

A deactivated user cannot log in, and their existing token is refused on the next request (**403 `ACCOUNT_DISABLED`**).

**200**: `{ "user": { …User } }`

Errors: same as the role endpoint.

### `GET /api/admin/stats` — Proposed

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

---

## 12. Error codes

| Code | Status | Used for | Implemented |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Missing or invalid input; Mongoose validation errors | **Yes** (helper + mapping) |
| `INVALID_JSON` | 400 | Malformed JSON body | **Yes** |
| `INVALID_ID` | 400 | Path/body id is not a valid ObjectId | **Yes** (Mongoose CastError mapping) |
| `INVALID_STATUS_TRANSITION` | 400 | Status change not allowed | Proposed |
| `CANNOT_MODIFY_SELF` | 400 | Admin changing own role/status | Proposed |
| `UNAUTHORIZED` | 401 | No/invalid/expired token | **Yes** (helper) |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password | Proposed |
| `FORBIDDEN` | 403 | Wrong role, not owner, outside access policy | **Yes** (helper) |
| `ACCOUNT_DISABLED` | 403 | Deactivated account | Proposed |
| `NOT_FOUND` | 404 | Unknown route or resource | **Yes** |
| `CONFLICT` | 409 | Generic duplicate | **Yes** (helper) |
| `DUPLICATE` | 409 | MongoDB duplicate-key error not handled explicitly | **Yes** (mapping) |
| `EMAIL_TAKEN` | 409 | Register with existing email | Proposed |
| `CATEGORY_EXISTS` | 409 | Duplicate category name | Proposed |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 100 kB | **Yes** |
| `INTERNAL_ERROR` | 500 | Anything unexpected | **Yes** |

Modules should throw the specific code where one is listed (e.g. `ApiError.conflict('Email is already registered', 'EMAIL_TAKEN')`) rather than relying on the generic `DUPLICATE` mapping.

---

## 13. Change log

| Date | Change | By |
| --- | --- | --- |
| 2026-10-24 | Draft v0.1: all endpoints from the brief proposed; OPEN-1 and OPEN-2 recorded | Tirth Vaghela |
| 2026-10-24 | v0.2: OPEN-2 DECIDED (JWT Bearer token in `Authorization` header, confirmed by Swati). OPEN-1 stays OPEN. Added C-6 (token storage) and C-7 (logout) as open points. | Tirth Vaghela |
| 2026-10-25 | v0.3: OPEN-1 DECIDED (option (b): unassigned tickets + tickets assigned to that agent, confirmed by Ayushi). OPEN-2 unchanged. Added C-8 (may an agent assign to another agent) as an open point. | Tirth Vaghela |
