# Help Desk Data Model

> **Status: implemented.** Every model below exists in `backend/src/models/`. The labels (Confirmed, Proposed, Open, Default) record where each decision came from and whether the responsible owner has agreed; they do not mean the item is unbuilt. Engineering defaults D-1 to D-7 from [API_CONTRACT.md §1](API_CONTRACT.md#engineering-defaults-d1d7) are marked **Default**.
> This document does not change [API_CONTRACT.md](API_CONTRACT.md); where the two differ, the difference is recorded in [Section 9](#9-discrepancies-between-sources) instead of being resolved here.

## Contents

1. [Status, sources and labels](#1-status-sources-and-labels)
2. [Shared conventions and JSON serialization](#2-shared-conventions-and-json-serialization)
3. [Models](#3-models)
4. [Relationships](#4-relationships)
5. [Indexes and the queries they serve](#5-indexes-and-the-queries-they-serve)
6. [Ticket-number generation](#6-ticket-number-generation)
7. [Authorization and `assignedTo`](#7-authorization-and-assignedto)
8. [Open questions](#8-open-questions)
9. [Discrepancies between sources](#9-discrepancies-between-sources)
10. [Ownership and review](#10-ownership-and-review)
11. [Change log](#11-change-log)

---

## 1. Status, sources and labels

### Sources

| Short name | Document | Notes |
| --- | --- | --- |
| **Brief** | *Help Desk — Customer Support Ticket System*, project documentation v0.2 (`Help Desk.pdf`, kept outside this repository) | Marks each item as HANDBOOK (stated in the WeIntern handbook) or PROPOSED (team suggestion). Section 4 says collection names come from the handbook, but **field lists are proposals**. |
| **Contract** | [docs/API_CONTRACT.md](API_CONTRACT.md), v0.12 | Implemented. Its §1 records which points are **DECIDED**, **DEFAULT** or **OPEN**. |

### Labels used in this document

| Label | Meaning |
| --- | --- |
| **Confirmed** | Stated as a HANDBOOK requirement in the Brief, or marked DECIDED in the Contract. |
| **Proposed** | A suggestion: either from the Contract draft / Brief PROPOSED items (source given), or new in this document (marked "this doc"). Not yet approved. |
| **Open** | Needs a decision from the responsible teammates. Listed in [Section 8](#8-open-questions). |
| **Default** | An engineering default (D-1 to D-7 in the Contract) chosen to unblock implementation. Not a team approval; confirmed by the owner when reviewing the implementing pull request. |

Field rules such as lengths and enum spellings come from the Contract draft. They are **Proposed** until the model owners approve them, even though the frontend may already be building against them.

---

## 2. Shared conventions and JSON serialization

| # | Convention | Label | Source |
| --- | --- | --- | --- |
| S-1 | Passwords are stored only as a salted hash and **never returned by any API**. | **Confirmed** | Brief §5 (HANDBOOK) |
| S-2 | Hash with bcrypt. | Proposed | Brief §5 (PROPOSED) |
| S-3 | API responses expose the id as `id` (string), never `_id`. | Proposed | Contract §2 |
| S-4 | `__v` is never included in responses. | Proposed | this doc |
| S-5 | Timestamps are returned as ISO 8601 strings in UTC. | Proposed | Contract §2 |
| S-6 | Referenced users are returned as `UserSummary` `{ id, name, role }`; referenced categories as `{ id, name }`. | Proposed | Contract §3 |
| S-7 | Ticket **list** responses omit `description` and `statusHistory`. | Proposed | Contract §3 |
| S-8 | Implement S-1, S-3 and S-4 once, as a shared Mongoose `toJSON` transform, instead of in each controller. Where it lives is open (Q-8). | Proposed | this doc |
| S-9 | Use Mongoose `timestamps` for `createdAt` / `updatedAt` rather than setting them by hand. | Proposed | this doc |
| S-10 | Fixed value sets (roles, statuses, priorities) are enforced as schema `enum`s, so invalid values are rejected by the database layer as well as by request validation. | Proposed | this doc |
| S-11 | Strings are trimmed by the schema (`trim: true`) as well as by request validation. | Proposed | this doc (Contract §2 says inputs are trimmed) |

Model validation errors, invalid ObjectIds and duplicate keys are already converted to the standard error envelope by `backend/src/middleware/errorHandler.js` (implemented). Request-level validation should still run first so users get the specific error codes listed in the Contract.

---

## 3. Models

Types are Mongoose schema types. "Ref" means `Schema.Types.ObjectId` with `ref` to the named model.

### 3.1 User

| Field | Type | Rules | Label | Source |
| --- | --- | --- | --- | --- |
| *(model)* | — | Collection for all three account types | **Confirmed** | Brief §4 (HANDBOOK collection name) |
| `name` | String | Required, trimmed, 2–80 characters | Proposed | Contract §6 |
| `email` | String | Required, unique, stored lower-cased, valid email, at most 254 characters | Proposed | Brief §4 ("email (unique)", PROPOSED), Contract §6 |
| `passwordHash` | String | Required. Never serialized (S-1). | **Confirmed** (hash only, never returned) | Brief §5 (HANDBOOK) |
| | | Excluded from queries by default (`select: false`); login explicitly selects it. | Proposed | this doc |
| `role` | String enum | Three roles: customer, support agent, administrator | **Confirmed** (the three roles) | Brief §2 (HANDBOOK) |
| | | Stored values `customer`, `agent`, `admin`; default `customer` | Proposed | Brief §4, Contract §3 |
| | | Public signup always creates `customer`; agent/admin only set by an admin | **Confirmed** | Brief §2 (HANDBOOK) |
| `isActive` | Boolean | Default `true`. Admin can activate/deactivate. | **Confirmed** (activate/deactivate exists) | Brief §2 (HANDBOOK, admin controls) |
| `tokenVersion` | Number | Default `0`. Copied into every sign-in token (`ver`); a password change or reset increments it, so every earlier token is refused. Never serialized. | Implemented (2026-10-29) | Contract §6 token rules, §6a |
| `createdAt` | Date | Set on creation | Proposed | Brief §4, Contract §3 |
| `updatedAt` | Date | Set on update | Proposed | this doc (S-9); not in Brief or Contract |

Password length rule (8–72 characters) applies to the **request**, not to the stored hash. Proposed, Contract §6.

### 3.2 Category

Stored as its own collection: **Default** (D-6, contract C-4). Inactive categories stay on existing tickets, in ticket details, statistics and queue filters, but cannot be chosen for new tickets.

| Field | Type | Rules | Label | Source |
| --- | --- | --- | --- | --- |
| *(model)* | — | Admins manage categories | **Confirmed** (admins manage categories) | Brief §2 (HANDBOOK, admin controls) |
| | | Stored as its own collection | **Open** (Q-1) | Brief §4 lists it as *optional*; Contract C-4 proposes a collection |
| `name` | String | Required, trimmed, 2–50 characters, unique **case-insensitive** | Proposed | Contract §10 |
| `description` | String | Optional, trimmed, at most 200 characters, default `""` | Implemented (2026-10-29) | Contract D-9 (admin category screen) |
| `isActive` | Boolean | Default `true`. Inactive categories stay on existing tickets but cannot be chosen for new ones. | Proposed | Brief §4 (field listed), Contract §10 |
| `createdAt`, `updatedAt` | Date | Via `timestamps` | Proposed | this doc (S-9) |

### 3.3 Ticket

| Field | Type | Rules | Label | Source |
| --- | --- | --- | --- | --- |
| *(model)* | — | | **Confirmed** | Brief §4 (HANDBOOK collection name) |
| `ticketNumber` | String | Required, unique, generated by the server | **Confirmed** (unique reference for every ticket) | Brief §2 (HANDBOOK) |
| | | Format `HD-` + sequential number | Proposed | Brief §2 (PROPOSED), Contract §3 |
| `subject` | String | Required, trimmed, 5–120 characters | Proposed (field itself **Confirmed**) | Brief §2 (HANDBOOK: customer submits subject); lengths Contract §7 |
| `description` | String | Required, trimmed, 10–5000 characters | Proposed (field itself **Confirmed**) | Brief §2 (HANDBOOK); lengths Contract §7 |
| `category` | Ref Category | Required; must be active when the ticket is created | Proposed (a category on each ticket is **Confirmed**) | Brief §2 (HANDBOOK); reference vs fixed list is **Open** (Q-1) |
| `priority` | String enum | Values `low`, `medium`, `high`. Customer sets it on creation; an agent may change it. | **Confirmed** (customer submits priority; agent sets priority) | Brief §2 (HANDBOOK) |
| | | Exact values `low`/`medium`/`high` | Proposed | Brief §4, Contract §3 |
| `status` | String enum | Workflow Open → In Progress → Resolved | **Confirmed** | Brief §2 (HANDBOOK) |
| | | Stored values `open`, `in_progress`, `resolved`; default `open` | Proposed | Brief §4, Contract §3 |
| `statusHistory` | Array of `{ status: String enum, changedBy: Ref User, changedAt: Date }` | Oldest first. First entry (`open`) written at creation. No sub-document `_id`. | **Confirmed** (status history visible on the ticket) | Brief §2 (HANDBOOK) |
| | | Field shape and first-entry rule | Proposed | Brief §4, Contract §3; `_id: false` is this doc |
| `createdBy` | Ref User | Required. Set from the authenticated user, never from the request body. | **Confirmed** (ticket references its owner) | Brief §4 (HANDBOOK) |
| `assignedTo` | Ref User | `null` when unassigned. Default `null`. | **Confirmed** (ticket references assigned agent) | Brief §4 (HANDBOOK) |
| | | `null` meaning "unassigned" is part of the access rule | **Confirmed** | Contract OPEN-1 (DECIDED) |
| | | Who may be assigned, and by whom | **Open** (Q-5) | Contract C-5, C-8 |
| `resolvedAt` | Date | `null` until status becomes `resolved` | Proposed | Brief §4, Contract §3 |
| `dueAt` | Date | SLA resolution due date: `createdAt` + the target hours for the priority (`utils/sla.js`; defaults high 24, medium 72, low 168 calendar hours from `SLA_HOURS_*`). Set by the server on creation; recalculated from `createdAt` in the same atomic update when the priority changes. Default `null`: tickets created before SLAs keep no due date (no backfill). Returned to staff only. | Implemented (2026-10-30) | Stretch goal "SLA due dates", Contract §3 |
| `createdAt`, `updatedAt` | Date | Via `timestamps` | Proposed | Brief §4, Contract §3 |

Status transitions allowed: `open → in_progress`, `in_progress → resolved`; anything else is rejected. The **workflow** is Confirmed (Brief §2); the exact rejection behaviour (400 `INVALID_STATUS_TRANSITION`) is Proposed (Contract §8). Enforcement belongs in the status endpoint, not the schema.

### 3.4 TicketComment (Contract shape name: "Comment")

Model name **`TicketComment`**: **Default** (D-4). The API keeps the JSON shape name "Comment" and the keys `comment` / `comments`. Implemented by the agent-workflow module. See [Section 9](#9-discrepancies-between-sources).

| Field | Type | Rules | Label | Source |
| --- | --- | --- | --- | --- |
| *(model)* | — | One reply thread per ticket; stored separately from the ticket | **Confirmed** (one thread per ticket); separate storage Proposed | Brief §2 (HANDBOOK); Brief §4 (PROPOSED reason: long threads would bloat the ticket) |
| `ticket` | Ref Ticket | Required | Proposed | Brief §4, Contract §3 |
| `author` | Ref User | Required. Set from the authenticated user. | Proposed | Brief §4, Contract §3 |
| `message` | String | Required, trimmed, 1–2000 characters | Proposed | Contract §9 |
| `createdAt` | Date | Visible timestamp on every message | **Confirmed** (every message shows a timestamp) | Brief §2 (HANDBOOK) |
| `updatedAt` | — | Not stored: comments are not edited in any proposed endpoint | Proposed | this doc (`timestamps: { createdAt: true, updatedAt: false }`) |

### 3.5 Counter

Supports ticket-number generation ([Section 6](#6-ticket-number-generation)). Not mentioned in the Brief.

| Field | Type | Rules | Label | Source |
| --- | --- | --- | --- | --- |
| *(approach)* | — | Generate numbers with an atomic counter, not by counting documents | Proposed | Contract §3 (recommendation to model owner) |
| *(model)* | — | Separate `Counter` collection | Proposed | this doc |
| `_id` | String | Counter name, e.g. `"ticket"` | Proposed | this doc |
| `seq` | Number | Last number issued | Proposed | this doc |

### 3.6 AuthToken (implemented 2026-10-29)

One-time links for password reset and email-change confirmation (contract §6a).

| Field | Type | Rules |
| --- | --- | --- |
| `user` | Ref User | Required |
| `purpose` | String enum | `password_reset` or `email_change` |
| `tokenHash` | String | Required, unique. SHA-256 of the token; the token itself exists only in the email. |
| `newEmail` | String | `email_change` only: the address that becomes the sign-in email once confirmed |
| `expiresAt` | Date | Required. **TTL index** (`expireAfterSeconds: 0`) deletes expired documents; the code also checks it. |
| `createdAt` | Date | Used for the one-reset-email-per-minute cooldown |

Using a token is an atomic `findOneAndDelete`, so a link works exactly once. Issuing a new token deletes older ones of the same purpose for that user. Indexes: `{ tokenHash }` unique, `{ expiresAt }` TTL, `{ user, purpose, createdAt: -1 }`.

### 3.7 Notification (implemented 2026-10-29)

In-app notifications (contract §12a). One document per recipient.

| Field | Type | Rules |
| --- | --- | --- |
| `recipient` | Ref User | Required. Always set by the server. |
| `type` | String enum | `ticket_created`, `ticket_assigned`, `ticket_unassigned` (D-10), `priority_changed`, `status_changed`, `ticket_resolved`, `comment_added` |
| `title` | String | Required, at most 120 characters |
| `message` | String | Required, at most 300 characters |
| `ticket` | Ref Ticket | The related ticket, or `null` |
| `readAt` | Date | `null` while unread |
| `createdAt` | Date | Via `timestamps` (no `updatedAt`) |

Indexes: `{ recipient, createdAt: -1, _id: -1 }` (newest-first list with stable pages) and `{ recipient, readAt }` (unread count).

### 3.7a TicketSubmission (implemented 2026-10-29)

One record per ticket submission sent with an `Idempotency-Key` (contract §7). It lets a retried submission return the ticket it created instead of creating another.

| Field | Type | Rules |
| --- | --- | --- |
| `_id` | String | `"<userId>:<Idempotency-Key>"`. MongoDB's built-in unique `_id` index makes claiming a key atomic: of several identical requests exactly one insert succeeds. |
| `ticket` | Ref Ticket | Required. The id the ticket is created with (chosen before it is inserted). |
| `fingerprint` | String | Required. SHA-256 of the validated subject, description, category and priority, so a key cannot be reused for other content. |
| `createdAt` | Date | Via `timestamps` (no `updatedAt`). A claim older than 30 s whose ticket does not exist is treated as abandoned and released. |

No index other than `_id`, and no change to existing collections. Records are kept (no expiry).

### 3.8 Not included

| Item | Label | Note |
| --- | --- | --- |
| `TicketHistory` (full audit trail of assignment, priority and status changes) | **Open** (Q-4) | Brief §4 lists it as *optional*. Not in the Contract. |
| Session collection | Not needed | Contract OPEN-2 (DECIDED): stateless JWT Bearer token. Sign-out everywhere uses `User.tokenVersion`; single-session revocation is part of open point C-7. |

---

## 4. Relationships

```
User 1 ──< Ticket.createdBy          (customer who raised the ticket)
User 1 ──< Ticket.assignedTo         (agent/admin handling it; may be null)
User 1 ──< Ticket.statusHistory[].changedBy
Category 1 ──< Ticket.category
Ticket 1 ──< TicketComment.ticket    (one thread per ticket)
User 1 ──< TicketComment.author
User 1 ──< AuthToken.user             (one-time links)
User 1 ──< Notification.recipient
Ticket 1 ──< Notification.ticket      (may be null)
Ticket 1 ──< TicketSubmission.ticket  (one claim per Idempotency-Key)
```

| Relationship | Label | Source |
| --- | --- | --- |
| Ticket references its owner (`createdBy`) and assigned agent (`assignedTo`) | **Confirmed** | Brief §4 (HANDBOOK) |
| All relationships are ObjectId references, not embedded copies | Proposed | Brief §4, this doc |
| Deleting users, tickets or categories | **Open** (Q-7) | No delete endpoint exists in the Contract; users and categories are deactivated instead |

---

## 5. Indexes and the queries they serve

All indexes are **Proposed** (this doc) unless noted. Unique indexes also enforce rules, so they matter for correctness, not only speed.

| Model | Index | Serves | Label |
| --- | --- | --- | --- |
| User | `{ email: 1 }` unique | Login lookup; duplicate signup → 409 `EMAIL_TAKEN` | Uniqueness **Proposed** (Brief §4, Contract §6) |
| User | `{ role: 1, isActive: 1 }` | Admin user list filters; checking an assignee is an active agent/admin | Proposed |
| Category | `{ name: 1 }` unique, collation `{ locale: 'en', strength: 2 }` | Case-insensitive uniqueness → 409 `CATEGORY_EXISTS` | Proposed (case-insensitive rule from Contract §10) |
| Ticket | `{ ticketNumber: 1 }` unique | Uniqueness. A case-insensitive number search can only scan this index, not seek in it | Uniqueness **Confirmed** (Brief §2) |
| Ticket | `{ createdBy: 1, createdAt: -1 }` | `GET /api/tickets/my` (own tickets, newest first) | Proposed |
| Ticket | `{ assignedTo: 1, status: 1, createdAt: -1 }` | Agent queue under OPEN-1: `assignedTo: null` or `assignedTo: <agent>`, filtered by status, newest first; also the `assignee` filter | Proposed |
| Ticket | `{ status: 1, category: 1 }` | Admin queue filtered by both status and category. **Not** used by `GET /api/admin/stats`, which selects by `createdAt` | Proposed; may be unnecessary at project scale |
| Ticket | `{ status: 1, dueAt: 1 }` | **Currently unused:** no code runs a query by due date. `GET /api/admin/analytics` selects by `createdAt` | Implemented (2026-10-30) |
| TicketComment | `{ ticket: 1, createdAt: 1 }` | Thread for one ticket, oldest first | Proposed |

The uses above were checked with MongoDB's `explain` on the local QA data (2026-10-30), a small data set; the planner can choose differently at another size.

Text search (`q` on `ticketNumber` and `subject`, Contract §8) can use a case-insensitive regex at this project's data volume. No text index proposed.

Admin analytics (Contract §11) changes no schema and adds no index. It selects tickets by `createdAt`, which no index leads with, so a request reads the whole collection; so do `GET /api/admin/stats` with a date and the unfiltered admin queue. Measured at 50,000 tickets, the median was 47 ms for 7 days and 294 ms for all tickets ([test evidence](TEST_EVIDENCE.md)), so `{ createdAt: -1 }` is not needed at this scale.

---

## 6. Ticket-number generation

| Item | Label | Source |
| --- | --- | --- |
| Every ticket gets a unique reference generated by the server | **Confirmed** | Brief §2 (HANDBOOK) |
| Format `HD-<number>`, sequential | Proposed | Brief §2 (PROPOSED), Contract §3 |
| Atomic counter instead of counting documents | Proposed | Contract §3 |
| Starting value | **Open** (Q-3) | Brief's `HD-104` is an example ticket, not a starting rule |

Proposed procedure (this doc):

1. Atomically increment and read the counter:
   `Counter.findOneAndUpdate({ _id: 'ticket' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })`
2. Build the number: `` `HD-${seq}` ``.
3. Create the ticket with that number. The unique index on `ticketNumber` is the final safeguard.

Consequences to accept or reject:

- **Gaps are possible.** If ticket creation fails after step 1 (e.g. validation error), that number is never used. Proposed: gaps are acceptable. Validating the request **before** step 1 keeps them rare.
- **Starting above 1** (Q-3) needs the counter document created in advance (for example by the seed script) with `seq` set to one less than the first number, because `$inc` with `upsert` starts from 0.
- **Numbers are strings.** Sorting by `ticketNumber` as text puts `HD-10` before `HD-9`; sort by `createdAt` instead (as the Contract already does).
- **Duplicate submissions** (double-click, retry) are handled by the frontend disabling the submit button and sending an `Idempotency-Key`, which the backend claims in `TicketSubmission` ([§3.7a](#37a-ticketsubmission-implemented-2026-10-29), Contract §7), not by the counter.

---

## 7. Authorization and `assignedTo`

### Decided rule

**Confirmed** (Contract OPEN-1, DECIDED 2026-10-25):

> An agent can access tickets where `assignedTo` is `null` **or** `assignedTo` is that agent.

**Confirmed** (same decision): the rule is applied in the database query for lists **and** on every single-ticket request; endpoints marked "Agent\*" in the Contract depend on it; an agent outside the rule gets 403 `FORBIDDEN`.

### What this means for the data model

| # | Implication | Label |
| --- | --- | --- |
| A-1 | `assignedTo` must allow `null` and default to `null` on creation, so "unassigned" is an explicit, queryable state. | Proposed (this doc). Note: MongoDB's `{ assignedTo: null }` also matches documents where the field is missing, so an explicit default mainly keeps data consistent. |
| A-2 | Agent list filter: `{ $or: [ { assignedTo: null }, { assignedTo: <agentId> } ] }`, combined (AND) with any queue filters. Because the policy is part of the query, `total` counts only tickets the agent may see. | Rule **Confirmed**; query shape Proposed |
| A-3 | Single-ticket check for agents: allowed if `ticket.assignedTo` is `null` or equals the agent's id (compare ObjectIds with `.equals()`, not `===`). | Rule **Confirmed**; implementation note Proposed |
| A-4 | Customers: allowed only if `ticket.createdBy` equals their id. Admins: all tickets. | Customers seeing only their own tickets, checked on the server: **Confirmed** (Brief §2 and §5, HANDBOOK). Admins seeing all tickets: Proposed (Brief §5 permission matrix is PROPOSED; Contract §4). |
| A-5 | Comments inherit the ticket's access rule (`GET`/`POST /api/tickets/:id/comments` are marked Agent\* in the Contract). | **Confirmed** (Agent\* endpoints follow OPEN-1) |
| A-6 | When a ticket is assigned to agent X, every other agent loses access to it and its comments, as a direct result of the rule's wording. If it is later reassigned to Y, X loses access. | Follows from the decided wording; **reviewer to confirm** this is the intended effect |
| A-7 | Only an existing, active `agent` or `admin` may be stored in `assignedTo` (D-2). Agents may set only themselves or `null`; admins may set any eligible user (D-1). | **Default** (D-1, D-2) |
| A-8 | Tickets assigned to an agent who is later **deactivated** stay assigned and become visible only to admins until reassigned. | **Open** (Q-6) |
| A-9 | A-2 to A-4 are implemented once, in `backend/src/utils/ticketAccess.js`, used by every ticket and comment route (including Swati's), so lists and single-ticket checks cannot drift apart. Owned by the agent-workflow module. | **Default** (D-5) |

The role used in these checks is read from the database on each request, not from the token or the client: Proposed (Contract §6, "Token rules — Proposed").

---

## 8. Open questions

| # | Question | Options | Current proposal | Decides |
| --- | --- | --- | --- | --- |
| Q-1 | **Category storage**: separate `Category` collection or a fixed list in code? (Contract C-4) | (a) Collection with admin CRUD; (b) fixed enum | **Default (D-6): (a).** Contract C-4 proposes it, and the handbook requires admins to manage categories. | Swati (to confirm) |
| Q-2 | **Comment model name**: `TicketComment` or `Comment`? | (a) `TicketComment` (Brief collection name); (b) `Comment` (Contract shape name) | **Default (D-4): (a)** for the model; the API keeps `comment` / `comments` as JSON keys either way | Ayushi + Swati (to confirm) |
| Q-3 | **Ticket-number starting value**: `HD-1`, `HD-101`, other? | — | None | Swati |
| Q-4 | **History/audit**: is `statusHistory` enough, or is the optional `TicketHistory` audit trail (assignment and priority changes too) required? | (a) `statusHistory` only; (b) add `TicketHistory` | (a). It covers the handbook requirement; (b) is optional in the Brief. | Ayushi + Swati |
| Q-5 | **Assignment permissions**: who can be an assignee (C-5), and may an agent assign a ticket to another agent or only to themselves (C-8)? | — | **Default (D-1, D-2):** assignee must be an active `agent` or `admin`; agents assign only themselves or `null`; admins assign anyone eligible. | Ayushi (to confirm) |
| Q-6 | **Deactivated assignee**: what happens to their assigned tickets? | (a) Leave assigned, admin reassigns; (b) unassign automatically on deactivation | None | Ayushi + Swati |
| Q-7 | **Deletion**: are users, tickets, categories or comments ever deleted? | — | No delete endpoints in the Contract; deactivate instead | Team |
| Q-8 | **Where the shared `toJSON` transform lives** (S-8) and who owns it | e.g. `backend/src/models/plugins/` or `backend/src/utils/` | **Default:** `backend/src/models/toJSON.js`, applied by every model | Swati (to confirm) |
| Q-9 | **`updatedAt` on User and Category**: the Brief lists only `createdAt` for User | — | Use `timestamps` (both fields) | Swati |
| Q-10 | **Category reference on inactive categories**: should `GET /api/tickets/:id` still show the name of a deactivated category? | — | Yes (Contract §10 says they stay on existing tickets) | Swati |

Related Contract points that are still open and touch the data model indirectly: C-1 (replies on resolved tickets), C-2 (admin modifying self), C-3 (token lifetime), C-6 (token storage), C-7 (logout).

---

## 9. Discrepancies between sources

Recorded, not resolved. Each needs the owner's confirmation.

| # | Topic | Brief says | Contract says | Impact |
| --- | --- | --- | --- | --- |
| D-1 | Comment naming | Collection `TicketComment` (handbook collection name) | Data shape "Comment"; JSON keys `comment` / `comments`; route `/comments` | Model name only (Q-2). API shapes unaffected. |
| D-2 | Category | `Category` is *optional* (§4), but admins must manage categories (§2, HANDBOOK) | C-4 proposes a Category collection referenced by tickets | Whether `Ticket.category` is a ref or an enum (Q-1) |
| D-3 | Ticket category field naming | Field `category` | Request body uses `categoryId`; response uses `category: { id, name }` | None for the model (`category` ref); request mapping only |
| D-4 | User timestamps | `createdAt` only | User shape shows `createdAt` only | Whether to store `updatedAt` (Q-9) |
| D-5 | Ticket-number format | `HD-` + sequential number is PROPOSED; HD-104 is an example | Same, plus atomic-counter recommendation | Starting value (Q-3) |
| D-6 | Owner name | — | Contract uses "Swati" in decisions and "Swatismita" in the endpoint owner column; README marks the spelling as unconfirmed | Documentation only |

---

## 10. Ownership and review

Ownership follows the team allocation in the README. This document assigns no new work.

| Item | Implements | Reviews |
| --- | --- | --- |
| This document (accuracy, keeping it in sync with the Contract) | Tirth Vaghela | Swati, Ayushi |
| `User`, `Category`, `Ticket` models; ticket creation and numbering (incl. `Counter`); ownership checks | Swati | Tirth (consistency with Contract), Ayushi (`assignedTo`, `statusHistory`) |
| Ticket-comment model (`TicketComment`) | Agent-workflow module (Ayushi) — **Default** (D-4) | Swati + Tirth |
| Queue query, assignment and status transitions using `assignedTo` / `statusHistory` | Ayushi | Swati, Tirth |
| Shared access helper (A-9, `ticketAccess.js`) | Agent-workflow module (Ayushi) — **Default** (D-5) | Swati + Tirth |
| JSON shapes consumed by the UI | Backend owners above | Mimansa (customer screens), Shwetaleena (agent/admin screens) |
| Indexes | Model owners | Tirth |
| Test fixtures for these models (`backend/test/helpers/`) | Tirth, after the models are merged | Model owners |

**How to change this document:** open a pull request that updates it together with any related change to `API_CONTRACT.md`, and move items from Proposed/Open to Confirmed only when the responsible owner has agreed in that pull request.

---

## 11. Change log

| Date | Change | By |
| --- | --- | --- |
| 2026-10-25 | Draft v0.1: proposal for User, Category, Ticket, TicketComment and Counter; indexes; ticket numbering; OPEN-1 implications; open questions and source discrepancies | Tirth Vaghela |
| 2026-10-25 | v0.2: applied engineering defaults D-1, D-2, D-4, D-5, D-6 (Q-1, Q-2, Q-5, Q-8, A-7, A-9, ownership). First implementation of User, Category, Ticket, TicketComment and Counter written by the integration lead for review by Swati (owner of User, Category, Ticket, Counter) and Ayushi. Q-3, Q-4, Q-6, Q-7, Q-9, Q-10 remain open. | Tirth Vaghela |
| 2026-10-29 | §3.7a `TicketSubmission`: idempotent ticket submissions (contract §7 v0.9). New collection; no new index, no change to existing data. | Tirth Vaghela |
| 2026-10-30 | §3.3 Ticket `dueAt` (SLA resolution due date) and §5 index `{ status: 1, dueAt: 1 }`. Optional field: existing tickets need no migration. | Tirth Vaghela |
| 2026-10-30 | §5: analytics adds no schema or index; the stated purpose of `{ status: 1, dueAt: 1 }` corrected. | Tirth Vaghela |
| 2026-10-30 | Documentation only, no schema change: status updated to implemented; email length limit, relationships and duplicate-submission handling added; index uses corrected from `explain`, including `{ status: 1, dueAt: 1 }` being unused. | Tirth Vaghela |
