# Help Desk — Test Evidence

What has been tested, how, and with what result, as of **30 October 2026**. It records only checks that were actually run; anything not run is listed under [Not verified yet](#7-not-verified-yet).

The results apply to the `main` branch at `91c4037` **plus the uncommitted working tree** of that date (filters, staff status history, duplicate-submission protection, demo data, ticket status emails, SLA due dates and badges, admin analytics, the redesigned email templates, the New Ticket category messages, the one-time link and log privacy fixes). Re-run the commands in [§8](#8-how-to-reproduce) after these changes are committed.

**Fresh and historical results.** The automated test counts and the build result in §1 and §2 were re-run on 30 October 2026, after the last change to the code. Everything in §3 and §4 is **historical**: each ran once against the code of its day and was not repeated for this update. §5 lists user-reported manual checks, which were not independently verified.

## Contents

1. [Summary](#1-summary)
2. [Automated tests (in the repository)](#2-automated-tests-in-the-repository)
3. [API-level QA (outside the repository)](#3-api-level-qa-outside-the-repository-historical)
4. [Real-browser checks](#4-real-browser-checks-historical)
5. [Manual checks reported by the user](#5-manual-checks-reported-by-the-user)
6. [Log privacy](#6-log-privacy)
7. [Not verified yet](#7-not-verified-yet)
8. [How to reproduce](#8-how-to-reproduce)

## Environment

| | |
| --- | --- |
| OS | Windows 11 |
| Node.js | 22.14.0 |
| MongoDB | 8.2.4, local (`127.0.0.1:27017`) |
| Browser | Google Chrome 156, headless, driven through the DevTools protocol |
| Test databases | `helpdesk_test` (automated tests; the helpers refuse any name not ending in `_test`) and `helpdesk_browser_test` (browser checks). Neither the shared Atlas database nor any real user data was used. |

## 1. Summary

| Kind | Result |
| --- | --- |
| Backend automated tests (fresh) | **554 tests: 553 passed, 0 failed, 1 skipped** (120 suites), MongoDB required (`REQUIRE_TEST_DB=1`). The skipped test sends a real `SIGTERM`, which Windows cannot deliver; it runs on Linux (CI, hosting) |
| Frontend unit tests (fresh) | **155 passed, 0 failed, 0 skipped** (36 suites) |
| Frontend production build (fresh) | **Succeeds** (`vite build`, 83 modules) |
| Real-browser checks (historical) | 15 scripted workflows on an isolated local stack; results in §4. One defect found (paging) and fixed, then re-checked. SLA badges were checked first with simulated `dueAt`, then against the real backend; analytics and customer categories against the real backend |
| Manual checks (user-reported) | One real email received and categories visible on the real frontend; §5 |
| Full real-mailbox tests, deployed app, other browsers | **Not verified** (§7) |
| Log privacy | Failed emails and request logs fixed and tested with simulated errors, not a live SMTP server; the remaining gaps are in §6 |

## 2. Automated tests (in the repository)

### Backend — `cd backend && npm test`

Node's built-in test runner with Supertest against the real Express app and a real local MongoDB. Each file runs on its own, against the guarded `helpdesk_test` database, which is cleared between tests.

Last run (30 October 2026, fresh): **554 tests, 120 suites: 553 passed, 0 failed, 0 cancelled, 1 skipped**, with `REQUIRE_TEST_DB=1` (a missing database fails the run instead of skipping tests), about 2 minutes. The one skip is the real-`SIGTERM` test below, skipped on Windows only.

| Area | Files | What is checked |
| --- | --- | --- |
| Sign-up, sign-in, tokens | `authApi`, `auth`, `authSecurity` | Validation, hashing, duplicate emails, expired/forged/stale tokens, deactivated accounts, role changes, rate limiting, production secret and email rules |
| Account security | `accountSecurity` | Password change (other sessions signed out), email change with confirmation, forgot/reset password (same answer for unknown emails, single-use and expiring links), email failures, no tokens in responses or logs. A password reset or change voids pending email-change links, and a confirmed email change voids reset links, without touching other users' links; a refused change keeps the old email and reset link; if voiding fails, the password stays as it was and the email change is undone |
| Customer tickets | `customerTickets` | Creation (validation, server-set fields, inactive category), own history only, filters and pages |
| Duplicate submissions | `ticketIdempotency` | Same `Idempotency-Key` returns the original ticket; 8 simultaneous requests create one; different keys create separate tickets; key reuse for other content refused; malformed keys; authorization first; abandoned claims; a stalled request finishing after a takeover; a write that succeeded but reported an error; unrelated duplicate-key errors |
| Agent and admin workflow | `agentWorkflow`, `ticketAccess`, `ticketAssign`, `ticketAssign.db`, `ticketQuery`, `ticketQuery.db`, `ticketStatus`, `ticketOwnership` | Queue scope (agents never see another agent's tickets), search and filters (status, priority, category, assignee), assignment, status transitions and their permissions (D-10), replies (D-11), concurrent changes, the end-to-end scenario |
| Administration | `categories`, `categoryNameConflicts`, `adminUsers`, `adminStats`, `ticketStats` | Category management and case-insensitive uniqueness, user roles and activation, last active admin, statistics and date range |
| Notifications | `notifications` | Who is notified for each event, never the actor, read/unread, cross-user protection |
| Platform | `health`, `errors`, `validate`, `models`, `db-helpers`, `envConfig`, `securityHeaders`, `methodNotAllowed` | Health check, error format, validators, schemas, the test-database guard, configuration rules, security headers, `405` with `Allow` |
| SLA due dates | `sla`, `slaTickets` | Default targets 24/72/168 h; valid and invalid `SLA_HOURS_*` (text, decimals, 0, negatives, infinity, exponents, padding, over 8760) and the startup summary; due date for each priority in calendar hours; states at exact boundaries with fixed dates (25% left is "due soon", the deadline itself is not yet overdue, met/missed at the deadline); missing or invalid dates; due date stored on normal, idempotent and taken-over creation, unchanged by a replay; priority change recalculated from the original creation time in the same update; same priority, assignment and status changes leave it alone; a concurrent priority change gives 409 and priority and due date always match; resolved tickets refused; older tickets without a due date keep working; `dueAt` in staff responses only, never in customer responses |
| Ticket status emails | `statusEmails` | One email to the ticket's own active customer per change to In progress or Resolved, by the assignee or an admin; contents (number, subject, both statuses, `CLIENT_URL` link even with a forged `Host`, reason, no staff names or emails, no other customers); HTML escaping; no email for rejected or repeated changes, assignment, release, priority, replies, or ticket creation and its replay; deactivated customer; a delivery failure keeps the change and logs no address or link; the response returns before the email is sent; tracking and bounded waiting for pending emails; the outbox transport (separate process, temporary folder); SMTP timeouts |
| Log privacy | `logPrivacy` | Simulated SMTP rejections that quote the address, on each email path (`sendEmailQuietly`, `sendInBackground`, ticket status, password reset, email change, password-changed notice), and a forgot-password request that fails before sending: the log has the purpose and codes only, with no address, link, token or server reply. Request logs in both formats, and the real app in development and production (separate process): method, path, status and timing stay; the query string and the referrer's query do not |
| Email templates | `emailTemplates` | The ticket status and password reset emails: complete HTML document and plain-text part, hidden preheader, Outlook button and line-height rules, both status variants and the general one, pill colours, exact plain-text lines, links (three `href`s in the HTML, once in the text), escaping of names, subjects and numbers, the `Hi there,` fallback, no staff data or email addresses, wrapping of long subjects, reset expiry wording from `PASSWORD_RESET_TTL_MINUTES`, tokens never in logs on the reset route, both parts kept by the memory transport |
| Startup and shutdown | `serverLifecycle` | Normal startup log; pending emails are waited for after the server closes and before the database disconnects, within the limit; an occupied port gives a clear message and exit 1 (also for the real `server.js` in a separate process); `SIGTERM` lets a request in progress finish, then closes; idle keep-alive connections do not delay shutdown; repeated signals shut down once (one disconnect, one exit); the 10-second limit exits 1; a failing disconnect exits 1; a real `SIGTERM` to `server.js` exits 0 (Linux only) |
| Admin analytics | `analytics`, `analyticsApi` | Admin, customer, agent and signed-out access; empty database; status and priority counts with unexpected values; categories (inactive, deleted, missing, order); assignees (names and ids only, no former staff); inclusive range boundaries to the millisecond; every panel following one range; blank, malformed, impossible, repeated and operator date parameters; average resolution time and excluded records; a record that is unresolved but has `resolvedAt`; reopening refused; SLA states at the exact 25% and deadline boundaries with a fixed clock; missing and invalid `dueAt`; no eligible tickets; the six states adding up to the total and matching direct `slaState` calls; no customer details or ticket text in the response; `/api/admin/stats` unchanged |
| Demo data | `seedDemo` | Refuses remote, real-named and production databases; contents; a second run changes nothing; schema and workflow rules; demo accounts sign in; existing records untouched; SLA due dates from the same rule and settings, every SLA state present including an unresolved overdue ticket, invalid SLA settings refused before any write |

### Frontend — `cd frontend && npm test` and `npm run build`

Unit tests with Node's built-in runner (no browser). Last run (30 October 2026, fresh): **155 tests, 36 suites: 155 passed, 0 failed, 0 skipped** across `api`, `account`, `logic`, `dashboardUrl`, `queueFilters`, `statusHistory`, `sla`, `analytics` and `newTicketCategories`. They cover the API layer against a fake `fetch` (methods, URLs, bodies, headers, errors), form validation, session handling, the staff permission rules, filter and paging logic, status-history display data and the CSV export.

`sla` (28 tests, fixed dates, never the system clock) covers all six SLA states; the exact 25% boundary, the deadline itself and just after it; resolved before, at and after the deadline; missing, null and invalid dates; a missing `resolvedAt`; older tickets; and the time formats (minutes, hours, days and hours, under a minute, rounding down, no negatives). It also renders the real `SlaBadge` to HTML through Vite and `react-dom/server`, and checks that customer screens do not use the badge or `dueAt`. `analytics` (35 tests) covers the date presets, custom ranges with time-zone and daylight-saving conversion, date validation, the CSV range, percentages and display data, and renders the real `AnalyticsPanels` in its loading, refreshing, failed, missing-data and empty states. `newTicketCategories` (6 tests) covers recognising an inactive-category response, that its text still matches the backend, and the approved New Ticket messages. `SlaBadge` and `AnalyticsPanels` are the only React components the unit tests render; screens are covered by §4.

The production build (`npm run build`) succeeds: 83 modules, last run 30 October 2026 (fresh).

### Continuous integration

`.github/workflows/ci.yml` runs both suites on every pull request into `main` (backend with a MongoDB 7 service and `REQUIRE_TEST_DB=1`; frontend tests and build). The working-tree changes above have **not** been through CI yet, because they are not committed.

### Analytics performance (historical)

Measured once on 30 October 2026 on the development laptop, with 50,000 synthetic tickets in the guarded `helpdesk_test` (cleared afterwards), calling `buildAnalytics` 7 times per range. There is no index on `createdAt`, so each request reads the whole collection.

| Range | Tickets | Median | Slowest |
| --- | --- | --- | --- |
| Last 7 days | 959 | 47 ms | 62 ms |
| Last 30 days | 4,110 | 66 ms | 72 ms |
| Last 90 days | 12,331 | 101 ms | 106 ms |
| All time | 50,000 | 294 ms | 345 ms |

All are under the 500 ms line agreed for proposing `{ createdAt: -1 }`, so no index was added or proposed. These are local timings against local MongoDB, not a hosted database over a network.

## 3. API-level QA (outside the repository, historical)

Run in-process against `helpdesk_test` during the QA audit, kept outside the repository:

| Script | Cases | What it checks | Result |
| --- | --- | --- | --- |
| `negative.test.mjs` | 34 | (A) authentication and sessions: wrong types, operator objects, malformed JSON, case-insensitive emails, identical answers for unknown accounts, deactivation, role changes, ignored privileged fields; (B) role checks on the server, cross-user and cross-agent access, forged fields; (C) ticket creation edge cases and query-parameter abuse; (D) concurrent claims and status changes, invalid transitions, the D-10 rules, comments, XSS-style text stored as data; (E) admin and category edge cases, last active admin; (F) account-security token and password edge cases; (H) body limits, error envelope, `405` with `Allow` | Passed, after four expectations were updated to the agreed ownership rules (D-10) and `405` responses. Run before duplicate-submission protection existed: case C-3 recorded that a repeated request **without** a key creates two tickets, which is still the intended behaviour without a key |
| `ratelimit.test.mjs` | 4 | Sign-in limit with `429` and `Retry-After` (a spoofed `X-Forwarded-For` does not reset it), a separate sign-up budget, wrong-current-password attempts, forgot-password limit with identical answers | Passed |

## 4. Real-browser checks (historical)

Scripted workflows in headless Chrome against an isolated local stack: frontend on port 5175 → API on port 4100 → local `helpdesk_browser_test`, with emails written to a local folder (never sent). Every UI action that changes data is followed by an API read to confirm the server state. The scripts are kept outside the repository, so these checks cannot be reproduced from the repository alone. Each ran against the code of its day: the first eight before the staff filters (C-1), status history (C-2) and duplicate-submission protection (C-3) were added; those features have their own rows. The API on port 4100 predated the SLA work until the real-backend SLA run, and was restarted on the code of that day for the analytics run; the category and email template work came later, and only the category code path was exercised through it.

| Workflow | Steps | What it checks | Result |
| --- | --- | --- | --- |
| Customer journey (A) | 21 | Sign-up, sign-in, raise a ticket, history, detail, replies, filters, another customer's ticket refused | Passed |
| Backend down (B) | 5 | With the API stopped: failures are shown, nothing pretends to succeed | Passed |
| Recovery (C) | 11 | API back up, session endings, staff regression, signed-out pages | Passed, except one step whose expectation was out of date (the app signs a deactivated user out sooner than expected); that behaviour was re-checked separately and is correct |
| Cross-role staff workflow | 17 | Agent and admin dashboards together: claim, status, priority, reassign, replies | Passed |
| Agent while the API goes down | 4 | Actions fail visibly | Passed |
| Account security and notifications | 13 | Notification bell, forgot/reset password, password change, email change (emails read from the local folder) | Passed |
| Dashboard address (G1) | 8 | Selected page kept in the address: refresh, Back/Forward, ticket links | Passed |
| Ownership rules in the UI (D-10/D-11) | 6 | Locked controls with explanations, claim then start then resolve, admin override, notification on reassignment | Passed |
| Staff filters (C-1) | 25 | Agent Show/Category filters with status, priority, search, counts, empty/loading/error states, links; admin category (incl. inactive) and assignee filters, dialog assignment | 23 passed, 2 failed: **defect found** (changing a filter back restored the old page) |
| Paging re-check after the fix | 7 | Every filter change, and changing it back, requests and shows page 1, one request each | **7/7 passed**; re-run with the SLA badges in place, and against the current API with analytics (30 October): **7/7 passed** each |
| Staff status history (C-2) | 7 | Agent panel and admin dialog show every history entry in order with time, author and "Current"; switching tickets; 390 px wide with no sideways scrolling | **7/7 passed**; re-run with the SLA badges in place, and against the current API with analytics (30 October): **7/7 passed** each |
| SLA badges, **simulated `dueAt`** | 15 | Agent Inbox and Admin Tickets, list and details, at desktop and 390 px: all six states and their text; no badge overlap; text contrast of at least 4.5:1; no console errors; badge refresh after priority (agent only), status and assignment changes; agent filters and counts; no sideways page scrolling at 390, 768, 1024, 1280, 1366 or 1920 px (the admin table scrolls inside its own box below 1280 px) | **15/15 passed**, with the limits below |
| SLA badges, **real backend** | 22, then 5 | Real `dueAt` values reaching both screens (compared with the database), all six states, details and deadlines, priority change (agent only), status changes to Met and Missed, assignment leaving the deadline alone, no `dueAt` for customers (raw responses and screens), filters, 390 px | First run **20/22**. Two steps failed: the agent 390 px step expected the wrong ticket count (a script error, so it checked nothing), and 2 `401 /api/auth/me` console entries, reproduced with a token signed by another secret (the tab held one from before the restart). Read-only re-check: **5/5 passed**, no console errors in normal use. Added 11 stamped tickets and 1 customer; existing tickets, categories and users unchanged by checksum |
| Admin analytics, **real backend** | 22 | Every figure on the Reports page compared with the API's response for the same range; all five range options, one request each; custom dates sent as whole local days in UTC; blank, reversed and future dates refused; empty range; CSV contents against the range (custom end day, last 90 days); agent and customer sent away and refused by the API (403), signed out 401; refresh, first load and failure states; retry; no page overflow at 390, 768, 1024, 1366 and 1920 px; no console errors | **22/22 passed.** Read-only: all collections and outbox files unchanged (checked by document hashes). Only the page states were forced: the analytics request was delayed in the page for the loading states and blocked in Chrome for the failure state; its responses were never changed |
| Customer categories, **real backend** | 18 | Admin creates, deactivates and reactivates a category on the screen; the customer's dropdown lists exactly the active ones; the customer raises a ticket that appears in their history; agent and admin open it; a category deactivated while the form is open gives a field error, a refreshed list and no second ticket; after deactivation the ticket stays visible to all three and admin's filter marks the category inactive; the backend refuses inactive, unknown, malformed, missing and operator-object categories (6 cases); customer and agent 403, signed out 401; no page overflow at 390 px on New Ticket and admin Categories | **18/18 passed.** The empty list, failed request and slow load were **simulated** on the customer's category request in Chrome. Console: 3 expected entries (the refused submit and the simulated failure). The field error itself was not checked at 390 px. **Data added to `helpdesk_browser_test`:** 1 category (left inactive), 1 customer, 1 ticket, 3 notifications, the ticket counter, and **1 `ticketsubmissions` record, a side effect not listed when the run was approved** (the page sends an `Idempotency-Key`). Nothing removed; other existing records unchanged by document hashes; no email sent |
| Email templates, Chrome preview | 3 renders | The status (In progress), status (Resolved, 120-character subject) and reset emails with made-up data, at 680 and 360 px and in dark mode: no overflow, hidden preheader, compared by eye with the design mockups. Two layout defects were found and fixed this way | Passed after the fixes. A browser render only; no email client, and the Outlook button was not rendered |

**What the simulated SLA badge workflow does and does not show.** When it ran, the API on port 4100 predated the SLA work and returned no `dueAt`. The script therefore added `dueAt` values, and for some tickets a status, resolution time and assignee, to ticket responses inside Chrome, and answered ticket changes in Chrome without sending them to the server (5 such changes in the final run). This checks how the real screens display and refresh SLA data; the "real backend" row above is what shows they work with the real API. No ticket's status, priority, assignee or update time changed in `helpdesk_browser_test`. The real API's `dueAt` behaviour is covered separately by the backend tests in §2.

Duplicate-submission protection (C-3) has **not** been checked in a browser; it is covered by the API tests in §2.

## 5. Manual checks reported by the user

Reported by the project owner. They were not run or independently verified by these checks.

| Check | Reported result | What remains unverified |
| --- | --- | --- |
| A real email through SMTP | Received | Which process and template sent it. The running API's current SMTP setting was not read, because that would mean opening `.env`. The real-mailbox suite was deliberately skipped (see §7) |
| Customer categories on the real frontend (`http://localhost:5173`) | The dropdown lists options, with no empty-state message | The real database was not read. The cause of the earlier empty message was missing or inactive category data, an admin setup matter rather than a code defect |

## 6. Log privacy

**Fixed on 30 October 2026, for the paths below.** This is not a claim that the logs are free of personal data.

- **Failed emails:** an SMTP server's reply can quote the recipient, and Nodemailer adds that reply to the error text. `sendInBackground`, `sendEmailQuietly` and the email-change and forgot-password handlers in `accountSecurity.controller.js` now log only the purpose, the error's code and the numeric reply code (`safeErrorDetails` in `services/email.js`). The price is less detail for diagnosing a failed send.
- **Request logs:** `middleware/requestLog.js` replaces query strings with `?[redacted]`, because `GET /api/admin/users?q=…` can carry an address. The same applies to the referrer in the production format, which could carry a reset link.

Checked by `logPrivacy` with simulated errors. It has **not** been seen with a live SMTP server.

**Remaining, not fixed:**

| Where | What can still be logged |
| --- | --- |
| `errorHandler.js` | Unexpected errors are logged in full |
| `utils/notifications.js` | The error text when a notification cannot be saved |
| Request logs | URL paths as sent, and the client IP and user agent in the production format |
| `scripts/create-staff.js` | The staff email, on the operator's console |
| Development outbox | Addresses and one-time links, in files on disk (git-ignored; refused in production) |

## 7. Not verified yet

| Item | Why |
| --- | --- |
| Full real-mailbox tests: Open → In Progress, In Progress → Resolved, password reset | Deliberately skipped by the project owner's decision. Automated tests use only the in-memory and outbox transports; the SMTP timeouts are checked as configuration, not against a real server. One real email was reported received (§5) |
| The redesigned emails in a real mail client | Checked in tests and in a Chrome preview only; rendering in Gmail, Outlook and Apple Mail not checked |
| Log privacy with a real SMTP rejection | Simulated errors only (§6); no real email was sent |
| Deployed application: HTTPS, HSTS, CORS for the real frontend address, health check on the host, logs | Not deployed yet |
| Running behind a hosting proxy (client IP for rate limits, HTTPS detection) | Needs a host; see README "Deployment readiness" |
| The current changes in CI | Not committed yet |
| Browsers other than Chrome; real phones | Only headless Chrome, with phone width emulated for some screens |
| Screen-reader and keyboard-only accessibility review | Not performed |
| Load or performance testing | Not performed |
| Duplicate-submission protection in a browser | API-tested only |
| A real `SIGTERM` to the API process | Windows cannot deliver it; the test runs on Linux (CI) but has not been run there yet, because the change is not committed. The shutdown logic itself is tested on every platform with simulated signals |
| `TRUST_PROXY` (client address and HTTPS behind a host's proxy) | Proposed only; depends on the chosen host |
| Ticket changes in the final analytics browser run | Status, priority and assignment changes were not repeated there, because that run adds no data. They are covered by the backend suite and the real-backend SLA run above, on the same ticket code |
| Analytics on a hosted database | Timings are local only. Real (Atlas) data has not been read: older tickets there are expected to show as No SLA |
| A priority change refreshing the badge in Admin Tickets | The admin dialog has no priority control, so this does not apply there. It was checked in Agent Inbox, with both simulated and real data |

## 8. How to reproduce

Requires MongoDB running locally (the tests never use `backend/.env`'s database).

```bash
# Backend (fails instead of skipping if MongoDB is not reachable)
cd backend
npm ci
REQUIRE_TEST_DB=1 npm test        # PowerShell: $env:REQUIRE_TEST_DB='1'; npm test

# Frontend
cd ../frontend
npm ci
npm test
npm run build
```

Expected: backend `# pass 553`, `# fail 0`, `# skipped 1` on Windows (`# pass 554`, `# skipped 0` on Linux); frontend `# pass 155`, `# fail 0`; the build ends with `built in …`.
