# Help Desk — Frontend Render Test Plan

> **Status update, 31 October 2026.** The P0 tests in this plan are merged at `c756137`. P2-2 moved the account security tests to real React in jsdom, with typing and clicking through `userEvent` (26 tests), and deleted `miniReact.js`. P2-2 is commit `8e56930c5306828d32877b0e5cb0e5bdd718cafe`, merged through PR #15 as `0f351b3017a7e13d512da4f450ed18543789a921`. The frontend suite passes **417 of 417, 83 suites, 0 failed, 0 skipped** on Linux in CI, in PR run `41201715461` and merge run `41202057252`. No real-browser or visual checks have been run.

**How to read this plan.** Text marked **Current** or **Updated** describes the tests as they are now. Text marked **Historical** records what the audit found, and is kept for its reasoning. Suggested tests and cases not marked as covered or done are still proposals.

**Historical: at the time of this audit, no tests had been implemented.** It was an audit and a proposal. No dependency was installed, and no source, test, package or configuration file was changed. The tooling had not been tried in this project, so step 1 of the sequence was a small trial that could have overturned the recommendation.

Audited on **31 October 2026**, against `main` at `85511b4` plus the uncommitted working tree of that date.

## Contents

1. [Summary](#1-summary)
2. [Current testing setup](#2-current-testing-setup)
3. [Existing coverage and its limits](#3-existing-coverage-and-its-limits)
4. [Screen-by-screen coverage](#4-screen-by-screen-coverage)
5. [Recommended tooling](#5-recommended-tooling)
6. [Prioritised test cases](#6-prioritised-test-cases)
7. [Implementation sequence](#7-implementation-sequence)
8. [Changes requiring approval](#8-changes-requiring-approval)
9. [What could not be verified](#9-what-could-not-be-verified)

## 1. Summary

### Current

- **Results:** the 417 frontend tests in 83 suites pass on Linux in CI (runs `41201715461` and `41202057252`). The suite still runs on `node:test`.
- **Tooling adopted:** `jsdom` 29.1.1, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2 and `@testing-library/user-event` 14.6.8.
- **Real DOM coverage added:** P0 added route guards, expired sessions, sign-in and sign-up, `MyTickets`, New Ticket, customer ticket details, `AgentInbox` and the Admin Tickets dialog. P2-2 added `AccountSecurity` on `/profile`. See [section 3](#real-dom-test-files-current).
- **Still without real DOM coverage:** user and category management, reports, password recovery and the public pages. Profile saving, sign-out, notification lists and the overview panels also have no behaviour tests. See [section 4](#4-screen-by-screen-coverage).
- **No browser or end-to-end tests exist.** DOM tests run in jsdom with `fetch` faked, so they do not show layout, appearance or real API responses.
- **Version constraint, still in force:** the latest `jsdom` (30.1.3) requires Node `^22.22.2`, and this machine runs 22.14.0, so `jsdom` stays pinned at 29.1.1, which supports `^22.13.0`.

### At the audit (historical)

- All 235 frontend tests passed, but **none rendered a component into a DOM and used it the way a person would**. Nothing in the repository clicked, typed or followed a loaded screen through its states with real React.
- Across the 42 `.jsx` files outside `main.jsx`, the tests reached four components with real React (`SlaBadge`, `AnalyticsPanels`, `PriorityField`, `ConversationView`), and only as static HTML.
- **The largest risks with no render coverage** were the route guards, sign-in and sign-up, the New Ticket form, customer ticket details, and all of `AgentInbox`, including assignment and reply permissions.
- **Recommendation at the time:** keep the existing runner (`node:test`) and add the four dev dependencies above, with no script, Vite or CI change expected.

## 2. Current testing setup

| Item | Current state |
| --- | --- |
| Test runner | Node's built-in `node:test`. `npm test` runs `node --test test/*.test.js` |
| Test config | No test configuration file. `vite.config.js` holds only the React and Tailwind plugins and the port |
| Loading `.jsx` in tests | Each test file starts an in-process Vite server with no port (`middlewareMode`) and calls `ssrLoadModule` |
| React | `react` and `react-dom` 19.3.1, `react-router` 7.18.4 |
| Build tool | `vite` 8.3.5 |
| Node | 22.14.0 on this machine, 22.23.4 in the last CI run. `package.json` allows `^20.19.0 \|\| >=22.12.0` |
| Installed DOM or test libraries | **Updated:** `jsdom` 29.1.1, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2 and `@testing-library/user-event` 14.6.8. Historical: none at the audit |
| Test helpers | **Updated:** `test/helpers/dom.js`, `renderApp.js` and `fixtures.js`, added by the P0 work. `miniReact.js`, the stand-in for React's hooks at the audit, has been deleted |
| CI | GitHub Actions runs `npm ci`, `npm test` and `npm run build` in `frontend/` |

The app's real structure, from `main.jsx`, is `StrictMode` > `BrowserRouter` > `AuthProvider` > `App`. `App.jsx` wraps protected pages in `CustomerRoute` and `StaffRoute`, which both use `SessionGate`.

## 3. Existing coverage and its limits

### Kinds of test

**Updated:** kinds A to D all existed at the audit. Kinds A to C remain, kind D has been retired, and real DOM tests have been added. Browser tests are still missing.

| Kind | What it proves | What it cannot prove | Where |
| --- | --- | --- | --- |
| **A. Static HTML with real React** (`react-dom/server`) | The component's first render, given props | Effects, data loading, clicks, typing, later states | `SlaBadge`, `AnalyticsPanels`, `PriorityField`, `ConversationView` |
| **B. Function tests with fakes** | Rules, formatting and API calls | That a screen uses them correctly | Most of the suite |
| **C. Source checks** (reading `.jsx` as text) | That certain code is present | That it works. These tests can pass on a broken screen | The "wiring" blocks |
| **D. Stand-in for React** (`miniReact.js`) | Real component code and handlers run in order over time | Real React behaviour and a real DOM. **These were not React render tests** | **Updated: none now.** At the audit, `accountSecurity.test.js`. It has moved to real React in jsdom |
| **Real DOM render with real React** | The user-visible behaviour this plan asks for | Layout, appearance, real browser behaviour and real API responses | **Updated:** the files listed below. Historical: none at the audit |
| **Browser tests** | Real screens end to end | | **None in the repository.** The scripts in `TEST_EVIDENCE.md` §4 are historical, kept outside the repository, and predate P1-1, P2-1 and P2-2 |

### Real DOM test files (current)

Each uses real React in jsdom with only `fetch` faked. None runs in a browser.

| File | What it covers |
| --- | --- |
| `renderTrial.test.js` | The tooling trial: a signed-out visit to `/tickets`, and cleanup between tests |
| `routeGuards.render.test.js` | Signed-out, right-role and wrong-role visits; checking a stored token; a server failure and its retry; one `StrictMode` run |
| `expiredSession.render.test.js` | `401` and `ACCOUNT_DISABLED` while customer screens load and while customers and staff act; errors that must not end the session |
| `signIn.render.test.js` | Customer sign-in, customer sign-up and staff sign-in |
| `customerTickets.render.test.js` | `MyTickets`, including failed counts; customer ticket details and replies |
| `newTicket.render.test.js` | Categories, validation, submitting and refusals on the New Ticket form |
| `agentInbox.render.test.js` | The queue, ticket details, replies, claiming, status and priority |
| `adminTickets.render.test.js` | The ticket list and the real dialog: conversation, replies, priority, assignment, status and resolved tickets |
| `accountSecurity.test.js` | `AccountSecurity` on the real `/profile` page |

### By test file (historical, at the audit)

| File | Tests | What it contains |
| --- | --- | --- |
| `sla.test.js` | 28 | Kind A: 6 for `SlaBadge`. Kind C: 1 (customer screens do not use the badge). The rest are kind B |
| `analytics.test.js` | 35 | Kind A: 8 for `AnalyticsPanels`, passed fixed props. Kind C: 2 (admin-only access). The rest are kind B |
| `accountSecurity.test.js` | 21 | Kind D for all 21 at the audit. **Updated:** now 26 tests with real React in jsdom and `userEvent`: the 21 migrated and 5 new |
| `adminConversation.test.js` | 30 | Kind A for the exported `ConversationView`. Kind B for `submitReply`. Kind C: 6 "wiring". The real `TicketConversation` and dialog never run |
| `adminPriority.test.js` | 29 | Kind A for the exported `PriorityField` and `SlaBadge`. Kind B for `saveTicketChange`. Kind C: 7 "wiring". The real `TicketModal` never runs |
| `newTicketCategories.test.js` | 6 | Kind B and kind C. `NewTicket.jsx` is read as text and never rendered |
| `api.test.js` | 31 | Kind B: API client, `ticketPermissions`, admin API |
| `logic.test.js` | 16 | Kind B: form validation, session storage, display helpers, CSV |
| `queueFilters.test.js` | 13 | Kind B: filter and paging logic |
| `dashboardUrl.test.js` | 10 | Kind B: page selection in the address |
| `account.test.js` | 8 | Kind B: account and notification API, form rules |
| `statusHistory.test.js` | 8 | Kind B: status history display data |
| **Total** | **235** | |

### Limits of the five tests you asked about

| Test | What is genuine | Main gap |
| --- | --- | --- |
| `SlaBadge` | Real React output for fixed tickets. **Updated:** `adminTickets.render` also checks the badge in the real dialog | Agent Inbox's badge has no DOM check, and there are no visual checks |
| `AnalyticsPanels` | Real React output for each state passed as props | `AdminReports`, which supplies those states, is not rendered |
| `AccountSecurity` | **Updated:** the real `/profile` page with real React in jsdom, using `userEvent`, with only `fetch` faked. Passes on Linux in CI | Not run in a browser, and no visual checks. No visible loading indicator exists during a retry: the warning and its button are removed until the answer arrives |
| `AdminTickets` conversation | The extracted view and reply function. **Updated:** `adminTickets.render` runs the conversation in the real dialog | Not run in a browser. `adminConversation.test.js` keeps its text-pattern checks; whether they can retire is step 8 |
| `AdminTickets` priority | The extracted selector and save function. **Updated:** `adminTickets.render` changes priority in the real dialog | Not run in a browser. `adminPriority.test.js` keeps its text-pattern checks; whether they can retire is step 8 |

## 4. Screen-by-screen coverage

**Updated.** Historical: real render was **No for every screen at the audit**. The "Real render" column now shows the current state. Coverage is named by test file; per-screen test counts are not recorded here. **No row includes browser or end-to-end testing,** because none exists.

| Value | Meaning |
| --- | --- |
| **DOM, interaction** | Real React in jsdom, with the test driving this screen's controls |
| **DOM, display** | Real React in jsdom, with the test checking what appears or where the page goes, not driving this screen's own controls |
| **Indirect** | Mounted as part of another screen, or reached by a narrow check. Its own behaviour is not tested |
| **Static** | Kind A HTML reaches part of the screen |
| **Unverified** | A test opens the page that may show it, but no test checks it, so its coverage is not claimed |
| **No** | No real render |

Your list assumed a few separate screens that do not exist as such:

- The customer dashboard is `MyTickets`.
- Agent details, conversation, reply, assignment and status are all inside `AgentInbox`, not separate components.
- Admin ticket details are `TicketModal`, a private component inside `AdminTickets.jsx`, so they can be tested only through `AdminTickets`.

### Sessions and route guards

| Component | Existing coverage | Real render | Missing states | Suggested tests |
| --- | --- | --- | --- | --- |
| `frontend/src/auth/AuthProvider.jsx` | **Updated:** `routeGuards`, `expiredSession`, `signIn` and `accountSecurity`; kind B for `session.js` and late-answer rules | DOM, interaction | Browser checks only | Covered: first load, unavailable server, rejected stored token, `401` signing out with a notice |
| `frontend/src/auth/SessionGate.jsx` | **Updated:** `routeGuards` | DOM, interaction | Browser checks only | Covered: holding screen, server failure, no connection, a retry that works |
| `frontend/src/auth/CustomerRoute.jsx` | **Updated:** `routeGuards`; `signIn` for the return afterwards | DOM, display | Browser checks only | Covered: signed out goes to `/login` and returns afterwards; staff go to their dashboard |
| `frontend/src/auth/StaffRoute.jsx` | **Updated:** `routeGuards` | DOM, display | Browser checks only | Covered: signed out, wrong role and right role, including a customer and an agent kept out of admin screens |

### Customer

| Screen and component | Existing coverage | Real render | Missing states | Suggested tests |
| --- | --- | --- | --- | --- |
| Login: `frontend/src/pages/customer/CustomerLogin.jsx` | **Updated:** `signIn`; `routeGuards` for the session notice; kind B for the validators and messages | DOM, interaction | Browser checks only | Covered: errors linked to their fields; failures; a staff account told to use staff sign-in; success returning to the original page |
| Signup: `frontend/src/pages/customer/CustomerSignup.jsx` | **Updated:** `signIn`; kind B for the validators | DOM, interaction | Rate limit | Covered: validation blocks the request; a taken email shows its message; success lands on `/tickets`. Still proposed: the rate-limit message |
| Dashboard and history: `frontend/src/pages/customer/MyTickets.jsx` | **Updated:** `customerTickets`; the API call in kind B | DOM, interaction | "Created" notice, not verified | Covered: loading, empty, filters, a failed load, paging, failed counts. See the finding after RT-17 |
| Create ticket: `frontend/src/pages/customer/NewTicket.jsx` | **Updated:** `newTicket`, and `expiredSession` for a `401`; kind B and kind C remain | DOM, interaction | Browser checks only | Covered: see RT-4 |
| Details and reply: `frontend/src/pages/customer/TicketDetail.jsx` | **Updated:** `customerTickets`, and `expiredSession` for a `401` | DOM, interaction | Browser checks only | Covered: see RT-5 |
| Profile: `frontend/src/pages/customer/Profile.jsx` | **Updated:** the page opens for `accountSecurity`; its own form is not tested | Indirect | Validation, save, save failure, expired session | Name change updates the page; failure keeps the typed name |
| Account security: `frontend/src/components/account/AccountSecurity.jsx` | **Updated:** 26 tests in `accountSecurity`, with real React in jsdom and `userEvent`, on `/profile`. Passes on Linux in CI | DOM, interaction | Real-browser and visual checks. A visible retry loading indicator does not exist | Failure paths on the staff account page |
| Forgot password: `frontend/src/pages/account/ForgotPassword.jsx` | Kind B for the API call | No | Invalid email, success, failure, try again | The same message for any address; invalid email blocks the request |
| Reset password: `frontend/src/pages/account/ResetPassword.jsx` | Kind B for the API call and token parsing | No | Checking, expired link, failed check, success | An expired link hides the form |
| Confirm email: `frontend/src/pages/account/VerifyEmail.jsx` | Kind B for the API call | No | Working, success, failure, missing token | Each outcome shows its message |
| Layout: `frontend/src/components/customer/CustomerLayout.jsx` | **Updated:** mounted around the customer screens; no test checks it directly | Indirect | Sign out | Sign out returns to a signed-out page |

### Agent

| Screen and component | Existing coverage | Real render | Missing states | Suggested tests |
| --- | --- | --- | --- | --- |
| Staff login: `frontend/src/pages/StaffLogin.jsx` | **Updated:** `signIn`; kind B for shared helpers | DOM, interaction | Deactivated account | Covered: a customer is refused; agent and admin reach their own dashboards; wrong details; a second click. Still proposed: the deactivated message |
| Dashboard: `frontend/src/pages/agent/AgentDashboard.jsx` | **Updated:** opened by `routeGuards` and `agentInbox`; kind B for `dashboardUrl` | DOM, display | Pages other than the inbox | Covered for the inbox: `?page=Inbox` and `?ticket=`. Still proposed: each other page opens from its address |
| Overview: `frontend/src/components/agent/AgentOverview.jsx` | None for its behaviour | Unverified | Three panels' loading, empty and error states; claim failure | A claim moves the ticket; one failed panel does not blank the others |
| Queue, search and filters: `frontend/src/components/agent/AgentInbox.jsx` | **Updated:** `agentInbox`; kind B for `queueFilters` | DOM, interaction | Paging; a filter returning to page 1 | Covered: loading, empty, failed load and retry, status filter, search waiting for typing to stop. Still proposed: paging |
| Details and conversation: `AgentInbox.jsx` | **Updated:** `agentInbox`; kind B for `statusHistory` and `ticketPermissions` | DOM, interaction | SLA details, not verified | Covered: detail loading and failure, conversation, history, choosing another ticket |
| Reply form: `AgentInbox.jsx` | **Updated:** `agentInbox` and `expiredSession`; kind B for `ticketPermissions` | DOM, interaction | Browser checks only | Covered: see RT-6 |
| Assignment and status: `AgentInbox.jsx` | **Updated:** `agentInbox` and `expiredSession`; kind B for `ticketPermissions` | DOM, interaction | Browser checks only | Covered: see RT-6 |
| Staff account: `frontend/src/pages/StaffAccount.jsx` | **Updated:** `routeGuards` checks that the page mounts for each staff role | DOM, display | Page frame and links; account security failure paths | Reaches the right dashboard link for each role |

### Admin

| Screen and component | Existing coverage | Real render | Missing states | Suggested tests |
| --- | --- | --- | --- | --- |
| Dashboard: `frontend/src/pages/admin/AdminDashboard.jsx` | **Updated:** opened by `routeGuards` and `adminTickets`; kind B for `dashboardUrl` | DOM, display | Pages other than Tickets | Covered for tickets: `?page=Tickets` and `?ticket=`. Still proposed: each other page opens from its address |
| Overview: `frontend/src/components/admin/AdminOverview.jsx` | None for its behaviour | Unverified | Loading, error and retry, no tickets, no assignees | Figures come from the API answer; failure offers a retry |
| Analytics: `frontend/src/components/admin/AdminReports.jsx` | Kind C and kind B around it | No | Range changes, custom-date errors, export, export failure | Changing the range sends one request; an invalid date sends none |
| Analytics panels: `frontend/src/components/admin/AnalyticsPanels.jsx` | **Static**, 8 tests | No | Interaction, via `AdminReports` only | Retry button calls back |
| Ticket list and filters: `frontend/src/components/admin/AdminTickets.jsx` | **Updated:** `adminTickets`; kind B for `queueFilters`; kind C for filter wiring | DOM, interaction | Paging; summary failure, not verified | Covered: loading, empty, failed load and retry, a filter, Manage opening the dialog. Still proposed: paging |
| Conversation and replies: `TicketConversation` and `ConversationView` in `AdminTickets.jsx` | **Updated:** `adminTickets` and `expiredSession`; static, kind B and kind C remain | DOM, interaction | Browser checks only | Covered: see RT-7 |
| Priority changes: `TicketModal` and `PriorityField` in `AdminTickets.jsx` | **Updated:** `adminTickets` and `expiredSession`; static, kind B and kind C remain | DOM, interaction | Browser checks only | Covered: see RT-7 |
| User management: `frontend/src/components/admin/AdminUsers.jsx` | Kind B for the admin API | No | List states, own account locked, `409` last admin, saving | Own account's controls are disabled with the reason; a failed save shows its message |
| Category management: `frontend/src/components/admin/AdminCategories.jsx` | Kind B for the admin API | No | Loading, empty, add errors, rename, deactivate, `409` duplicate | Duplicate name shows its error; deactivating updates the row |

### Shared and public

| Screen and component | Existing coverage | Real render | Missing states | Suggested tests |
| --- | --- | --- | --- | --- |
| Notifications: `frontend/src/components/common/NotificationBell.jsx` | **Updated:** `expiredSession` checks that a `401` on the unread count ends the session; kind B for the API and links | Indirect | Empty, error and retry, unread display, ticket links per role | Opening marks and links correctly; a failed load offers a retry |
| Staff header: `frontend/src/components/common/helpdeskheader.jsx` | **Updated:** mounted around the staff screens; no test checks it directly | Indirect | Sign out, navigation | Sign out ends the session |
| SLA badge: `frontend/src/components/staff/SlaBadge.jsx` | **Static**, 6 tests. **Updated:** `adminTickets` checks it in the real dialog | DOM, display | Agent Inbox's badge | Covered in the admin dialog. Still proposed: the badge in Agent Inbox |
| Status history: `frontend/src/components/staff/StatusHistory.jsx` | **Updated:** the `agentInbox` details test includes the history; kind B for its data | DOM, display | The admin dialog's history, not verified | Covered in Agent Inbox |
| Landing: `frontend/src/pages/HomePage.jsx` | None | No | Signed-in links | One smoke test only, as the risk is low |
| Not found: `frontend/src/pages/NotFoundPage.jsx` | None | No | Unknown address | Covered by a route test |

## 5. Recommended tooling

**Updated: adopted.** The tooling below is installed and in use. This section keeps the reasoning from the audit, so "Existing tests stay unchanged" describes that proposal: `accountSecurity.test.js` has since moved to real React in jsdom, in P2-2.

### Recommendation: `node:test`, `jsdom` and React Testing Library

| Option | Verdict | Reasons |
| --- | --- | --- |
| `node:test` + `jsdom` + Testing Library | **Recommended** | Smallest change: no new runner, script or CI step. The in-process Vite loading already exists. New files named `*.test.js` are picked up automatically |
| Vitest + `jsdom` + Testing Library | Fallback if the trial fails | Works with Vite 8 and handles DOM setup itself, but adds a second runner, command and CI step. Its Node range also leaves out the 20.x versions `package.json` allows |
| `happy-dom` instead of `jsdom` | Second fallback | Installs on any Node 20 or later, but `jsdom` is the more common choice with Testing Library, so it is the lower-risk first try |
| `msw` for API mocking | Not needed | The fake `fetch` pattern already exists and has no extra dependency |
| `@testing-library/jest-dom` | Not needed | `node:assert` can check Testing Library results directly |
| Browser tests (Playwright or similar) | Separate decision | Valuable, but far larger. They would need running servers, which this plan avoids |

### Dependencies

| Package | Version | Why | Compatibility, from registry data only |
| --- | --- | --- | --- |
| `jsdom` | **29.1.1, pinned** | The DOM | Node `^20.19.0 \|\| ^22.13.0 \|\| >=24.0.0`. **Do not use 30.x**, which needs Node `^22.22.2` |
| `@testing-library/react` | 16.3.3 | Renders with real React | Peer `react` and `react-dom` `^18 \|\| ^19` |
| `@testing-library/dom` | 10.4.2 | Required peer of the above | Node 18 or later |
| `@testing-library/user-event` | 14.6.8 | Real typing and clicking | Works with `@testing-library/dom` |

### Configuration

| Item | Change |
| --- | --- |
| `frontend/package.json`, `frontend/package-lock.json` | Four dev dependencies |
| `vite.config.js`, `npm test` script, `ci.yml` | **None expected** |
| New file `frontend/test/helpers/dom.js` | Creates the DOM before React loads |
| New file `frontend/test/helpers/renderApp.js` | Renders the app and fakes the API |
| Existing tests | **Stay unchanged** |

Points the helpers must handle:

- **DOM first:** `jsdom` globals must exist before `react-dom` or Testing Library load. Use `url: 'http://localhost/'` so `sessionStorage` works, and `pretendToBeVisual: true`, because `NotificationBell` skips its refresh unless `document.visibilityState` is `visible`.
- **No global hooks in `node:test`:** Testing Library cannot register its automatic cleanup, so call `cleanup()` in `afterEach`, and set `IS_REACT_ACT_ENVIRONMENT`.
- **Gaps in `jsdom`:** stub `URL.createObjectURL` and the download click for the CSV export. Do not test `window.location.reload()` in `ResetPassword`; check that the retry is offered.
- **Environment file:** Vite loads `.env` files from its root by default. Point the test server elsewhere so tests never depend on a developer's `frontend/.env`.
- **Timing:** the 300 ms search debounce works with Testing Library's `findBy*` waits. Use fixed dates, as `sla.test.js` does.
- **`StrictMode`:** it runs effects twice in development, so tests counting requests must decide with or without it. Render without it by default for exact counts, and use it in one smoke test.

### Faking the API, sign-in and roles

- **Render the real app.** Use `MemoryRouter` > `AuthProvider` > `App`, starting at a given address, so guards and redirects are really tested. Avoid replacing `useAuth`.
- **Sign in by data, not by mocks.** Put a test token in `sessionStorage` and let the fake `fetch` answer `GET /api/auth/me` with a customer, agent or admin. Each role then goes through the real session code.
- **Fake only `fetch`.** Use a route table, as in `accountSecurity.test.js`. **Any request with no matching route fails the test**, so a typo cannot quietly hit the network.
- **Expired sessions.** Answer one request with `401`, then check that the page goes to sign-in with the notice.
- **Slow answers.** Return a promise the test resolves later, to check loading and double-submit states.

This keeps tests free of MongoDB, SMTP, external services and running servers: nothing listens on a port, and every request is answered in-process.

### Writing the tests

Find elements by role, label and visible text, and assert what a person sees or the request that was sent. Avoid CSS classes, internal state and component names. Some screens may need better labels to be found this way, which would itself be a useful finding. Report those rather than changing source during the test work, unless approved.

## 6. Prioritised test cases

Each case is a user-visible behaviour. P0 cases cover access and data creation, P1 cases cover daily work and failure states, and P2 cases cover the rest.

### P0 — Access and creating data

Status is read from the test titles and the code they exercise, as jsdom coverage. "Done" never includes a real browser.

| ID | Area | Cases | Status |
| --- | --- | --- | --- |
| RT-1 | Protected screens | Signed out at `/tickets` goes to sign-in and returns after signing in. Customer at `/agent/dashboard` and `/admin/dashboard` is sent away. Agent at `/admin/dashboard` is sent away. Server unavailable shows the holding screen with retry, and the token is kept | **Done:** `routeGuards`, `signIn` |
| RT-2 | Expired session | A stored token rejected with `401` goes to sign-in with the notice, and the token is cleared. A `401` during an action on `NewTicket`, `TicketDetail`, `AgentInbox` and `AdminTickets` signs out. Deactivated (`403 ACCOUNT_DISABLED`) shows the deactivated notice. A `403 FORBIDDEN` does **not** sign out | **Done:** `routeGuards`, `expiredSession` |
| RT-3 | Sign-in and sign-up | Empty and invalid fields show errors and send nothing. Wrong password shows the generic message. Staff at customer sign-in are refused with a link to staff sign-in, and customers at staff sign-in are refused with an explanation. Signup with a taken email. A second submit sends one request | **Done:** `signIn` |
| RT-4 | Create ticket | Categories loading, failed with retry, and none available each disable the form. Invalid fields show linked errors and send nothing. Success opens the ticket with its "created" notice. A retry after failure reuses the `Idempotency-Key`. A deactivated category clears the choice, shows the field error and reloads the list | **Done:** `newTicket` |
| RT-5 | Customer ticket access | Details and conversation load. `403` and `404` show a message with **no** retry; a server error offers retry. No due date is shown to customers. A reply is added to the thread. Empty, too-long and failed replies. The resolved note appears and replying stays available | **Done:** `customerTickets` |
| RT-6 | Agent permissions | Unassigned ticket: reply disabled with "Assign this ticket to yourself to reply", and claiming enables it. Own ticket: status moves one step only. In-progress ticket cannot be released. Resolved ticket: controls locked with the hint. Failed action shows its message and keeps the saved values. `409` shows the conflict | **Done:** `agentInbox` |
| RT-7 | Admin priority and conversation | **Replaces the kind C wiring checks.** Opening a ticket shows the selector and conversation. Changing priority sends `{ priority }` once, updates the SLA details from the answer and shows the notice. Failure restores the saved value. Resolved ticket disables the selector with the reason. Reply sends, refreshes and clears. A failed reply keeps the text | **Done:** `adminTickets`. The kind C checks have not been removed (step 8) |

### P1 — Daily work and failure states

| ID | Area | Cases | Status |
| --- | --- | --- | --- |
| RT-8 | Queues | `MyTickets`, `AgentInbox` and `AdminTickets`: loading, empty, filtered-empty, error and retry, paging. Changing a filter returns to page 1. Search sends one request after the debounce | **Partly done.** `MyTickets` is covered, including paging and a filter returning to page 1. `AgentInbox` and `AdminTickets` have the list states, but no paging or return-to-page-1 tests |
| RT-9 | Account security | The main flows in a real DOM: password change refreshes the email status once, a failed refresh keeps the banner with its warning and "Try again", and a failed change sends no refresh | **Done and merged:** `accountSecurity`, P2-2, PR #15. Passes on Linux in CI |
| RT-10 | User management | Own account locked with the reason. Role and status changes. `409 LAST_ACTIVE_ADMIN`. List loading, empty and failed | Not started |
| RT-11 | Category management | Add, rename, deactivate and reactivate. Duplicate name. Add validation. Empty list message | Not started |
| RT-12 | Staff dashboards | `?page=` and `?ticket=` open the right view. Agent overview panels fail independently. Claiming from the overview | **Partly done.** `?page=` and `?ticket=` are covered for the agent inbox and admin tickets. The overview cases have not started |
| RT-13 | Reports | Range change sends one request. Invalid custom dates send none. Loading, failed and retry through the real `AdminReports`. CSV export success and failure | Not started |
| RT-14 | Password recovery | Forgot password gives the same message for any address. An expired reset link hides the form. A successful reset explains that the user was signed out. Email confirmation outcomes | Not started |

### P2 — Lower risk

| ID | Area | Cases | Status |
| --- | --- | --- | --- |
| RT-15 | Notifications | Unread count, list states, retry, links per role, tickets the user can no longer open | Not started. Only a `401` on the unread count is checked (`expiredSession`) |
| RT-16 | Profile and layouts | Profile save and failure. Sign out from the customer layout and staff header | Not started |
| RT-17 | Public pages | Landing page smoke test. Unknown address shows the not-found page | Not started |

**Finding, confirmed and fixed:** in `MyTickets`, a failed count request removed the filter buttons without showing an error. The audit found this by reading the code; it was then confirmed and fixed, and the fix is merged. `customerTickets.render.test.js` covers it under "MyTickets: when only the counts fail": the tickets stay, an error is shown with a working retry, and no false zero appears.

## 7. Implementation sequence

Each step runs the full frontend suite and the build, and stops for review.

| Step | Work | Finish line | Status |
| --- | --- | --- | --- |
| 0 | Approve section 8 | Written approval | Done |
| 1 | **Trial:** install the four packages, add `dom.js`, and render the real `App` for RT-1's signed-out case | Passes on Node 22.14 and in CI. **If not, stop and report,** and consider the Vitest fallback | Done |
| 2 | Add `renderApp.js`: address, role, route table, unmatched-request failure | One customer and one staff screen render with no port opened | Done |
| 3 | RT-1 and RT-2 | Guards and expired sessions covered | Done |
| 4 | RT-3, RT-4, RT-5 | Customer paths covered | Done |
| 5 | RT-6, RT-7 | Staff permissions and the real admin dialog covered | Done |
| 6 | RT-8 to RT-14 | One group at a time, as approved | RT-9 done; RT-8 and RT-12 partly done; RT-10, RT-11, RT-13 and RT-14 not started |
| 7 | RT-15 to RT-17 | Optional | Not started |
| 8 | Review overlaps | Kind D has retired. Propose separately whether any kind C tests can retire now that real tests cover them. Remove nothing without approval | Kind D done; kind C review not started |
| 9 | Update `TEST_EVIDENCE.md` and the README | Only with results that actually ran | Done. The Group B documentation updates, including `TEST_EVIDENCE.md` and `README.md`, are committed in `docs: finalize help desk project documentation`, on top of the merged P2-3 work (PR #16, `cbaf2fd`). The README names jsdom and Testing Library, separates unit tests, real React DOM tests and the absence of browser, visual and end-to-end tests, and lists this plan and the decision register in its documentation tree |

A defect found along the way is reported rather than fixed in the same change, unless approved.

## 8. Changes requiring approval

**Historical.** This is what was put forward for approval at the audit. The dependencies, helpers and P0 test files are now in place, with `jsdom` pinned at 29.1.1. Going beyond the work already done still needs its own approval.

| Item | Detail |
| --- | --- |
| New dev dependencies | `jsdom@29.1.1`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/user-event@14.6.8` |
| Files changed by installing | `frontend/package.json`, `frontend/package-lock.json` |
| New test files | `frontend/test/helpers/dom.js`, `frontend/test/helpers/renderApp.js`, and `frontend/test/*.render.test.js` |
| Not touched | Application source, existing tests, `vite.config.js`, `.github/workflows/ci.yml`, backend |
| Decision on scope | Whether to stop after the P0 cases or continue to P1 and P2 |
| Decision on versions | Pinning `jsdom` to 29.x now, or upgrading Node locally to 22.22.2 or later so 30.x can be used |

## 9. What could not be verified

| Item | Why |
| --- | --- |
| That the recommended tools work together here | **Updated: resolved.** Historical: nothing was installed at the audit. The tools now run the 417 tests on Linux in CI |
| Testing Library's `node:test` behaviour | **Updated: resolved** by the same runs. Historical: cleanup and `act` setup were based on how the library is designed, not on a run in this project |
| CSS modules through the test server | **Updated: partly resolved.** `App.jsx` imports `HomePage` directly, and the render tests load `App`, so the module loads. `HomePage` itself is not rendered by any test (RT-17) |
| Whether screens can be found by role and label | **Updated:** the screens with DOM tests can be found this way. Other screens, such as `AdminUsers` and `AdminCategories`, have not been tried |
| Cases listed under "Missing states" | They come from reading the components and test titles, not from running them |
| Coverage marked "not verified" or **Unverified** in section 4 | No test checks it directly. These rows make no coverage claim |
| Real-browser behaviour and appearance | No browser or end-to-end test exists |
