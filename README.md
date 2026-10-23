# Help Desk — Customer Support Ticket System

WeIntern Minor Project · Project 01 / Team 01 · MERN

A web application where customers raise support tickets, support agents triage, reply to and resolve them, and administrators manage users, categories and ticket volume.

Ticket lifecycle: **Open → In Progress → Resolved**, with a timestamped reply thread and status history on every ticket.

> **Status:** Phase 2 (project setup). The backend and frontend skeletons run, connect to each other and report health. No feature modules are implemented yet.

## Team

| Area | Members |
| --- | --- |
| Backend (Express API, MongoDB) | Tirth Vaghela, Ayushi Rathi, Swati Parija |
| Frontend (React UI) | Mimansa Narendra Patle, Shwetaleena Kundu |

Module-level ownership within each area is agreed in team planning and recorded here once confirmed.

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, Vite, React Router, Tailwind CSS |
| Backend | Node.js, Express 5, Mongoose |
| Database | MongoDB |
| DevOps | Git/GitHub; deployment target to be confirmed with mentor (Render or equivalent) |

## Project structure

```
help-desk/
├── backend/
│   ├── src/
│   │   ├── config/        env.js (loads + checks env vars), db.js (MongoDB connection)
│   │   ├── middleware/    errorHandler.js (404 + consistent JSON errors)
│   │   ├── routes/        health.routes.js
│   │   ├── utils/         ApiError.js
│   │   ├── app.js         Express app: middleware + route mounting
│   │   └── server.js      Entry point: connect DB, then start listening
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
├── .gitignore
└── README.md
```

New code goes in the matching folder: `backend/src/models/`, `backend/src/controllers/` and so on are created with the first file that needs them.

## Prerequisites

- **Node.js** 20.19+ or 22.12+ (check with `node --version`)
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

### Frontend (in a second terminal)

```bash
cd frontend
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm run dev               # http://localhost:5173
```

Open http://localhost:5173. The **System status** box should show `API: ok` and `Database: connected`. If the backend is not running, it shows an error with a **Retry** button.

## Environment variables

Never commit `.env`. Only `.env.example` files (with dummy values) belong in Git.

**backend/.env**

| Variable | Purpose | Example |
| --- | --- | --- |
| `PORT` | API port | `4000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/helpdesk` |
| `JWT_SECRET` | Secret for signing login tokens | long random string |
| `CLIENT_URL` | Frontend origin allowed by CORS | `http://localhost:5173` |

The backend exits on startup with a clear message if a required variable is missing or MongoDB is unreachable.

**frontend/.env**

| Variable | Purpose | Example |
| --- | --- | --- |
| `VITE_API_URL` | Backend base URL | `http://localhost:4000` |

`VITE_` variables are bundled into the browser code, so never put secrets in them.

## Scripts

| Location | Command | What it does |
| --- | --- | --- |
| backend | `npm run dev` | Start API with auto-restart on file changes (`node --watch`) |
| backend | `npm start` | Start API (production) |
| frontend | `npm run dev` | Start Vite dev server |
| frontend | `npm run build` | Production build into `frontend/dist/` |
| frontend | `npm run preview` | Serve the production build locally |

Test and seed scripts will be added with the first feature modules.

## API

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | API and database status. `200` when the DB is connected, `503` otherwise |

All errors use one JSON shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Subject is required" } }
```

Status codes: `400` invalid input, `401` not logged in, `403` not permitted, `404` not found, `409` duplicate, `500` unexpected error (no stack traces are sent to clients). Throw `new ApiError(status, code, message)` from `backend/src/utils/ApiError.js` to produce this response.

The full endpoint list (auth, tickets, comments, admin) is defined in the project brief and will be documented here as each module is implemented.

## Git workflow

- `main` is the stable branch. Do not commit directly to it.
- Create one branch per feature, e.g. `feature/auth`, `feature/tickets`, `feature/agent-queue`, `feature/ui-login`.
- Open a pull request and get one teammate's review before merging.
- Write small, meaningful commit messages, e.g. `Add ticket status validation`.
- Pull `main` before starting new work: `git checkout main && git pull`.

## Roadmap

1. Planning and API agreement
2. **Project setup** (current): skeletons, DB connection, `.env.example`, `/api/health`
3. Parallel modules: auth, tickets, agent workflow, conversations, admin, UI screens
4. Integration: run the HD-104 scenario end to end in the UI
5. Testing and refinement against the acceptance criteria
6. Deployment and demo

## Not yet included

Seed data, demo accounts, automated tests, screenshots and the deployment link will be added in later phases.
