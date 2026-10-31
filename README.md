# Help Desk — Customer Support Ticket System

[![CI](https://github.com/Tirthvaghela/help-desk/actions/workflows/ci.yml/badge.svg)](https://github.com/Tirthvaghela/help-desk/actions/workflows/ci.yml)

WeIntern Minor Project · Project 01 / Team 01 · MERN

A web application where customers raise support tickets, support agents triage, reply to and resolve them, and administrators manage users, categories and ticket volume.

Ticket lifecycle: **Open → In Progress → Resolved**, with a timestamped reply thread and status history on every ticket.

> **Current phase: integration and testing.** Customers, agents and admins can complete their whole workflow in the browser against the real API: sign-up and sign-in, raising tickets, the agent queue (claim, status, replies), and admin statistics, tickets, users and categories. See [Implementation status](#implementation-status) and [Known limitations](#known-limitations-and-open-decisions).

## Contents

- [Team](#team)
- [Implementation status](#implementation-status)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Deployment readiness](#deployment-readiness)
- [API](#api)
- [Troubleshooting](#troubleshooting)
- [Git workflow](#git-workflow)
- [Known limitations and open decisions](#known-limitations-and-open-decisions)
- [Roadmap](#roadmap)

## Team

### Backend Team (3 Members)

**Tirth Vaghela — Backend Integration, Admin Backend & DevOps**

- Backend architecture and API integration
- Admin backend APIs, dashboard data and management operations
- Shared database and API coordination
- Complete backend-to-frontend API integration across customer, agent and admin modules
- Integration testing, deployment coordination and README/documentation

**Ayushi Rathi — Agent Workflow & Conversations**

- Agent ticket queue, search and filters
- Ticket assignment and status transitions
- Replies and conversation management
- Ticket status history and admin ticket summaries

**Swatismita — Tickets & Authentication**

- User authentication, JWT and role-based middleware
- User, Ticket and Category models
- Ticket creation and customer ticket history
- Ticket ownership and access checks

### Frontend Team (2 Members)

**Mimansa Narendra Patle — Customer Frontend & Landing Page**

- Project landing page development
- Signup, login and customer dashboard
- Create-ticket form, ticket history and ticket details
- Loading, validation and error states

**Shwetaleena Kundu — Agent/Admin Frontend**

- Agent dashboard, filters and replies
- Ticket assignment and status updates
- Admin user and category management screens

## Implementation status

| Feature | Status |
| --- | --- |
| Express app, CORS, JSON parsing, request logging, health check | ✅ Implemented |
| Consistent JSON error format, error helpers, validation helpers | ✅ Implemented |
| Sign-up, sign-in, `GET/PATCH /api/auth/me`, JWT, role checks on every request | ✅ Implemented |
| Sign-in/sign-up rate limiting; production `JWT_SECRET` strength check | ✅ Implemented |
| Ticket creation and customer ticket history (with status filter and pages) | ✅ Implemented |
| Agent queue, filters, search, claim/release, priority, status changes | ✅ Implemented |
| Ticket replies (comments) and status history | ✅ Implemented |
| Admin statistics, ticket oversight and reassignment | ✅ Implemented |
| Admin ticket conversation: read and reply in the ticket dialog | ✅ Implemented |
| Admin priority control: change priority in the ticket dialog, locked once a ticket is resolved | ✅ Implemented |
| Admin category management and user management (role, activation) | ✅ Implemented |
| Landing page, customer portal, agent dashboard, admin dashboard | ✅ Implemented, connected to the API |
| Customer profile: change own name | ✅ Implemented |
| Account security: change password, change email (confirmed by email), forgot/reset password | ✅ Implemented (needs an email provider in production, see [Email](#email)) |
| In-app notifications (ticket created, assigned, priority, status, resolved, replies) | ✅ Implemented (bell in every signed-in header) |
| Email to the customer when their ticket's status changes | ✅ Implemented (needs SMTP in production, see [Email](#email)) |
| SLA due dates (resolution targets per priority) | ✅ Implemented: stored on tickets, returned to staff, and shown as SLA badges in Agent Inbox and Admin Tickets (see [SLA due dates](#sla-due-dates)); not visible to customers |
| Admin analytics (Reports tab: status, priority, category, resolution time, SLA, date ranges) | ✅ Implemented (see [Reports and analytics](#reports-and-analytics)) |
| Safe database initialisation (default categories, first admin) | ✅ Implemented (`npm run seed:categories`, `npm run create:staff`) |
| Duplicate ticket submissions (a retried or double-clicked submission returns the original ticket) | ✅ Implemented (`Idempotency-Key`, contract §7) |
| Demo data for presentations (local databases only) | ✅ Implemented (`npm run seed:demo`, see [Demo data](#demo-data-optional-local-only)) |
| User flows, wireframes, test evidence | 📝 [docs/USER_FLOWS.md](docs/USER_FLOWS.md), [docs/WIREFRAMES.md](docs/WIREFRAMES.md), [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md) |
| Backend tests (`node:test` + Supertest); frontend unit tests and real React DOM tests (`node:test`, jsdom, Testing Library) | ✅ Implemented. Browser, visual and end-to-end tests are not implemented |
| API contract | 📝 [docs/API_CONTRACT.md](docs/API_CONTRACT.md); a few points are still open (see below) |
| Deployment | ⏳ Not deployed yet: host and production database still to be chosen (see [Deployment readiness](#deployment-readiness)) |

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, Vite, React Router, Tailwind CSS |
| Backend | Node.js, Express 5, Mongoose |
| Database | MongoDB |
| Testing | Node's built-in test runner (`node:test`); Supertest (backend); jsdom and Testing Library (frontend) |
| DevOps | Git/GitHub; deployment target to be confirmed (Render or equivalent) |

## Project structure

```
help-desk/
├── backend/
│   ├── src/
│   │   ├── config/        env.js + envRules.js (env checks), db.js (MongoDB connection)
│   │   ├── controllers/   auth, account security, customer tickets, agent tickets, comments, categories, admin users, notifications, stats and analytics
│   │   ├── middleware/    auth.js (JWT + roles), rateLimit.js, errorHandler.js
│   │   ├── models/        User, Category, Ticket, TicketComment, Counter, AuthToken, Notification, TicketSubmission
│   │   ├── routes/        one router per area, mounted in app.js
│   │   ├── services/      email.js (transports, background delivery), emailTemplates.js
│   │   ├── utils/         ApiError, validation, ticket access/query/serializers, sla.js, analytics.js, dateParams.js, idempotency.js, notifications, ticket emails
│   │   ├── app.js         Express app: middleware + route mounting
│   │   ├── server.js      Entry point: connect DB, then start listening
│   │   └── startServer.js Port errors and graceful shutdown
│   ├── scripts/           seed-categories.js, create-staff.js, check-categories.js, seed-demo.js (lib/: target guards, data)
│   ├── test/              node:test + Supertest; helpers/ (isolated test database, factories)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── public/            favicon.svg
│   ├── src/
│   │   ├── api/           client.js (fetch wrapper), tickets.js, admin.js, useApiData.js
│   │   ├── auth/          AuthProvider, session storage, StaffRoute / CustomerRoute guards
│   │   ├── components/    landing/, customer/, agent/, admin/, account/, staff/ (shared helpers), common/
│   │   ├── pages/         HomePage (landing), customer/, agent/, admin/, account/, StaffLogin, StaffAccount, NotFoundPage
│   │   ├── App.jsx        Routes
│   │   └── main.jsx       Entry point
│   ├── test/              node:test unit tests, and real React DOM tests (jsdom, Testing Library; *.render.test.js, accountSecurity.test.js); helpers/
│   ├── .env.example
│   └── package.json
├── .github/workflows/ci.yml   GitHub Actions: backend tests, frontend tests + build
└── docs/
    ├── API_CONTRACT.md            Endpoints, request/response shapes, error codes, decisions
    ├── DATA_MODEL.md              Collections and fields
    ├── USER_FLOWS.md              Customer, agent and admin flows; ticket lifecycle (diagrams)
    ├── WIREFRAMES.md              Low-fidelity layouts of every screen
    ├── TEST_EVIDENCE.md           What was tested, how, and the results
    ├── DECISION_REGISTER.md       Product and policy questions the team still has to settle
    ├── FRONTEND_RENDER_TEST_PLAN.md  Frontend render coverage, remaining gaps and proposed tests
    └── CUSTOMER_TICKET_API_GAPS.md  History of the customer ticket API alignment
```

## Prerequisites

- **Node.js** 22.12 or newer (LTS). The project is developed and tested on Node 22. Check with `node --version`.
- **MongoDB**, either a local install (default URI `mongodb://127.0.0.1:27017/helpdesk`) or a MongoDB Atlas connection string
- **Git**

## Setup

```bash
git clone https://github.com/Tirthvaghela/help-desk.git
cd help-desk
```

### Backend

```bash
cd backend
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm run dev               # http://localhost:4000
```

You should see a summary of the settings in use, then the connection (the `Email` line names the transport, for example `outbox → backend/.outbox (nothing is sent)`):

```
Database: "helpdesk"
Email: …
CORS origins: http://localhost:5173, …
SLA resolution targets: high 24 h, medium 72 h, low 168 h (calendar hours)
MongoDB connected: 127.0.0.1/helpdesk
API listening on http://localhost:4000
Category name index ready (unique, case-insensitive).
```

### Frontend (in a second terminal)

```bash
cd frontend
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm run dev               # http://localhost:5173
```

Open http://localhost:5173 to see the landing page.

### First run: initialise the database

A new database has no categories (customers need at least one to raise a ticket) and no staff accounts (sign-up only creates customers). Run these once, from `backend/`:

```bash
npm run seed:categories
# Account & Login, Billing, Technical Support, General Inquiry. Safe to re-run: existing
# categories (including deactivated ones) are never changed.

STAFF_ROLE=admin STAFF_NAME="Your Name" STAFF_EMAIL=you@example.com STAFF_PASSWORD='a-long-password' npm run create:staff
# PowerShell: $env:STAFF_ROLE='admin'; $env:STAFF_NAME='Your Name'; $env:STAFF_EMAIL='you@example.com'; $env:STAFF_PASSWORD='a-long-password'; npm run create:staff
```

Both scripts use `MONGODB_URI` and print the target (local or remote, database name) without credentials. They **refuse** a remote database (such as Atlas) unless you add `-- --allow-remote`, and refuse `NODE_ENV=production` unless you add `-- --allow-production`. `create:staff` never overwrites an existing email. After the first admin exists, manage categories and promote users in the admin dashboard.

**Existing databases: check category names first.** Category names are unique ignoring case, enforced by a unique index. If a database already has names that differ only in case (`Billing` and `billing`), that index cannot be built: the server still starts but logs the conflicting names and ids, and `seed:categories` stops without writing. Run the read-only check before deploying (it never writes, and may be pointed at a remote database):

```bash
npm run check:categories
# exit 0: no conflicts. exit 1: lists each clashing name with its id.
```

Rename all but one category in each group (admin dashboard → Categories), run the check again, then restart the server or run `seed:categories` to build the index. Nothing is renamed, merged or deleted automatically.

Sign in as the admin at http://localhost:5173/staff/login.

### Demo data (optional, local only)

For presentations, `seed:demo` fills a **local** database with a small, consistent Help Desk: the four default categories, staff and customers, and seven tickets covering every status and priority, some with replies and a status history. The tickets get SLA due dates from the same rule and settings as the API, and when seeded they show every SLA state, including one unresolved overdue ticket. A database seeded before SLAs existed keeps its tickets as they were (insert-only).

```bash
cd backend
MONGODB_URI=mongodb://127.0.0.1:27017/helpdesk_demo npm run seed:demo
# PowerShell: $env:MONGODB_URI='mongodb://127.0.0.1:27017/helpdesk_demo'; npm run seed:demo

# Then start the API on the same database (the environment variable overrides backend/.env):
MONGODB_URI=mongodb://127.0.0.1:27017/helpdesk_demo npm run dev
```

It **refuses** any remote database (including Atlas; there is no override), any database whose name does not end in `_demo`, `_dev` or `_test`, and `NODE_ENV=production`. It only inserts: running it again keeps every existing record unchanged, and it stops without writing if a demo email already belongs to an account with a different role.

| Role | Name | Email | Signs in at |
| --- | --- | --- | --- |
| Admin | Meera Iyer | `admin.demo@example.com` | `/staff/login` |
| Agent | Arjun Mehta | `arjun.agent.demo@example.com` | `/staff/login` |
| Agent | Sara Thomas | `sara.agent.demo@example.com` | `/staff/login` |
| Customer | Rohan Kapoor | `rohan.demo@example.com` | `/login` |
| Customer | Ananya Rao | `ananya.demo@example.com` | `/login` |
| Customer | Daniel Fernandes | `daniel.demo@example.com` | `/login` |

**Demo-only password** for all six accounts: `HelpDeskDemo!2026` (or set `DEMO_PASSWORD` before seeding). It is public in this README, so never use it, or these accounts, on a real deployment. Names are fictional and `example.com` is a reserved domain, so no email reaches a real person.

## Environment variables

Never commit `.env`. Only the `.env.example` files, which contain dummy values, belong in Git. If you add a variable, add it to the matching `.env.example` in the same pull request.

**backend/.env**

| Variable | Required | Purpose | Example |
| --- | --- | --- | --- |
| `PORT` | No (default 4000) | API port | `4000` |
| `MONGODB_URI` | Yes | MongoDB connection string. **Name the database** after the host: without one MongoDB uses `test`; the server warns in development and refuses to start in production. The startup log shows the database in use. | `mongodb://127.0.0.1:27017/helpdesk`, `mongodb+srv://…mongodb.net/helpdesk?retryWrites=true` |
| `JWT_SECRET` | Yes | Secret for signing login tokens | long random string |
| `JWT_EXPIRES_IN` | No (default `1d`) | Login token lifetime (contract C-3, still open) | `1d`, `12h` |
| `CLIENT_URL` | Yes | Frontend origin allowed by CORS, and the base for links in emails | `http://localhost:5173` |
| `CORS_ORIGINS` | No | Extra frontend origins allowed by CORS, comma-separated exact origins (no paths, no `*`). Email links still use `CLIENT_URL`. | `http://localhost:5174,http://127.0.0.1:5173` |
| `NODE_ENV` | No (default `development`) | `production` turns on the strict checks below (secret, database name, real email transport), HSTS over HTTPS and combined-format request logs | `production` |
| `AUTH_RATE_LIMIT_MAX` | No (default 20; 0 in tests) | Sign-in and sign-up attempts allowed per client IP per window (separate budgets). `0` turns limiting off. | `20` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | No (default 900000 = 15 min) | Rate-limit window | `900000` |
| `SENSITIVE_RATE_LIMIT_MAX` | No (default 5; 0 in tests) | Password-reset requests, reset-link attempts and password/email changes per IP per window | `5` |
| `EMAIL_TRANSPORT` | No | `smtp`, `outbox` (development default: writes emails to `backend/.outbox/`), `memory` (tests), `disabled`. Production default: `smtp` | `smtp` |
| `EMAIL_FROM` | With `smtp` | Sender address | `Help Desk <no-reply@your-domain>` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | `SMTP_HOST` with `smtp` | SMTP server and credentials (port 587, secure=false by default). `SMTP_USERNAME` / `SMTP_PASSWORD` also work. | |
| `EMAIL_OUTBOX_DIR` | No | Folder for `outbox` emails | `backend/.outbox` (default) |
| `PASSWORD_RESET_TTL_MINUTES` | No (default 30) | Reset-link lifetime | `30` |
| `EMAIL_CHANGE_TTL_HOURS` | No (default 24) | Email-confirmation link lifetime | `24` |
| `SLA_HOURS_HIGH`, `SLA_HOURS_MEDIUM`, `SLA_HOURS_LOW` | No (defaults 24, 72, 168) | Resolution target per priority, in whole calendar hours from 1 to 8760 (one year). Anything else stops the server at startup. See [SLA due dates](#sla-due-dates). | `24`, `72`, `168` |
| `MONGODB_URI_TEST` | No | Test database for `npm test`. Must be a local MongoDB, and the name must end in `_test`. **Set it in the shell, not in this file:** the test setup reads it before dotenv loads `.env`, so a value in `.env` has no effect. | `mongodb://127.0.0.1:27017/helpdesk_test` (default) |

The backend exits on startup with a clear message if a required variable is missing. `npm start` and `npm run dev` also exit if MongoDB is unreachable; where the app runs as a function, the first request that needs the database connects instead (see [Deployment readiness](#deployment-readiness)). **With `NODE_ENV=production` it also refuses a `JWT_SECRET` shorter than 32 characters or equal to the `.env.example` placeholder** (the message never shows the secret). Development and test accept any non-empty value.

### Email

Password reset, email-change confirmation, security notices and **ticket status emails** are sent by `backend/src/services/email.js` (Nodemailer).

- **Ticket status emails:** when the assigned agent or an admin moves a ticket to *In progress* or *Resolved*, the ticket's customer (if their account is active) gets one email with the ticket number, their subject, the previous and new status and a link to the ticket. It never names the agent. It is sent in the background, so the API answers straight away; a failed delivery never undoes the change. A failure is logged with its purpose and error codes only (see [Known limitations](#known-limitations-and-open-decisions)). On shutdown the API waits up to 5 seconds for these emails.
- **Templates:** ticket status and password reset emails share one HTML layout (tables and inline styles, for email clients) and have a plain-text version. The other account emails use a simpler layout.
- **SMTP timeouts:** a connection attempt or the server's greeting is abandoned after 10 seconds, and an open connection after 20 seconds of silence, so an unresponsive email server never hangs a request or a shutdown.

- **Development (default):** nothing is sent. Each email is written to `backend/.outbox/` (git-ignored) as a text file; open it to use the link. Only the plain-text part is saved, so the HTML design cannot be seen there. The folder contains one-time links, so do not share it.
- **Production:** set `EMAIL_TRANSPORT=smtp`, `EMAIL_FROM` and `SMTP_HOST` (plus `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` from your provider, e.g. Mailtrap, Brevo, SendGrid SMTP, Amazon SES SMTP or a Gmail app password). The server refuses to start in production with `outbox`/`memory`, or with `smtp` but no `SMTP_HOST`/`EMAIL_FROM`. `EMAIL_TRANSPORT=disabled` turns email off explicitly (password reset then cannot work).
- **Links** in emails are built from `CLIENT_URL`, never from request headers.
- Credentials only ever come from the environment; nothing is hard-coded.

Over the rate limit, sign-in and sign-up return `429 RATE_LIMITED` with a `Retry-After` header, and the sign-in pages show "Too many sign-in attempts…". The limiter keeps its counts in memory per API process; behind a reverse proxy, enable Express `trust proxy` so the real client IP is used.

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**frontend/.env**

| Variable | Purpose | Example |
| --- | --- | --- |
| `VITE_API_URL` | Backend base URL | `http://localhost:4000` |

`VITE_` variables are bundled into the browser code, so never put secrets in them.

### SLA due dates

Every new ticket gets a **due date by which it should be resolved** (an SLA resolution target; it is not a first-response target). The target depends on the priority:

| Priority | Target | Setting |
| --- | --- | --- |
| High | 24 hours | `SLA_HOURS_HIGH` |
| Medium | 72 hours | `SLA_HOURS_MEDIUM` |
| Low | 168 hours (7 days) | `SLA_HOURS_LOW` |

- **Calendar hours:** nights, weekends and holidays count; there are no business hours.
- **Due date** = creation time + the target. It is stored on the ticket (`dueAt`) and returned to agents and admins only; customer-facing responses never include it.
- **Priority changes** move the due date to creation time + the new priority's target (never "from now"), in the same update as the priority. Changing only the assignee, or the status, never moves it.
- **Changing the settings** affects tickets created afterwards; existing tickets keep their due date until their priority changes.
- **Older tickets** created before SLAs existed have no due date and are treated as "no SLA"; nothing is filled in for them.
- **States:** met / missed (resolved on time or late), overdue (not resolved, past the due date), due soon (25% or less of the target left), due. They are worked out when needed: no background jobs run and no reminders are sent.

**In the staff screens,** Agent Inbox and Admin Tickets show an SLA badge on every ticket, in the list and in the ticket details; the details also show the exact due date. The API provides `dueAt`, and the frontend works out the state and the time left or overdue from it, using the same rules as the backend. It never calculates a due date.

| Badge | Example | Meaning |
| --- | --- | --- |
| Due | `Due in 2d 4h` | Not resolved, more than 25% of the target left |
| Due soon | `Due soon · in 4h` | Not resolved, 25% or less left, up to and including the due date |
| Overdue | `Overdue by 3h` | Not resolved, past the due date |
| Met | `Met` | Resolved on or before the due date |
| Missed | `Missed` | Resolved after the due date |
| No SLA | `No SLA` | No due date (older tickets), or a resolved ticket with no resolution time recorded |

The time shown updates whenever the screen renders again, for example after a change or a refresh; there is no timer. Customer screens show no SLA information.

The startup log shows the targets in use, e.g. `SLA resolution targets: high 24 h, medium 72 h, low 168 h (calendar hours)`.

### Reports and analytics

The admin **Reports** tab shows figures from `GET /api/admin/analytics` (admins only; agents and customers get 403). Everything on the page, including Agent Performance and the CSV export, follows the selected range.

- **Date basis:** every figure is for tickets **created** in the range, and shows their current state. The page says so, and shows the time the Overdue and Due soon figures were worked out.
- **Ranges:** last 7, 30 or 90 days (rolling: N × 24 hours up to now), all time, or custom. A custom range includes both whole days in the browser's time zone and is sent as UTC instants. Blank, impossible, future or reversed dates are refused; they never fall back to all time.
- **Average resolution time:** `resolvedAt − createdAt` for resolved tickets. Tickets with missing, invalid or negative times are left out and counted. `updatedAt` is never used. Resolved is final, so reopening does not affect it.
- **SLA:** states come from the same rule as the badges. Met and Missed are resolved tickets; Due, Due soon and Overdue are unresolved tickets at that moment, so an overdue ticket is not counted as missed. No SLA is shown separately.
- **SLA compliance:** Met ÷ (Met + Missed) × 100, rounded down to one decimal, shown with the number of tickets it covers. With none it says "No data" rather than 0%.
- **No data versus zero:** if the request fails the page shows an error, a retry and `—`, never 0. A figure missing from a response shows "Unavailable". A range with no tickets shows real zeros and "No tickets in this period".

The counts and the SLA figures are two separate reads, so a ticket changing during a request can make them differ by that ticket. Full definitions: [API contract §11](docs/API_CONTRACT.md).

## Scripts

| Location | Command | What it does |
| --- | --- | --- |
| backend | `npm run dev` | Start the API with auto-restart when files in `src/` change (`node --watch-path=src`). The first lines show the database, email transport and CORS origins in use. |
| backend | `npm start` | Start the API (production) |
| backend | `npm test` | Run backend tests |
| backend | `npm run seed:categories` | Add the default categories if missing (see [First run](#first-run-initialise-the-database)) |
| backend | `npm run seed:demo` | Add demo staff, customers and tickets to a local `*_demo`/`*_dev`/`*_test` database (see [Demo data](#demo-data-optional-local-only)) |
| backend | `npm run create:staff` | Create an agent or admin account from `STAFF_*` variables |
| backend | `npm run check:categories` | Read-only: list category names that differ only in case (they block the unique name index) |
| frontend | `npm run dev` | Start the Vite dev server on port 5173 (`--strictPort`: fails if the port is taken instead of moving to another) |
| frontend | `npm test` | Run frontend unit and real React DOM tests |
| frontend | `npm run build` | Production build into `frontend/dist/` |
| frontend | `npm run preview` | Serve the production build locally |

## Testing

```bash
cd backend
npm test
```

What the backend tests cover:

- `authApi.test.js`, `auth.test.js`, `authSecurity.test.js`: sign-up, sign-in, tokens (expired, forged, deactivated, role changes), profile update, rate limiting, production configuration rules (secret, email)
- `accountSecurity.test.js`: password change (sessions revoked), email change and confirmation, forgot/reset password (generic answers, valid/invalid/expired/reused links, cooldown), links voided after a password or email change, email failures, no tokens in responses or logs
- `notifications.test.js`: who is notified for each ticket event (never the actor, no duplicates, access rules), list/count/mark-read endpoints, cross-user protection, links after access is lost
- `customerTickets.test.js`: ticket creation (validation, `categoryId`, server-set fields) and `GET /my` (ownership, pages, filters)
- `agentWorkflow.test.js`, `ticketAccess/Assign/Query/Status*.test.js`: queue, filters, access policy, assignment, status transitions, comments, the HD-104 scenario end to end
- `categories.test.js`, `adminUsers.test.js`, `adminStats.test.js`: category and user management, `CANNOT_MODIFY_SELF`, statistics and date range
- `analytics.test.js`, `analyticsApi.test.js`: the analytics figures with a fixed clock (SLA states at exact boundaries and matching `slaState`, resolution time, categories, date ranges), access, date validation, and no personal data or ticket text in the response
- `ticketOwnership.test.js`: the D-10 rules (no work on unassigned tickets, no release while in progress, resolved is final) and D-11 replies
- `ticketIdempotency.test.js`: duplicate submissions with `Idempotency-Key`, including simultaneous requests and failure cases
- `seedDemo.test.js`: the demo data guard, contents, repeat runs and existing records
- `serverLifecycle.test.js`: startup errors (port in use) and graceful shutdown (including waiting for emails), on spare ports; the real-`SIGTERM` case is skipped on Windows
- `sla.test.js`, `slaTickets.test.js`: SLA settings, due-date and state rules at exact boundaries (fixed dates), due dates on creation (including idempotent creation and replay), priority changes, older tickets without a due date, and staff-only visibility
- `emailTemplates.test.js`: the ticket status and password reset emails (layout, HTML and plain-text parts, wording, links, escaping, the `Hi there,` fallback, no staff data, reset expiry, tokens never in logs)
- `statusEmails.test.js`: ticket status emails (recipient, contents, escaping, no email for rejected or unrelated changes, inactive customers, delivery failures, background delivery), the outbox transport and SMTP timeouts
- `logPrivacy.test.js`: simulated SMTP rejections quoting the address on each email path, and request-log redaction, leave no address, link or server reply in the logs
- `databaseConnection.test.js`: connecting on demand, losing and regaining the database through a local proxy (the client is kept, work in flight survives), the health ping, and which answers do and do not need the database
- `health.test.js`, `errors.test.js`, `validate.test.js`, `models.test.js`, `db-helpers.test.js`, `envConfig.test.js`, `securityHeaders.test.js`, `methodNotAllowed.test.js`: health check, error envelope, helpers, models, the test-database guard, configuration rules, security headers, `405` responses

Latest results and the browser checks performed are recorded in [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md).

**Your development data is safe.** `npm test` always uses `MONGODB_URI_TEST` from the shell (default `mongodb://127.0.0.1:27017/helpdesk_test`) and ignores `MONGODB_URI` in your `.env`. The test setup reads it before dotenv loads `.env`, so it cannot be set there. With `npm test`, every test file stops before it can connect if `MONGODB_URI_TEST` is not a `mongodb://` URI on this machine (`localhost`, `127.x.x.x` or `[::1]`) naming a database that ends in `_test`, and the helpers in `test/helpers/db.js` also refuse to connect to or clear anything else, so Atlas and other remote databases cannot be used through them. **Always run the tests with `npm test`:** this safety check is a preload (`test/setup.js`), which running a file directly with `node --test` skips. Without it, the app can read `MONGODB_URI` from your `.env`. The check validates the configured URI, not every connection a test could open by itself.

Most tests do not need MongoDB. Tests that do need it are **skipped** (shown as `# SKIP` with a reason) if MongoDB is not running. Set `REQUIRE_TEST_DB=1` to make them **fail** instead; CI always does this.

**Writing tests for a new module:**

- Name the file `backend/test/<feature>.test.js`.
- Use `request(app)` from Supertest. `app` is imported from `src/app.js` and does not open a port.
- For database tests, call `connectTestDB()` in `before`, `clearTestDB()` in `beforeEach`, and `disconnectTestDB()` in `after`. See `test/health.test.js` for the pattern.
- Test files run one at a time, so they never clear each other's data.

**Frontend:** `cd frontend && npm test` runs the suite with Node's built-in runner and four pinned test dependencies: `jsdom` 29.1.1, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2 and `@testing-library/user-event` 14.6.8. Latest result, including Linux CI: **417 tests, 83 suites, 0 failed, 0 skipped**. Run `npm run build` to check the app compiles.

- **Unit tests:** the API layer against a fake `fetch` (methods, URLs, bodies, error handling), form validation, session storage, status rules, display helpers, staff filters and paging, status-history display, the CSV export, SLA states and badges, analytics ranges and panels, and the New Ticket category messages. Some render components such as `SlaBadge` and `AnalyticsPanels` to static HTML.
- **Real React DOM tests:** real screens rendered in jsdom, with typing and clicking through Testing Library and only `fetch` faked. They cover route guards, expired sessions, sign-in and sign-up, My Tickets, New Ticket, customer ticket details, Agent Inbox, the Admin Tickets dialog and Account Security. Not every screen is covered: [docs/FRONTEND_RENDER_TEST_PLAN.md](docs/FRONTEND_RENDER_TEST_PLAN.md) lists the coverage and remaining gaps.
- **Not implemented:** browser, visual and end-to-end tests. DOM tests do not show layout, appearance or real API responses. Earlier scripted real-browser checks (customer, agent, admin, cross-role, backend outages, layouts) ran outside the repository and are historical; see [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md).

## Continuous integration

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every pull request into `main` and on every push to `main`. A newer push to the same pull request or branch cancels the older run.

| Job | What it checks |
| --- | --- |
| **Backend tests** | Node 22 with a MongoDB 7 service. Runs `npm ci` and `npm test` in `backend/` with `REQUIRE_TEST_DB=1`, so database tests must run: if MongoDB is unreachable, the job fails instead of skipping them. |
| **Frontend tests and build** | Node 22. Runs `npm ci`, `npm test` and `npm run build` in `frontend/`. |

Only merge a pull request when both jobs pass.

Run the same checks locally before opening a pull request (MongoDB must be running):

```bash
# Backend (same settings as CI)
cd backend
npm ci
REQUIRE_TEST_DB=1 npm test                 # PowerShell: $env:REQUIRE_TEST_DB='1'; npm test

# Frontend
cd ../frontend
npm ci
npm test
npm run build
```

## Deployment readiness

**Not deployed yet.** The hosting provider and the production database are still to be chosen, so nothing below assumes a particular host. The app deploys as two parts: the API (a Node web service) and the frontend (static files).

| | Backend (API) | Frontend |
| --- | --- | --- |
| Install | `cd backend && npm ci` | `cd frontend && npm ci` |
| Build | none | `npm run build` → `frontend/dist/` |
| Start | `npm start` (`node src/server.js`), Node 22.12 or newer | serve `frontend/dist/` as a static site |
| Health check | `GET /api/health`: **200** `{"status":"ok","database":"connected",…}`; **503** `{"status":"degraded","database":"disconnected",…}` when MongoDB does not answer. Any such answer means the API process is running. Each call pings the database (limit about 2.5 s, plus up to about 7 s to connect first if there is no connection yet), so avoid polling it more often than monitoring needs. | |

**Backend environment variables** (set them in the host's secret settings, never in Git; values are described in [Environment variables](#environment-variables)):

- Required: `NODE_ENV=production`, `MONGODB_URI` (the production database, **with the database name** in the URI), `JWT_SECRET` (at least 32 random characters), `CLIENT_URL` (the deployed frontend's origin, e.g. `https://…`, no path).
- Email: `EMAIL_TRANSPORT=smtp` with `EMAIL_FROM`, `SMTP_HOST` and usually `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`. Production refuses `outbox` and `memory`. `EMAIL_TRANSPORT=disabled` starts without email, but then **password reset and email changes cannot complete**: the screens confirm that a link was sent, and none arrives.
- Optional: `PORT` (most hosts set it), `CORS_ORIGINS`, `JWT_EXPIRES_IN`, the rate-limit and link-lifetime settings.

The API refuses to start, with a message naming the problem, if a required variable is missing, the secret is weak or the example placeholder, the URI names no database, or production email is misconfigured.

**Frontend:** `VITE_API_URL` (the deployed API's URL) is read **at build time** and built into the files: set it before `npm run build`. Without it the build points at `http://localhost:4000`.

**Frontend routes:** the app uses browser routes (`/tickets/…`, `/agent/dashboard`, `/admin/dashboard?ticket=…`). The static host must answer every path that is not a file with `index.html` (a "rewrite to index.html" or "single-page app" setting); otherwise refreshing a page or opening a link gives 404.

**CORS:** the API answers only `CLIENT_URL` (plus any `CORS_ORIGINS`), compared exactly: scheme, host and port, no trailing slash. Links in emails also use `CLIENT_URL`.

**Known gaps before the first deployment** (not fixed yet):

| Gap | Effect | Planned fix |
| --- | --- | --- |
| Express `trust proxy` is not configured | Behind the host's HTTPS proxy every request appears to come from the proxy: sign-in rate limits are shared by all users, and HSTS is never sent | `TRUST_PROXY`, below, once the host is chosen |
| Rate limits are kept in memory | Correct for one instance only | Run a single instance, or add a shared store later |

**Database connection** (`backend/src/config/db.js`, `backend/src/middleware/database.js`): one MongoDB client per running process, with a pool of up to 10 connections and a limit of about 5 seconds to find a server.

- `npm start` connects before listening and exits if it cannot. Where only `backend/src/app.js` runs, as on a host that runs the API as a function, nothing connects until a request needs the database, and requests arriving together share one attempt. A failed attempt is not remembered, so the next request tries again.
- If the connection is lost, the client is **not** closed: requests may still be using it, and the driver reconnects it once the database answers. A request in the meantime pings it (limit about 5 s) and gets `503 DATABASE_UNAVAILABLE` if there is no answer.
- A caller waits about 7 seconds at most for a connection. The attempt carries on after that, and later requests share its result. This limits how long a request waits, not the DNS lookup for a `mongodb+srv` URI, which the configured timeouts do not cover: while a slow lookup is running, requests can keep answering 503.
- Requests that need no database keep their normal answers during an outage: 401, 404, 405 and preflights do not wait for it. The full list is in [docs/API_CONTRACT.md](docs/API_CONTRACT.md#database-unavailable).

Limitations:

- **A client that never recovers is not replaced.** Requests keep getting 503 until the driver reconnects it, the process restarts, or the host recycles the serverless instance.
- **A write that gets 503 may have been applied.** If the connection is lost part-way, the outcome is uncertain, so re-read the data before retrying.
- **Rate limits still count during an outage.** Sign-in and password-reset attempts that get 503 use up the limit, so repeated retries can give 429 once the database is back.
- **The startup category check only runs with `npm start` and `npm run dev`.** On a host that runs only `app.js`, run `npm run check:categories` as part of deployment setup: names that differ only in case stop the unique name index from being built, and the running API does not report it there. `npm run seed:categories` also reports such conflicts.
- **Not yet verified on a real host:** this has only been tested locally, against a standalone MongoDB behind a test proxy. Serverless behaviour (suspended instances, connection counts), `mongodb+srv` lookups and replica-set failover, such as on Atlas, still need a test after deployment.

**Startup and shutdown** apply when the API runs as a long-lived process with `npm start`; they are not used where only `app.js` runs. In `backend/src/startServer.js`: a port that cannot be opened is reported ("port … is already in use") and the process exits with status 1. On `SIGTERM` (sent by hosts on redeploy, and by `npm run dev` when it restarts) or `SIGINT` (Ctrl+C), the API stops accepting connections, lets requests in progress finish, closes idle connections, waits up to 5 seconds for ticket status emails still being sent, disconnects MongoDB and exits 0; after 10 seconds in total it gives up and exits 1. The forgot-password email is sent after its response and is not waited for, so a shutdown at that moment can lose it; the customer can request another link.

**`TRUST_PROXY` (proposed, not implemented yet).** It tells the API how many proxies sit in front of it, so that `req.ip` is the real client (rate limits) and `req.secure` reflects HTTPS at the proxy (HSTS).

- Values: unset, empty or `0` = no proxy (today's behaviour, right for local development); a whole number `1`–`10` = that many proxies, each adding the client address to `X-Forwarded-For`. Anything else (`true`, `*`, negative, text) is refused at startup: trusting every proxy would let a client choose its own address and bypass rate limits.
- The number must match the host's actual setup and is set only after the host is chosen. Check it once deployed: with the setting in place, two different networks (e.g. Wi-Fi and a phone hotspot) must get separate sign-in limits, and a request with a made-up `X-Forwarded-For` must still be counted against its real address.

**Data:** `npm run seed:demo` refuses remote databases. On a new production database, run `npm run seed:categories -- --allow-remote` and create the first admin with `npm run create:staff -- --allow-remote` (see [First run](#first-run-initialise-the-database)); never use the public demo password there.

**After deploying, check:** `/api/health` returns 200; customer sign-up, ticket creation and an agent reply work from the deployed frontend (no CORS errors in the browser console); refreshing `/tickets` and a staff dashboard works; a password-reset email arrives (if SMTP is configured); the host's logs show request lines, plus the startup summary (database name, email transport, CORS origins) if the API runs with `npm start`.

## API

The full API, with request/response shapes and error codes, is in **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)**. Change it through a pull request when something needs to change. All endpoints below are implemented and tested.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | API and database status (`200`, or `503` if the database does not answer a ping) |
| POST | `/api/auth/register` | Public (rate limited) | Create a customer account → `{ user, token }` |
| POST | `/api/auth/login` | Public (rate limited) | Sign in → `{ user, token }` |
| GET / PATCH | `/api/auth/me` | Signed in | Current user; PATCH changes your own `name` only |
| POST | `/api/auth/me/password` | Signed in (rate limited) | `{ currentPassword, newPassword }` → `{ user, token }`; signs out other sessions |
| GET / POST / DELETE | `/api/auth/me/email` | Signed in | Pending email change / request `{ newEmail, currentPassword }` (sends a link) / cancel |
| POST | `/api/auth/verify-email` | Public (rate limited) | `{ token }` from the email link → `{ email }` |
| POST | `/api/auth/forgot-password` | Public (rate limited) | `{ email }` → the same generic answer for every address |
| POST | `/api/auth/reset-password/check`, `/api/auth/reset-password` | Public (rate limited) | Check a reset link / `{ token, newPassword }` |
| GET | `/api/notifications` | Signed in | Own notifications: `unread`, `page`, `limit` (max 50) → `{ notifications, page, limit, total, unreadCount }` |
| GET | `/api/notifications/unread-count` | Signed in | `{ unreadCount }` |
| PATCH / POST | `/api/notifications/:id/read`, `/api/notifications/read-all` | Signed in | Mark one / all of your own as read |
| POST | `/api/tickets` | Customer | Raise a ticket `{ subject, description, categoryId, priority? }` → `{ ticket }` |
| GET | `/api/tickets/my` | Customer | Own tickets: `status`, `priority`, `category`, `q`, `page`, `limit` → `{ tickets, page, limit, total }` |
| GET | `/api/tickets` | Agent\*, Admin | Queue: `status`, `priority`, `category`, `assignee` (`me`/`unassigned`/id), `q`, `page`, `limit` |
| GET | `/api/tickets/:id` | Owner, Agent\*, Admin | Ticket with description and status history |
| PATCH | `/api/tickets/:id/assign` | Agent\*, Admin | `{ assignedTo?, priority? }`; agents can only claim or release |
| PATCH | `/api/tickets/:id/status` | Agent\*, Admin | One step forward: open → in_progress → resolved |
| GET / POST | `/api/tickets/:id/comments` | Owner, Agent\*, Admin | Conversation (oldest first) / reply |
| GET | `/api/categories` | Signed in | Active categories |
| GET / POST | `/api/admin/categories` | Admin | All categories / create `{ name, description? }` |
| PATCH | `/api/admin/categories/:id` | Admin | `{ name?, description?, isActive? }` |
| GET | `/api/admin/users` | Admin | `role`, `isActive`, `q`, `page`, `limit` → `{ users, page, limit, total }` |
| PATCH | `/api/admin/users/:id/role` | Admin | `{ role }`; not on yourself (`CANNOT_MODIFY_SELF`) |
| PATCH | `/api/admin/users/:id/status` | Admin | `{ isActive }`; not on yourself |
| GET | `/api/admin/stats` | Admin | Totals by status, category, priority, assignee; optional `from` date |
| GET | `/api/admin/analytics` | Admin | Reports figures for tickets created in an inclusive `from`..`to` range (see [Reports and analytics](#reports-and-analytics)) |

Agent\* = unassigned tickets and tickets assigned to that agent (contract OPEN-1).

All errors use one JSON shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Subject is required" } }
```

In backend code, throw an `ApiError` and the error middleware does the rest:

```js
import { ApiError } from '../utils/ApiError.js';
import { requireString, requireOneOf } from '../utils/validate.js';

const subject = requireString(req.body.subject, 'subject', { min: 5, max: 120 }); // 400 if invalid
const priority = requireOneOf(req.body.priority, ['low', 'medium', 'high'], 'priority');
if (!ticket) throw ApiError.notFound('Ticket not found');                         // 404
if (!canView) throw ApiError.forbidden();                                         // 403
```

Express 5 forwards errors thrown in `async` route handlers automatically, so no `try/catch` or wrapper is needed. Mongoose validation errors, invalid ObjectIds and duplicate keys are converted to 400, 400 and 409 automatically.

**Decided** (see the contract, Section 1): JWT Bearer tokens (OPEN-2) and the agent access policy (OPEN-1), both implemented. The engineering defaults D-1 to D-9 are implemented and waiting for the owners' review. D-10 (ticket ownership) and D-11 (who may reply) are also implemented.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Missing environment variables: …` on backend start | You have not created `backend/.env`. Copy it from `.env.example`. |
| `Could not connect to MongoDB: connect ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running. Start the MongoDB service (Windows: Services → MongoDB Server, or `net start MongoDB` as administrator; macOS: `brew services start mongodb-community`), or point `MONGODB_URI` at Atlas. |
| Atlas connection times out | Add your IP address under Atlas → Network Access, and check the username/password in the URI. |
| `Could not start the API: port 4000 is already in use` | Another process is using the port. Stop it, or change `PORT` in `backend/.env` **and** `VITE_API_URL` in `frontend/.env`. |
| Frontend shows "Cannot reach the server" | The backend is not running, or `VITE_API_URL` is wrong. Restart `npm run dev` in `frontend` after changing `.env`. |
| Browser console shows a CORS error | The frontend address (including port) must be `CLIENT_URL` or listed in `CORS_ORIGINS` in `backend/.env`, e.g. `http://localhost:5173`. Restart the backend afterwards. |
| Frontend `npm run dev` fails with "Port 5173 is already in use" | Another dev server holds the port (Vite no longer silently moves to 5174, which the API would refuse). Stop it, or run `npx vite --port 5174 --strictPort` and add `http://localhost:5174` to `CORS_ORIGINS`. |
| Health check shows `503` / `database: disconnected`, or a request gets `503 DATABASE_UNAVAILABLE` | The API is running but MongoDB is not answering. Check that MongoDB is still running; for Atlas, also check Network Access. The API reconnects by itself once it answers, and the server log shows the reason with credentials masked. |
| A database test shows `# SKIP MongoDB is not reachable` | Start MongoDB, or set `MONGODB_URI_TEST` in the shell. |
| `npm test` says `Refusing to use …` | `MONGODB_URI_TEST` is not a local MongoDB, or names a database that does not end in `_test`. |
| `npm install` fails with `EBUSY` / `EPERM` on Windows | The folder is inside OneDrive or another synced folder. Pause syncing or move the project to a non-synced folder such as `C:\dev\help-desk`. |
| `node: bad option: --watch` or Vite engine errors | Your Node.js is too old. Install Node 22 LTS. |

## Git workflow

- `main` is the stable branch. Do not commit directly to it.
- Create one branch per feature, e.g. `feature/auth-api`, `feature/agent-workflow`, `feature/customer-ui`, `feature/agent-admin-ui`.
- Pull the latest `main` before starting: `git switch main && git pull`.
- Commit small, meaningful changes, e.g. `Add ticket status validation`.
- Run `npm test` (backend) and `npm run build` (frontend) before opening a pull request.
- Open a pull request into `main` and get one teammate's review before merging.
- If your change affects the API, update `docs/API_CONTRACT.md` in the same pull request.

## Known limitations and open decisions

| Item | Current behaviour | Decision needed |
| --- | --- | --- |
| Token lifetime (C-3) | 1 day (`JWT_EXPIRES_IN`), no refresh tokens | Confirm |
| Token storage (C-6) | `sessionStorage`: survives a reload, ends when the tab closes | Confirm |
| Logout (C-7) | Signing out discards the token in the browser. A password change or reset signs the user out everywhere (token version), and deactivation blocks tokens immediately; there is no single-session server logout. | Confirm |
| Email delivery | Development writes emails to `backend/.outbox/`; production needs SMTP settings | Choose a provider and add its credentials |
| Notifications | In-app for every ticket event, refreshed every minute while the page is visible. Email only to customers, for status changes; no push notifications and no email opt-out | Product decision |
| Internal notes | Not implemented: every reply is visible to the customer | Product decision |
| Reopening resolved tickets | Status only moves forward (D-3); replies on resolved tickets are allowed | Product decision |
| Rate limiting | In memory, per process | Shared store if the API runs as several processes |
| Deactivated or demoted agents | Their assigned tickets stay assigned; admins see and can reassign them | Confirm |
| Personal data in server logs | Failed emails log only their purpose and error codes, and request logs leave out query strings, also in the referrer. Tested with simulated SMTP errors, not a live server. Request logs still show URL paths as sent (and client IP and user agent in production). Unexpected server errors are logged in full. | Review before production |

## Roadmap

1. Planning and API agreement (**done**; a few points open, above)
2. Project setup: skeletons, DB connection, `.env.example`, `/api/health`, test setup (**done**)
3. Parallel modules: auth, tickets, agent workflow, conversations, admin, UI screens (**done**)
4. Integration: the HD-104 scenario end to end in the UI (**done**, verified in a real browser)
5. Testing and refinement against the acceptance criteria (**done**; see [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md))
6. Deployment and demo (**next**; see [Deployment readiness](#deployment-readiness))
