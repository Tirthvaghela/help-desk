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
- [API](#api)
- [Troubleshooting](#troubleshooting)
- [Git workflow](#git-workflow)
- [Known limitations and open decisions](#known-limitations-and-open-decisions)
- [Roadmap](#roadmap)

## Team

| Area | Member | Responsibilities |
| --- | --- | --- |
| Backend | Tirth Vaghela | Backend integration, API contract coordination, testing, DevOps/deployment, README and documentation |
| Backend | Ayushi Rathi | Agent workflow, ticket queue, filters, assignment, status transitions, comments/conversations, admin ticket summary |
| Backend | Swati Parija\* | Authentication, JWT and role middleware, User/Ticket/Category models, ticket creation, customer ticket history, ownership/access checks |
| Frontend | Mimansa Narendra Patle | Customer signup/login, customer dashboard, ticket creation, ticket history, ticket details, loading/error/empty states |
| Frontend | Shwetaleena Kundu | Agent dashboard, ticket filtering, replies, assignment/status updates, admin user/category screens |

\* Spelling of this name is still to be confirmed with the team member.

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
| Admin category management and user management (role, activation) | ✅ Implemented |
| Landing page, customer portal, agent dashboard, admin dashboard | ✅ Implemented, connected to the API |
| Customer profile: change own name | ✅ Implemented |
| Account security: change password, change email (confirmed by email), forgot/reset password | ✅ Implemented (needs an email provider in production, see [Email](#email)) |
| In-app notifications (ticket created, assigned, priority, status, resolved, replies) | ✅ Implemented (bell in every signed-in header) |
| Safe database initialisation (default categories, first admin) | ✅ Implemented (`npm run seed:categories`, `npm run create:staff`) |
| Backend tests (`node:test` + Supertest) and frontend unit tests (`node:test`) | ✅ Implemented |
| API contract | 📝 [docs/API_CONTRACT.md](docs/API_CONTRACT.md); a few points are still open (see below) |
| Deployment | ⏳ Planned (host to be confirmed with mentor) |

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, Vite, React Router, Tailwind CSS |
| Backend | Node.js, Express 5, Mongoose |
| Database | MongoDB |
| Testing | Node's built-in test runner (`node:test`), Supertest |
| DevOps | Git/GitHub; deployment target to be confirmed (Render or equivalent) |

## Project structure

```
help-desk/
├── backend/
│   ├── src/
│   │   ├── config/        env.js + envRules.js (env checks), db.js (MongoDB connection)
│   │   ├── controllers/   auth, customer tickets, agent tickets, comments, categories, admin users, stats
│   │   ├── middleware/    auth.js (JWT + roles), rateLimit.js, errorHandler.js
│   │   ├── models/        User, Category, Ticket, TicketComment, Counter
│   │   ├── routes/        one router per area, mounted in app.js
│   │   ├── utils/         ApiError, validation, ticket access/query/serializers
│   │   ├── app.js         Express app: middleware + route mounting
│   │   └── server.js      Entry point: connect DB, then start listening
│   ├── scripts/           seed-categories.js, create-staff.js (safe database initialisation)
│   ├── test/              node:test + Supertest; helpers/ (isolated test database, factories)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── public/            favicon.svg
│   ├── src/
│   │   ├── api/           client.js (fetch wrapper), tickets.js, admin.js, useApiData.js
│   │   ├── auth/          AuthProvider, session storage, StaffRoute / CustomerRoute guards
│   │   ├── components/    landing/, customer/, agent/, admin/, staff/ (shared helpers), common/
│   │   ├── pages/         HomePage (landing), customer/, agent/, admin/, StaffLogin, NotFoundPage
│   │   ├── App.jsx        Routes
│   │   └── main.jsx       Entry point
│   ├── test/              node:test unit tests for the API layer and pure logic
│   ├── .env.example
│   └── package.json
├── .github/workflows/ci.yml   GitHub Actions: backend tests, frontend tests + build
└── docs/
    ├── API_CONTRACT.md            Endpoints, request/response shapes, error codes, decisions
    ├── DATA_MODEL.md              Collections and fields
    └── CUSTOMER_TICKET_API_GAPS.md  History of the customer ticket API alignment

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

You should see:

```
MongoDB connected: 127.0.0.1/helpdesk
API listening on http://localhost:4000
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

## Environment variables

Never commit `.env`. Only the `.env.example` files, which contain dummy values, belong in Git. If you add a variable, add it to the matching `.env.example` in the same pull request.

**backend/.env**

| Variable | Required | Purpose | Example |
| --- | --- | --- | --- |
| `PORT` | No (default 4000) | API port | `4000` |
| `MONGODB_URI` | Yes | MongoDB connection string | `mongodb://127.0.0.1:27017/helpdesk` |
| `JWT_SECRET` | Yes | Secret for signing login tokens | long random string |
| `JWT_EXPIRES_IN` | No (default `1d`) | Login token lifetime (contract C-3, still open) | `1d`, `12h` |
| `CLIENT_URL` | Yes | Frontend origin allowed by CORS | `http://localhost:5173` |
| `NODE_ENV` | No (default `development`) | `production` turns on the strict `JWT_SECRET` check below | `production` |
| `AUTH_RATE_LIMIT_MAX` | No (default 20; 0 in tests) | Sign-in and sign-up attempts allowed per client IP per window (separate budgets). `0` turns limiting off. | `20` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | No (default 900000 = 15 min) | Rate-limit window | `900000` |
| `SENSITIVE_RATE_LIMIT_MAX` | No (default 5; 0 in tests) | Password-reset requests, reset-link attempts and password/email changes per IP per window | `5` |
| `EMAIL_TRANSPORT` | No | `smtp`, `outbox` (development default: writes emails to `backend/.outbox/`), `memory` (tests), `disabled`. Production default: `smtp` | `smtp` |
| `EMAIL_FROM` | With `smtp` | Sender address | `Help Desk <no-reply@your-domain>` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | `SMTP_HOST` with `smtp` | SMTP server and credentials (port 587, secure=false by default). `SMTP_USERNAME` / `SMTP_PASSWORD` also work. | |
| `EMAIL_OUTBOX_DIR` | No | Folder for `outbox` emails | `backend/.outbox` (default) |
| `PASSWORD_RESET_TTL_MINUTES` | No (default 30) | Reset-link lifetime | `30` |
| `EMAIL_CHANGE_TTL_HOURS` | No (default 24) | Email-confirmation link lifetime | `24` |
| `MONGODB_URI_TEST` | No | Test database for `npm test`. Name must end in `_test`. | `mongodb://127.0.0.1:27017/helpdesk_test` (default) |

The backend exits on startup with a clear message if a required variable is missing or MongoDB is unreachable. **With `NODE_ENV=production` it also refuses a `JWT_SECRET` shorter than 32 characters or equal to the `.env.example` placeholder** (the message never shows the secret). Development and test accept any non-empty value.

### Email

Password reset, email-change confirmation and security notices are sent by `backend/src/services/email.js` (Nodemailer).

- **Development (default):** nothing is sent. Each email is written to `backend/.outbox/` (git-ignored) as a text file; open it to use the link. The folder contains one-time links, so do not share it.
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

## Scripts

| Location | Command | What it does |
| --- | --- | --- |
| backend | `npm run dev` | Start the API with auto-restart on file changes (`node --watch`) |
| backend | `npm start` | Start the API (production) |
| backend | `npm test` | Run backend tests |
| backend | `npm run seed:categories` | Add the default categories if missing (see [First run](#first-run-initialise-the-database)) |
| backend | `npm run create:staff` | Create an agent or admin account from `STAFF_*` variables |
| backend | `npm run check:categories` | Read-only: list category names that differ only in case (they block the unique name index) |
| frontend | `npm run dev` | Start the Vite dev server |
| frontend | `npm test` | Run frontend unit tests |
| frontend | `npm run build` | Production build into `frontend/dist/` |
| frontend | `npm run preview` | Serve the production build locally |

## Testing

```bash
cd backend
npm test
```

What the backend tests cover:

- `authApi.test.js`, `auth.test.js`, `authSecurity.test.js`: sign-up, sign-in, tokens (expired, forged, deactivated, role changes), profile update, rate limiting, production configuration rules (secret, email)
- `accountSecurity.test.js`: password change (sessions revoked), email change and confirmation, forgot/reset password (generic answers, valid/invalid/expired/reused links, cooldown), email failures, no tokens in responses or logs
- `notifications.test.js`: who is notified for each ticket event (never the actor, no duplicates, access rules), list/count/mark-read endpoints, cross-user protection, links after access is lost
- `customerTickets.test.js`: ticket creation (validation, `categoryId`, server-set fields) and `GET /my` (ownership, pages, filters)
- `agentWorkflow.test.js`, `ticketAccess/Assign/Query/Status*.test.js`: queue, filters, access policy, assignment, status transitions, comments, the HD-104 scenario end to end
- `categories.test.js`, `adminUsers.test.js`, `adminStats.test.js`: category and user management, `CANNOT_MODIFY_SELF`, statistics and date range
- `health.test.js`, `errors.test.js`, `validate.test.js`, `models.test.js`, `db-helpers.test.js`: health check, error envelope, helpers, models, the test-database guard

**Your development data is safe.** `npm test` always uses `MONGODB_URI_TEST` (default `mongodb://127.0.0.1:27017/helpdesk_test`) and ignores `MONGODB_URI` in your `.env`. The helpers in `test/helpers/db.js` refuse to connect to or clear any database whose name does not end in `_test`.

Most tests do not need MongoDB. Tests that do need it are **skipped** (shown as `# SKIP` with a reason) if MongoDB is not running. Set `REQUIRE_TEST_DB=1` to make them **fail** instead; CI always does this.

**Writing tests for a new module:**

- Name the file `backend/test/<feature>.test.js`.
- Use `request(app)` from Supertest. `app` is imported from `src/app.js` and does not open a port.
- For database tests, call `connectTestDB()` in `before`, `clearTestDB()` in `beforeEach`, and `disconnectTestDB()` in `after`. See `test/health.test.js` for the pattern.
- Test files run one at a time, so they never clear each other's data.

**Frontend:** `cd frontend && npm test` runs unit tests with Node's built-in runner (no extra dependencies): the API layer against a fake `fetch` (methods, URLs, bodies, error handling), form validation, session storage, status rules, display helpers and the CSV export. Screens are verified with real-browser workflows (customer, agent, admin, cross-role, backend outages, layouts); those scripts are not part of the repository yet. Run `npm run build` to check the app compiles.

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

## API

The full API, with request/response shapes and error codes, is in **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)**. Change it through a pull request when something needs to change. All endpoints below are implemented and tested.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | API and database status (`200`, or `503` without a database) |
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
| GET | `/api/tickets/my` | Customer | Own tickets: `status`, `page`, `limit` → `{ tickets, page, limit, total }` |
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

**Decided** (see the contract, Section 1): JWT Bearer tokens (OPEN-2) and the agent access policy (OPEN-1), both implemented. The engineering defaults D-1 to D-9 are implemented and waiting for the owners' review.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Missing environment variables: …` on backend start | You have not created `backend/.env`. Copy it from `.env.example`. |
| `Could not connect to MongoDB: connect ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running. Start the MongoDB service (Windows: Services → MongoDB Server, or `net start MongoDB` as administrator; macOS: `brew services start mongodb-community`), or point `MONGODB_URI` at Atlas. |
| Atlas connection times out | Add your IP address under Atlas → Network Access, and check the username/password in the URI. |
| `EADDRINUSE: address already in use :::4000` | Another process is using the port. Stop it, or change `PORT` in `backend/.env` **and** `VITE_API_URL` in `frontend/.env`. |
| Frontend shows "Cannot reach the server" | The backend is not running, or `VITE_API_URL` is wrong. Restart `npm run dev` in `frontend` after changing `.env`. |
| Browser console shows a CORS error | `CLIENT_URL` in `backend/.env` must exactly match the frontend address (including port), e.g. `http://localhost:5173`. Restart the backend afterwards. |
| Health check shows `503` / `database: disconnected` | The API is running but lost its MongoDB connection. Check that MongoDB is still running. |
| A database test shows `# SKIP MongoDB is not reachable` | Start MongoDB, or set `MONGODB_URI_TEST`. |
| `npm test` says `Refusing to use database …` | `MONGODB_URI_TEST` points at a database whose name does not end in `_test`. |
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
| Notifications | In-app only, refreshed every minute while the page is visible; no email or push notifications | Product decision |
| Internal notes | Not implemented: every reply is visible to the customer | Product decision |
| Reopening resolved tickets | Status only moves forward (D-3); replies on resolved tickets are allowed | Product decision |
| Rate limiting | In memory, per process | Shared store if the API runs as several processes |
| Deactivated or demoted agents | Their assigned tickets stay assigned; admins see and can reassign them | Confirm |

## Roadmap

1. Planning and API agreement (**done**; a few points open, above)
2. Project setup: skeletons, DB connection, `.env.example`, `/api/health`, test setup (**done**)
3. Parallel modules: auth, tickets, agent workflow, conversations, admin, UI screens (**done**)
4. Integration: the HD-104 scenario end to end in the UI (**done**, verified in a real browser)
5. Testing and refinement against the acceptance criteria (**in progress**)
6. Deployment and demo
