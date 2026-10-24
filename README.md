# Help Desk — Customer Support Ticket System

WeIntern Minor Project · Project 01 / Team 01 · MERN

A web application where customers raise support tickets, support agents triage, reply to and resolve them, and administrators manage users, categories and ticket volume.

Ticket lifecycle: **Open → In Progress → Resolved**, with a timestamped reply thread and status history on every ticket.

> **Current phase: project setup.** The backend and frontend skeletons run and connect to each other, and the shared error handling and test setup are in place. **Authentication, tickets, comments and admin features are not implemented yet.** See [Implementation status](#implementation-status).

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
- [API](#api)
- [Troubleshooting](#troubleshooting)
- [Git workflow](#git-workflow)
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
| Express app, CORS, JSON parsing, request logging | ✅ Implemented |
| MongoDB connection with startup checks for env vars and database | ✅ Implemented |
| `GET /api/health` (API + database status) | ✅ Implemented |
| Consistent JSON error format, error helpers, validation helpers | ✅ Implemented |
| Backend test setup (`npm test`) with an isolated test database | ✅ Implemented |
| Frontend skeleton (React Router, Tailwind, API client, status page) | ✅ Implemented |
| API contract for all features | 📝 Proposed in [docs/API_CONTRACT.md](docs/API_CONTRACT.md); auth transport decided (Bearer token), agent access policy still open |
| Signup, login, roles, JWT | ⏳ Planned |
| Ticket creation and customer ticket history | ⏳ Planned |
| Agent queue, filters, assignment, status changes | ⏳ Planned |
| Ticket replies (comments) | ⏳ Planned |
| Admin user/category management and ticket statistics | ⏳ Planned |
| Customer, agent and admin screens | ⏳ Planned |
| Seed data and demo accounts | ⏳ Planned |
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
│   │   ├── config/        env.js (loads + checks env vars), db.js (MongoDB connection)
│   │   ├── middleware/    errorHandler.js (404 + consistent JSON errors)
│   │   ├── routes/        health.routes.js
│   │   ├── utils/         ApiError.js (error helpers), validate.js (input validation)
│   │   ├── app.js         Express app: middleware + route mounting
│   │   └── server.js      Entry point: connect DB, then start listening
│   ├── test/
│   │   ├── helpers/db.js  Test database connect/clear/disconnect (refuses non-"_test" DBs)
│   │   ├── setup.js       Forces test environment before any test runs
│   │   └── *.test.js      Test files
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/           client.js (fetch wrapper, error handling)
│   │   ├── components/    Layout.jsx
│   │   ├── pages/         HomePage.jsx (API status check), NotFoundPage.jsx
│   │   ├── App.jsx        Routes
│   │   ├── main.jsx       Entry point
│   │   └── index.css      Tailwind import
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── docs/
│   └── API_CONTRACT.md    Proposed endpoints, request/response shapes, error codes
├── .gitattributes
├── .gitignore
└── README.md
```

New backend code goes in `backend/src/models/`, `controllers/`, `routes/` and `middleware/`. Create a folder when you add its first file.

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

Open http://localhost:5173. The **System status** box should show `API: ok` and `Database: connected`.

## Environment variables

Never commit `.env`. Only the `.env.example` files, which contain dummy values, belong in Git. If you add a variable, add it to the matching `.env.example` in the same pull request.

**backend/.env**

| Variable | Required | Purpose | Example |
| --- | --- | --- | --- |
| `PORT` | No (default 4000) | API port | `4000` |
| `MONGODB_URI` | Yes | MongoDB connection string | `mongodb://127.0.0.1:27017/helpdesk` |
| `JWT_SECRET` | Yes | Secret for signing login tokens | long random string |
| `CLIENT_URL` | Yes | Frontend origin allowed by CORS | `http://localhost:5173` |
| `MONGODB_URI_TEST` | No | Test database for `npm test`. Name must end in `_test`. | `mongodb://127.0.0.1:27017/helpdesk_test` (default) |

The backend exits on startup with a clear message if a required variable is missing or MongoDB is unreachable.

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
| frontend | `npm run dev` | Start the Vite dev server |
| frontend | `npm run build` | Production build into `frontend/dist/` |
| frontend | `npm run preview` | Serve the production build locally |

A seed script will be added with the models.

## Testing

```bash
cd backend
npm test
```

What the tests cover today:

- `test/health.test.js`: `/api/health` with and without a database, CORS, and the JSON 404 for unknown routes
- `test/errors.test.js`: error helpers and the error middleware (ApiError, async errors, 500 without leaking details, bad JSON, oversized body, Mongoose validation/cast/duplicate errors)
- `test/validate.test.js`: validation helpers

**Your development data is safe.** `npm test` always uses `MONGODB_URI_TEST` (default `mongodb://127.0.0.1:27017/helpdesk_test`) and ignores `MONGODB_URI` in your `.env`. The helpers in `test/helpers/db.js` refuse to connect to or clear any database whose name does not end in `_test`.

Most tests do not need MongoDB. Tests that do need it are **skipped** (shown as `# SKIP` with a reason) if MongoDB is not running.

**Writing tests for a new module:**

- Name the file `backend/test/<feature>.test.js`.
- Use `request(app)` from Supertest. `app` is imported from `src/app.js` and does not open a port.
- For database tests, call `connectTestDB()` in `before`, `clearTestDB()` in `beforeEach`, and `disconnectTestDB()` in `after`. See `test/health.test.js` for the pattern.
- Test files run one at a time, so they never clear each other's data.

The frontend has no automated tests yet. Use `npm run build` to check it compiles.

## API

The full proposed API is in **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)**. Build against it, and change it through a pull request when something needs to change.

Implemented today:

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | API and database status. `200` when the database is connected, `503` otherwise |

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

**Decided:** login and register will return a JWT, which the frontend sends as `Authorization: Bearer <token>` on protected requests (contract OPEN-2). Authentication is not implemented yet.

**Still open** (see the contract, Section 1): which tickets agents can access (OPEN-1), plus smaller points such as token lifetime, where the frontend keeps the token, and logout behaviour.

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

## Roadmap

1. Planning and API agreement (**in progress**: contract drafted, auth transport decided, agent access policy open)
2. Project setup: skeletons, DB connection, `.env.example`, `/api/health`, test setup (**done**)
3. Parallel modules: auth, tickets, agent workflow, conversations, admin, UI screens
4. Integration: run the HD-104 scenario end to end in the UI
5. Testing and refinement against the acceptance criteria
6. Deployment and demo
