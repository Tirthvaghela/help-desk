# Help Desk — Decision Register

This register lists the product and policy questions the team still has to settle. For each one it records what the software does today, what the project documents say, the realistic choices, and who should decide.

**No decision is approved without explicit evidence.** Being implemented, tested or documented does not make something approved. Recommendations here are technical suggestions from an audit, not decisions, and nothing in this register has been implemented or changed because of it, apart from the documentation corrections marked resolved in §7.

Audited on **31 October 2026**, against `main` at `85511b4` plus the uncommitted working tree of that date. Current behaviour was checked by reading the code, not by running a browser or a deployed system.

## Contents

1. [Summary](#1-summary)
2. [Approval status and evidence](#2-approval-status-and-evidence)
3. [Unresolved decisions at a glance](#3-unresolved-decisions-at-a-glance)
4. [Decision details](#4-decision-details)
5. [Defaults without approval evidence](#5-defaults-without-approval-evidence)
6. [Technical defects](#6-technical-defects)
7. [Documentation inconsistencies](#7-documentation-inconsistencies)
8. [What could not be verified](#8-what-could-not-be-verified)
9. [How to record an approval](#9-how-to-record-an-approval)

## 1. Summary

| Group | Count | Where |
| --- | --- | --- |
| Recorded as decided, with no independent confirmation | 2 (OPEN-1, OPEN-2) | §2 |
| Approved with independent evidence | **0** | §2 |
| Unresolved product and policy decisions | 32 entries | §3, §4 |
| Engineering defaults waiting for approval | 11 (D-1 to D-11) | §5 |
| Technical defects and clean-up items | 3 | §6 |
| Documentation inconsistencies | 14 (2 resolved: DOC-1, DOC-13) | §7 |

**Identifiers.** Existing IDs are kept: `OPEN-n` and `C-n` and `D-n` from the [API contract](API_CONTRACT.md), `Q-n` and `A-n` from the [data model](DATA_MODEL.md). New items use `R-n` (decisions), `TD-n` (technical defects) and `DOC-n` (documentation). In this register `D-n` always means the contract's engineering defaults, not the separate discrepancy numbers in §9 of the data model.

**Status words.**

| Status | Meaning |
| --- | --- |
| Open | No decision recorded. "Not recorded" means the question appears in no earlier project document. |
| Proposed | A suggestion is written down, but nobody has agreed to it. |
| Default | An engineering default chosen so work could continue. Not a team approval. |
| Approved | Only with explicit evidence. See §2. |

## 2. Approval status and evidence

| Source searched | What was found |
| --- | --- |
| GitHub pull requests | 12 pull requests, with **0 reviews** and **0 comments** recorded on any of them. The README asks for one teammate's review before merging. |
| GitHub issues | None |
| Commit history | Decision text in `docs/API_CONTRACT.md` was committed by Tirth Vaghela. No commit by another member records a confirmation. |
| Project documents | Two statements that name a person who confirmed a decision (below). |

| ID | Decision | Current behaviour | Evidence | Assessment |
| --- | --- | --- | --- | --- |
| OPEN-1 | An agent can access unassigned tickets and tickets assigned to that agent | Implemented in `ticketAccess.js` | Contract: "Confirmed by Ayushi", 2026-10-25 | **Recorded as decided.** The record was committed by Tirth. No message or review from Ayushi was found |
| OPEN-2 | The sign-in token is a JWT sent as `Authorization: Bearer` | Implemented in `middleware/auth.js` | Contract: "Confirmed by Swati", 2026-10-24 | **Recorded as decided.** The record was committed by Tirth. No message or review from Swatismita was found |

Approvals given in meetings or chat would not appear in these sources. If they exist, the team should add them as described in §9.

Items marked **Confirmed** in `docs/DATA_MODEL.md` come from handbook requirements in the project brief. They are requirements, not team decisions, so they are not listed here. The brief is kept outside this repository (§8).

## 3. Unresolved decisions at a glance

"Needed" is the audit's suggestion of timing, not a team decision.

| ID | Decision | Status | Approval owner | Needed |
| --- | --- | --- | --- | --- |
| C-3 | How long should a sign-in last? | Open | Swatismita | Before deployment |
| C-6 | Where should the browser keep the sign-in token? | Open | Swatismita | Before deployment |
| C-7 | Should signing out also cancel the token on the server? | Open | Swatismita | Before deployment |
| R-1 | Should new accounts confirm their email address? | Open, not recorded | Swatismita | Before deployment |
| R-2 | How strict should passwords and failed sign-ins be? | Open, not recorded | Swatismita | Before deployment |
| R-3 | Should an email change sign out other devices? | Open, not recorded | Swatismita | Before deployment |
| R-4 | What should happen to open sessions when a role changes? | Open, not recorded | Tirth Vaghela, Swatismita | Before deployment |
| R-5 | Are the reset and email-change link rules right? | Open, not recorded | Swatismita | Before deployment |
| R-6 | Should ticket creation and replies be rate limited? | Open, not recorded | Swatismita, Ayushi Rathi | Before deployment |
| R-7 | Are the ticket and reply limits right? | Proposed | Swatismita, Ayushi Rathi | Can wait |
| R-8 | How should the API trust the host's proxy? | Proposed | Tirth Vaghela | Before deployment |
| R-9 | Will the API run as one process or several? | Open | Tirth Vaghela | Before deployment |
| R-10 | Which host, production database and email provider? | Open | Tirth Vaghela | Before deployment |
| R-11 | Can a resolved ticket be reopened? | Default, also listed as a product decision | Ayushi Rathi | Can wait |
| R-12 | What can customers do with their own tickets? | Open, not recorded | Swatismita, Ayushi Rathi | Can wait |
| R-13 | Should customers see staff names? | Open, not recorded | Owner confirmation needed | Can wait |
| R-14 | Should staff have internal notes? | Open | Ayushi Rathi | Can wait |
| R-15 | Are the SLA targets and their visibility right? | Open, not recorded | Owner confirmation needed | Can wait |
| Q-3 | What number should tickets start from? | Open | Swatismita | Before deployment |
| Q-4 | Is status history enough, or is a full audit trail needed? | Open | Ayushi Rathi, Swatismita | Can wait |
| Q-6 | What happens to tickets of a deactivated or demoted agent? | Open | Ayushi Rathi, Tirth Vaghela | Before deployment |
| A-6 | Should agents lose access once a ticket goes to someone else? | Open, reviewer to confirm | Ayushi Rathi | Can wait |
| R-16 | Which events notify users, and through which channel? | Open | Tirth Vaghela | Can wait |
| R-17 | How reliable must email delivery be? | Open, not recorded | Tirth Vaghela, Swatismita | Before deployment |
| R-18 | How long are notifications kept? | Open, not recorded | Tirth Vaghela | Can wait |
| R-19 | What is the right limit for CSV exports? | Open, not recorded | Tirth Vaghela | Can wait |
| R-20 | What should admins be able to edit in a category? | Open, not recorded | Tirth Vaghela, Shwetaleena Kundu | Can wait |
| R-21 | How long is stored data kept? | Open, not recorded | Tirth Vaghela | Before deployment |
| R-22 | What personal data may server logs contain? | Open | Tirth Vaghela | Before deployment |
| Q-7 | Can users, tickets, categories or comments be deleted? | Open | Owner confirmation needed | Before deployment |
| R-23 | Do the owners accept the field rules labelled Proposed? | Proposed | Swatismita, Ayushi Rathi | Can wait |
| Q-9, Q-10 | Do the owners accept two smaller model proposals? | Proposed | Swatismita | Can wait |

## 4. Decision details

### Accounts and sessions

#### C-3 — How long should a sign-in last?

- **Current behaviour:** Tokens last 1 day by default (`JWT_EXPIRES_IN`). There are no refresh tokens.
- **Status:** Open. The contract's proposal is what runs today.
- **Options and trade-offs:** Keep 1 day: simple, but users sign in again daily. Shorter: safer if a token leaks, more sign-ins. Refresh tokens: smoother, but more code and server state.
- **Recommendation (not a decision):** None. The value can change without a code change, so this is a policy choice.
- **Approval owner:** Swatismita (JWT).
- **Implementation impact:** Environment setting and README. Refresh tokens would need new API routes, frontend session code and tests.

#### C-6 — Where should the browser keep the sign-in token?

- **Current behaviour:** `sessionStorage`. A session survives a reload and ends when the tab closes.
- **Status:** Open. The contract's proposal is what runs today.
- **Options and trade-offs:** `sessionStorage`: no sign-in across tabs, cleared on close. `localStorage`: stays signed in, but a stolen token lasts longer. Memory only: lost on reload. A cookie would reverse OPEN-2.
- **Recommendation (not a decision):** None.
- **Approval owner:** Swatismita (authentication). Mimansa Narendra Patle and Shwetaleena Kundu should be consulted, as their screens share the session.
- **Implementation impact:** `frontend/src/auth/session.js` and its tests, contract, README.

#### C-7 — Should signing out also cancel the token on the server?

- **Current behaviour:** Signing out discards the token in the browser, so a copied token works until it expires. A password change or reset signs out every device, and deactivation blocks tokens at once. No route ends a single session.
- **Status:** Open.
- **Options and trade-offs:** Keep it: no extra server state, small risk from copied tokens. Add a sign-out route that ends all sessions: simple, uses the existing token version, but signs out other devices too. Track each session: most precise, needs a new collection.
- **Recommendation (not a decision):** None.
- **Approval owner:** Swatismita.
- **Implementation impact:** Auth routes, possibly a new model, `AuthProvider.jsx`, tests, contract.

#### R-1 — Should new accounts confirm their email address?

- **Current behaviour:** Sign-up creates an active customer and signs them in immediately. `User` has no "verified" field. Only email **changes** are confirmed by link. Sign-up reports `409 EMAIL_TAKEN` for a registered address, although forgot-password hides whether an account exists.
- **Status:** Open, not recorded.
- **Options and trade-offs:** No verification: easiest to demo and use, but allows fake or mistyped addresses, so status emails may reach the wrong person. Verify before first use: most reliable, needs a working email provider. Verify later and limit access until then: friendlier, more rules to build.
- **Recommendation (not a decision):** Decide together with R-10, because verification depends on an email provider.
- **Approval owner:** Swatismita. Mimansa Narendra Patle should be consulted on the sign-up screens.
- **Implementation impact:** `User` model, auth controller, `AuthToken` purposes, sign-up and sign-in screens, tests, contract, data model.

#### R-2 — How strict should passwords and failed sign-ins be?

- **Current behaviour:** New passwords need at least 8 characters and at most 72 bytes, with no complexity rule. Sign-in is limited per client IP (default 20 per 15 minutes). No individual account is ever locked.
- **Status:** Open, not recorded. The sign-in limit is part of default D-9.
- **Options and trade-offs:** Keep it: simple and no lockouts. Per-account limits: stop guessing across many addresses, but an attacker could lock someone out. Stronger password rules: harder to guess, more friction.
- **Recommendation (not a decision):** Decide after R-8, because IP limits are shared between all users behind a proxy until that is settled.
- **Approval owner:** Swatismita.
- **Implementation impact:** `utils/password.js`, rate limiter, frontend validation, tests, contract.

#### R-3 — Should an email change sign out other devices?

- **Current behaviour:** Confirming a new address cancels open reset links and notifies the old address. Other signed-in sessions continue. A password change, by contrast, signs out every device.
- **Status:** Open, not recorded.
- **Options and trade-offs:** Keep it: less disruption. Sign out everywhere: matches password changes and removes anyone who should not be there, but also signs out the user's other devices.
- **Recommendation (not a decision):** None.
- **Approval owner:** Swatismita.
- **Implementation impact:** `verifyEmailChange`, `VerifyEmail.jsx`, tests, contract §6a.

#### R-4 — What should happen to open sessions when a role changes?

- **Current behaviour:** The API reads the role from the database on each request, so a change takes effect immediately and the token stays valid. From the code, an open browser tab keeps its old role and screens until it reloads, and refused actions show a `403` error without ending the session. This was not tested in a browser.
- **Status:** Open, not recorded. Contract §6 records the server behaviour only.
- **Options and trade-offs:** Keep it: secure on the server, but the demoted user sees confusing errors. End the session: clear, and the user signs in again with the new role. Refresh the role when a `403` arrives: smoother, but more frontend logic.
- **Recommendation (not a decision):** None. Access is already refused correctly, so this concerns the user's experience.
- **Approval owner:** Tirth Vaghela (admin management operations) and Swatismita (role-based middleware). Shwetaleena Kundu should be consulted on the staff screens.
- **Implementation impact:** `adminUser.controller.js`, `AuthProvider.jsx`, route guards, tests, contract §11.

#### R-5 — Are the reset and email-change link rules right?

- **Current behaviour:** Reset links last 30 minutes and email-change links 24 hours, both configurable and single use. A new link replaces the previous one. At most one reset email is sent per account per minute. A reset does not sign the user in. These routes allow 5 requests per 15 minutes per client IP.
- **Status:** Open, not recorded. The rules are documented in contract §6a as implemented, with no approval recorded.
- **Options and trade-offs:** Keep them: already implemented and tested. Shorter links: safer, but more expired links. Stricter or looser limits: a balance between abuse and users locked out.
- **Recommendation (not a decision):** Keep them unless the owner objects, because they are covered by the backend test suite.
- **Approval owner:** Swatismita.
- **Implementation impact:** Environment settings or `accountSecurity.controller.js`, tests, contract §6a.

### Limits and hosting

#### R-6 — Should ticket creation and replies be rate limited?

- **Current behaviour:** No limit. Rate limits apply only to sign-in, sign-up and account-security routes. A signed-in customer can create tickets and post replies without limit, and each new ticket also notifies every active staff member.
- **Status:** Open, not recorded.
- **Options and trade-offs:** No limit: no risk of blocking a genuine user, but open to spam. Per-user limit: fair and targeted, needs tuning. Per-IP limit: reuses the existing limiter, but depends on R-8.
- **Recommendation (not a decision):** A generous per-user limit is worth considering, given how many records each new ticket creates. The value should be chosen by the owners.
- **Approval owner:** Swatismita (ticket creation) and Ayushi Rathi (replies).
- **Implementation impact:** `customerTicket.routes.js`, `agentTicket.routes.js`, rate limiter, ticket and reply screens, tests, contract.

#### R-7 — Are the ticket and reply limits right?

- **Current behaviour:** Subject 5–120 characters, description 10–5000, reply 1–2000, request body 100 kB. There is no limit on tickets per customer or replies per ticket, comment lists are not paged, and there are no attachments.
- **Status:** Proposed. The length rules come from the contract draft.
- **Options and trade-offs:** Keep them: simple. Page comments or limit replies: protects long threads, but needs new API and screen behaviour. Attachments: useful for support, but a large addition covering storage and security.
- **Recommendation (not a decision):** None.
- **Approval owner:** Swatismita (ticket fields) and Ayushi Rathi (replies).
- **Implementation impact:** Models, controllers, `frontend/src/api/tickets.js`, tests, contract, data model.

#### R-8 — How should the API trust the host's proxy?

- **Current behaviour:** Express `trust proxy` is not set. Behind a hosting proxy, every request would appear to come from the proxy: all users would share one sign-in limit, and HSTS would never be sent.
- **Status:** Proposed. The README describes a `TRUST_PROXY` setting that is not implemented.
- **Options and trade-offs:** Add the setting as proposed: correct and safe, but the number must match the host. Trust every proxy: simple, but a client could fake its address and bypass limits. Leave it: acceptable only without a proxy.
- **Recommendation (not a decision):** The README's proposal, set once the host is chosen, because the other options either fail behind a proxy or weaken the rate limits.
- **Approval owner:** Tirth Vaghela (deployment coordination).
- **Implementation impact:** `app.js`, `config/envRules.js`, `.env.example`, tests, README. Needs a check on the real host.

#### R-9 — Will the API run as one process or several?

- **Current behaviour:** Rate limit counts are kept in memory per process, which is only correct for one instance.
- **Status:** Open. The README lists this as a known limitation.
- **Options and trade-offs:** One instance: no extra service, limited scaling. Several with a shared store: scales, but adds a dependency.
- **Recommendation (not a decision):** One instance fits the project's scale, unless the chosen host requires otherwise.
- **Approval owner:** Tirth Vaghela.
- **Implementation impact:** None for one instance. Otherwise the rate limiter, a new service and tests.

#### R-10 — Which host, production database and email provider?

- **Current behaviour:** Not deployed. Development writes emails to a local folder, and production needs SMTP settings.
- **Status:** Open. The README says these are still to be chosen.
- **Options and trade-offs:** Depends on cost, region and free-tier limits. The audit did not compare providers.
- **Recommendation (not a decision):** None.
- **Approval owner:** Tirth Vaghela (deployment coordination), with team agreement where cost is involved.
- **Implementation impact:** Environment settings, README, and R-1, R-8 and R-17.

### Tickets and permissions

#### R-11 — Can a resolved ticket be reopened?

- **Current behaviour:** No. Status only moves forward, and a resolved ticket is final. Replies on resolved tickets are still allowed.
- **Status:** Default (D-3, D-10). The README also lists it as a product decision.
- **Options and trade-offs:** Keep it: simple, and reports stay stable, but customers with a returning problem must open a new ticket. Allow reopening: friendlier, but changes the workflow, resolution times and SLA figures.
- **Recommendation (not a decision):** None. The brief's workflow ends at Resolved, according to contract D-3.
- **Approval owner:** Ayushi Rathi (status transitions).
- **Implementation impact:** `ticketStatus.js`, analytics, notifications, staff and customer screens, tests, contract.

#### R-12 — What can customers do with their own tickets?

- **Current behaviour:** A customer chooses a priority when creating a ticket, and that priority sets the SLA due date. Afterwards they cannot change priority, or close or cancel the ticket. They can reply at any status.
- **Status:** Open, not recorded. Customers choosing a priority is a handbook requirement, according to `DATA_MODEL.md`. Its effect on the SLA and the lack of a close action have no recorded decision.
- **Options and trade-offs:** Keep it: simple, but customers could mark everything High to get a shorter deadline. Treat the customer's choice as a suggestion until an agent reviews it: fairer SLA figures, more work. Let customers close their own ticket: less work for agents, but adds a new transition.
- **Recommendation (not a decision):** None.
- **Approval owner:** Swatismita (ticket creation) and Ayushi Rathi (status transitions). Mimansa Narendra Patle should be consulted on customer screens.
- **Implementation impact:** Ticket controllers, `sla.js`, customer screens, tests, contract.

#### R-13 — Should customers see staff names?

- **Current behaviour:** Inconsistent by design choice or by accident; no record says which. Ticket details, replies and in-app notifications show the staff member's name. Status emails deliberately name no agent ("Our support team…").
- **Status:** Open, not recorded.
- **Options and trade-offs:** Show names everywhere: personal and accountable. Hide them everywhere: protects staff privacy, but the service feels less personal. Keep the mix: no work, but the policy is unclear.
- **Recommendation (not a decision):** None.
- **Approval owner:** Owner confirmation needed. It spans replies (Ayushi Rathi), notifications (Tirth Vaghela) and customer screens (Mimansa Narendra Patle).
- **Implementation impact:** `ticketSerializers.js`, `notifications.js`, `TicketDetail.jsx`, tests, contract.

#### R-14 — Should staff have internal notes?

- **Current behaviour:** Not implemented. Every reply is visible to the customer.
- **Status:** Open. The README lists it as a product decision.
- **Options and trade-offs:** No notes: simple, but staff have nowhere private to record details. Add notes: useful for handovers, but a mistake in access checks could expose private text to customers.
- **Recommendation (not a decision):** None.
- **Approval owner:** Ayushi Rathi (conversation management). Shwetaleena Kundu should be consulted on the agent screens.
- **Implementation impact:** `TicketComment` model, comment API, `ticketAccess.js`, staff screens, tests, contract.

#### R-15 — Are the SLA targets and their visibility right?

- **Current behaviour:** Targets are 24, 72 and 168 calendar hours for high, medium and low priority, and can be configured. They ignore weekends and working hours. Only staff see due dates. No reminders are sent.
- **Status:** Open, not recorded. A code comment says customer visibility was "approved: not customer-visible yet", but no approval record was found.
- **Options and trade-offs:** Keep them: simple. Business hours: more realistic, but more complex. Show due dates to customers: more transparent, but creates visible promises. Reminders: fewer missed deadlines, but need background work.
- **Recommendation (not a decision):** None.
- **Approval owner:** Owner confirmation needed. It spans admin dashboard data (Tirth Vaghela) and the agent workflow (Ayushi Rathi).
- **Implementation impact:** `sla.js`, `ticketSerializers.js`, customer and staff screens, tests, contract.

#### Q-3 — What number should tickets start from?

- **Current behaviour:** Numbers run from `HD-1` using an atomic counter. A failed creation can leave a gap. Sequential numbers reveal roughly how many tickets exist.
- **Status:** Open.
- **Options and trade-offs:** Start at `HD-1`: no work. Start higher: looks established, needs one setup step. Random references: hide volume, but are harder to read aloud and require a code change.
- **Recommendation (not a decision):** None. Access checks do not depend on the number.
- **Approval owner:** Swatismita (ticket creation).
- **Implementation impact:** Seed scripts or `Counter.js`, data model. Must be settled before real tickets exist.

#### Q-4 — Is status history enough, or is a full audit trail needed?

- **Current behaviour:** Status changes are recorded. Assignment and priority changes are not, although contract D-10 mentions an assignment history as deferred.
- **Status:** Open. The data model's current proposal is status history only.
- **Options and trade-offs:** Keep it: meets the handbook requirement as recorded in the data model. Add a full trail: better accountability, but more storage and screens.
- **Recommendation (not a decision):** None.
- **Approval owner:** Ayushi Rathi (status history) and Swatismita (Ticket model).
- **Implementation impact:** New model or fields, ticket controllers, staff screens, tests, contract, data model.

#### Q-6 — What happens to tickets of a deactivated or demoted agent?

- **Current behaviour:** They stay assigned. Only admins can then see and reassign them. Nothing alerts the admin.
- **Status:** Open. The README also asks the team to confirm this.
- **Options and trade-offs:** Keep it: no surprise changes, but tickets can sit unnoticed. Release automatically: tickets return to the queue, but in-progress tickets would break D-10, which requires them to keep an assignee. Warn the admin: safest, a small addition.
- **Recommendation (not a decision):** None.
- **Approval owner:** Ayushi Rathi (assignment) and Tirth Vaghela (admin user management). The data model currently names Ayushi and Swatismita (DOC-12).
- **Implementation impact:** `adminUser.controller.js`, admin screens, tests, contract, data model.

#### A-6 — Should agents lose access once a ticket goes to someone else?

- **Current behaviour:** Yes. Once a ticket is assigned to another agent, an agent can no longer see it or its conversation. This follows from OPEN-1.
- **Status:** Open. The data model marks it "reviewer to confirm".
- **Options and trade-offs:** Keep it: strict and simple, but an agent cannot follow up on a ticket they handed over. Read-only access for former assignees: better continuity, but widens access.
- **Recommendation (not a decision):** None.
- **Approval owner:** Ayushi Rathi, who is recorded as confirming OPEN-1.
- **Implementation impact:** `ticketAccess.js`, queue, tests, contract, data model.

### Email and notifications

#### R-16 — Which events notify users, and through which channel?

- **Current behaviour:** In-app notifications cover ticket events, refreshed every minute while the page is visible. Customers get email only for status changes. There is no email for new replies, no push notification and no opt-out.
- **Status:** Open. The README lists it as a product decision.
- **Options and trade-offs:** Keep it: simple and low in volume, but customers may miss a reply. Email for replies: more helpful, but more mail and more risk of being marked as spam. Opt-out settings: more control, more screens.
- **Recommendation (not a decision):** None.
- **Approval owner:** Tirth Vaghela (the team owner of notifications in contract §4). Ayushi Rathi should be consulted on replies.
- **Implementation impact:** `notifications.js`, `ticketEmails.js`, templates, a new user preference if opt-out is added, tests, contract.

#### R-17 — How reliable must email delivery be?

- **Current behaviour:** There are no retries and no queue. A failed status email or notice is logged and lost. A failed email-change confirmation returns `503`, and nothing stays pending. On shutdown, the API waits up to 5 seconds for status emails, within a 10-second limit, then abandons any left. A forgot-password email is not waited for, so a shutdown at that moment can lose it, as the README notes.
- **Status:** Open, not recorded. Behaviour is documented, but nobody has accepted the risk.
- **Options and trade-offs:** Accept the loss: simple, and fine for a small project, but emails can vanish silently. Retry a few times: covers short outages, still lost on restart. Durable queue: reliable, but adds storage and background work.
- **Recommendation (not a decision):** Decide after R-10, because retry needs depend on the provider.
- **Approval owner:** Tirth Vaghela (integration and deployment) and Swatismita (account emails).
- **Implementation impact:** `services/email.js`, `server.js`, tests, README.

#### R-18 — How long are notifications kept?

- **Current behaviour:** Forever. There is no expiry and no delete. Each new ticket creates one record for every active staff member. Lists are paged, at most 50 per page.
- **Status:** Open, not recorded.
- **Options and trade-offs:** Keep them: simple, but the collection grows steadily. Expire read notifications after a set period: controls growth, but history disappears. Notify only some staff about new tickets: fewer records, but tickets may be noticed later.
- **Recommendation (not a decision):** None. No measurements of notification volume exist.
- **Approval owner:** Tirth Vaghela.
- **Implementation impact:** `Notification` model (an index), tests, contract §12a, data model.

### Administration and data

#### R-19 — What is the right limit for CSV exports?

- **Current behaviour:** The admin export reads at most 50 pages of 100 tickets, newest first, in the browser: 5,000 tickets in total. Only those tickets are then filtered by the selected dates. See TD-1 for what happens above the limit.
- **Status:** Open, not recorded. The limit exists only as a code constant.
- **Options and trade-offs:** Keep 5,000 with a warning: small change, and enough at this scale. Raise it: more complete, but slower in the browser. Export on the server: handles any size, needs a new API route.
- **Recommendation (not a decision):** Fix TD-1 first, whichever limit is chosen.
- **Approval owner:** Tirth Vaghela (admin dashboard data).
- **Implementation impact:** `AdminReports.jsx`, possibly a new API route, tests, contract.

#### R-20 — What should admins be able to edit in a category?

- **Current behaviour:** Admins can create a category with a description, rename it, and activate or deactivate it. The API can also change the description, but the screen offers no way to do so. Categories cannot be deleted.
- **Status:** Open, not recorded.
- **Options and trade-offs:** Keep it: simple, but a mistyped description stays. Add description editing: small change using the existing API. Add deletion: tidier, but existing tickets need a rule for what happens to their category.
- **Recommendation (not a decision):** None.
- **Approval owner:** Tirth Vaghela (admin backend) and Shwetaleena Kundu (category screen).
- **Implementation impact:** `AdminCategories.jsx` and its tests. Deletion would also need API, analytics and contract changes.

#### R-21 — How long is stored data kept?

- **Current behaviour:** Only one-time links expire automatically (a TTL index on `AuthToken`). Tickets, comments, users, categories, notifications and `TicketSubmission` duplicate-protection records are kept indefinitely. Nothing runs a scheduled cleanup.
- **Status:** Open, not recorded. The data model records "no expiry" for `TicketSubmission` as a fact, not as a decision.
- **Options and trade-offs:** Keep everything: simple, and reports stay complete, but personal data stays forever. Expire duplicate-protection records: safe housekeeping once retries can no longer occur. A full retention policy: better for privacy, but needs rules for reports.
- **Recommendation (not a decision):** None. Decide together with Q-7.
- **Approval owner:** Tirth Vaghela (shared database coordination), with the model owners.
- **Implementation impact:** Models (TTL indexes), analytics, data model, README.

#### R-22 — What personal data may server logs contain?

- **Current behaviour:** Failed emails log only their purpose and codes, and query strings are removed. Logs still contain URL paths, client IP and user agent in production, and unexpected errors in full.
- **Status:** Open. The README says "review before production".
- **Options and trade-offs:** Accept it: useful for diagnosis, but some personal data is stored. Reduce it further: better privacy, harder diagnosis. Set a retention period: depends on the host.
- **Recommendation (not a decision):** Decide after R-10, because log retention depends on the host.
- **Approval owner:** Tirth Vaghela.
- **Implementation impact:** `requestLog.js`, `errorHandler.js`, tests, `TEST_EVIDENCE.md`.

#### Q-7 — Can users, tickets, categories or comments be deleted?

- **Current behaviour:** No delete routes exist. Users and categories are deactivated instead.
- **Status:** Open. The data model assigns this to the "Team".
- **Options and trade-offs:** No deletion: keeps history and reports intact, but offers no way to remove someone's personal data. Remove or anonymise on request: better privacy, but reports and conversations need rules.
- **Recommendation (not a decision):** None. Decide together with R-21.
- **Approval owner:** Owner confirmation needed. It spans admin operations (Tirth Vaghela), models (Swatismita) and conversations (Ayushi Rathi).
- **Implementation impact:** New routes, models, analytics, admin screens, tests, contract, data model.

#### R-23 — Do the owners accept the field rules labelled Proposed?

- **Current behaviour:** Lengths, enum values, schema conventions (S-2 to S-11), indexes and A-1 are implemented as the data model describes, apart from the differences listed in DOC-8 to DOC-10.
- **Status:** Proposed. The data model says they stay Proposed until the model owners approve them.
- **Options and trade-offs:** Approve as they are: no work. Change individual rules: may affect existing data, the API and screens.
- **Recommendation (not a decision):** None.
- **Approval owner:** Swatismita (User, Ticket and Category models) and Ayushi Rathi (ticket comments), with Tirth Vaghela for indexes.
- **Implementation impact:** None if accepted; updating the labels in `DATA_MODEL.md`.

#### Q-9, Q-10 — Do the owners accept two smaller model proposals?

- **Current behaviour:** Q-9: `User` and `Category` store `updatedAt`, which `User` responses do not return. Q-10: tickets still show the name of a deactivated category.
- **Status:** Proposed. Both match what the data model proposes.
- **Options and trade-offs:** Accept: no work. Otherwise: small model or serializer changes.
- **Recommendation (not a decision):** None.
- **Approval owner:** Swatismita.
- **Implementation impact:** None if accepted; updating `DATA_MODEL.md`.

## 5. Defaults without approval evidence

These are implemented and documented as engineering defaults chosen by Tirth Vaghela. **None is approved:** the contract says "not yet approved", and no approval evidence was found (§2). The approval owner below follows the final team responsibilities, and differs from the contract's named confirmer only where noted.

| ID | Default, in brief | Also settles | Approval owner | Evidence of approval |
| --- | --- | --- | --- | --- |
| D-1 | Agents assign tickets only to themselves or to nobody; admins assign anyone eligible | C-8, part of Q-5 | Ayushi Rathi | None found |
| D-2 | Assignees must be active agents or admins | C-5, part of Q-5 | Ayushi Rathi | None found |
| D-3 | Replies are allowed on resolved tickets | C-1 | Ayushi Rathi | None found |
| D-4 | The comment model is named `TicketComment` | Q-2 | Ayushi Rathi, Swatismita | None found |
| D-5 | One shared access helper, `ticketAccess.js` | A-9 | Swatismita, Ayushi Rathi | None found |
| D-6 | Categories are a database collection | C-4, Q-1 | Swatismita | None found |
| D-7 | One detail route, `GET /api/tickets/:id`, in the agent-workflow router | — | Swatismita, Ayushi Rathi | None found |
| D-8 | Admins cannot change their own role or status, and the last active admin is protected | C-2 | Tirth Vaghela (admin management). The contract names Swati (DOC-7) | None found |
| D-9 | Additions made during dashboard integration, such as profile updates and sign-in rate limits | — | Tirth Vaghela, Swatismita, Ayushi Rathi, by area. The contract names Swati and Ayushi (DOC-7) | None found |
| D-10 | In-progress and resolved tickets always have an assignee; a resolved ticket is final | Part of R-11 | Ayushi Rathi. The contract says pending review by Ayushi | None found |
| D-11 | Only the assigned agent, the ticket's customer and admins may reply | — | Ayushi Rathi. The contract says pending review by Ayushi | None found |

Q-8 (shared JSON output in `models/toJSON.js`) is also a default in the data model. Approval owner: Swatismita. Evidence of approval: none found. See DOC-10 for a detail of its wording.

## 6. Technical defects

These need a fix or a technical assessment rather than a product decision. Nothing here has been fixed.

| ID | Problem | Effect | Evidence | Suggested owner |
| --- | --- | --- | --- | --- |
| TD-1 | The CSV export silently stops at 5,000 tickets. It reads the newest tickets first and shows no warning | A report can be incomplete with no sign of it. A custom range older than the newest 5,000 tickets can miss tickets or come out empty | `AdminReports.jsx:20,79`. Found by reading the code, not reproduced | Tirth Vaghela |
| TD-2 | Account changes that overlap can get past the rule that a password or email change ends older links. (a) An email-change request that passed its password check can create its link just after a password change cancelled the old ones. (b) A confirmation link already being used can finish its email change after a password change. (c) A forgot-password request in progress can send a working reset link to the old address just after an email change | Contract §6a's rule may not hold in these short windows. The risk is low, because each needs precise timing | `accountSecurity.controller.js`, `oneTimeToken.js`. Found by reading the code, **not reproduced**, so its real likelihood is unknown | Swatismita |
| TD-3 | The index `{ status: 1, dueAt: 1 }` is unused. A code comment keeps it "until a separate change decides otherwise" | Small write and storage cost | `Ticket.js:73-75`, data model §5 | Swatismita, with Tirth Vaghela for database coordination |

## 7. Documentation inconsistencies

Each was found by comparing the documents with the code. Nothing here has been changed, except where a row says it was resolved.

| ID | Where | Inconsistency |
| --- | --- | --- |
| DOC-1 | `API_CONTRACT.md` §2, §12 | **Resolved 31 October 2026.** `API_CONTRACT.md` now documents the four error codes added for malformed requests (`UNSUPPORTED_CHARSET`, `UNSUPPORTED_ENCODING`, `INVALID_BODY_ENCODING`, `INVALID_URL`) and status 415, in §2 and §12. The contract update and the code were merged through PR #16 in commit `cbaf2fd`. As audited, these codes and status 415 were missing from the contract, and the code was uncommitted |
| DOC-2 | `API_CONTRACT.md` §6a | Says all its routes are rate limited, but `GET` and `DELETE /api/auth/me/email` are not |
| DOC-3 | `API_CONTRACT.md` §2 | Says responses are 201 or 200, but `POST /api/auth/me/email` returns 202. The 409 row covers only duplicates, although it is also used for concurrent changes, the last active admin and idempotency keys |
| DOC-4 | `API_CONTRACT.md` §11 | The role and status routes omit `400 INVALID_ID`. `/api/admin/stats` can return `name: null` for a category, which is not mentioned |
| DOC-5 | `API_CONTRACT.md` §12, §6 | `RATE_LIMITED` is described for sign-in and sign-up only. The `RateLimit-*` headers and turning a limit off with 0 are not mentioned |
| DOC-6 | `API_CONTRACT.md` §4 | `POST /api/tickets/:id/comments` is marked `Agent*`, but D-11 allows only the assigned agent |
| DOC-7 | `API_CONTRACT.md` §1 | "Swati" remains in D-4, D-6, D-8, D-9 and OPEN-2. The D-8 and D-9 owners do not match §4 and the final team responsibilities |
| DOC-8 | `DATA_MODEL.md` §3.1 | Says passwords may be "8–72 characters", but the limit is 72 **bytes** |
| DOC-9 | `DATA_MODEL.md` §3.3, §7 | Omit the D-10 rule on assignees and resolved tickets, and that a missing priority defaults to `medium` |
| DOC-10 | `DATA_MODEL.md` Q-8, A-3 | `toJSON` is said to be applied by every model, but `Counter` and `TicketSubmission` do not use it. A-3 suggests `.equals()`, but the code compares strings, with the same result |
| DOC-11 | `DATA_MODEL.md` §1, §10 | Many built items are still labelled Proposed. §10 names no owner for `AuthToken`, `Notification` or `TicketSubmission` |
| DOC-12 | `DATA_MODEL.md` §8 | Q-6 names Ayushi and Swatismita, but deactivation is admin management, which belongs to Tirth Vaghela |
| DOC-13 | `README.md:60` | **Resolved 31 October 2026.** `README.md` now says "Mimansa Narendra Patle", matching the final team responsibilities. The README update is included in the Group B documentation commit, `docs: finalize help desk project documentation`. As audited, it said "Mimansa Patle", where the final team responsibilities say "Mimansa Narendra Patle" |
| DOC-14 | `CUSTOMER_TICKET_API_GAPS.md`, `WIREFRAMES.md`, code comments | The gaps document names Swatismita as owner of category administration, which is now under Tirth Vaghela. `WIREFRAMES.md` predates the admin conversation and priority control. Comments in `User.js`, `Ticket.js`, `Category.js`, `Counter.js`, `auth.js` and `app.js` still say "Swati" |

## 8. What could not be verified

| Item | Why |
| --- | --- |
| Approvals outside GitHub and these documents | Meetings and chat are not available to this audit. Such decisions stay unresolved until recorded |
| Handbook and brief statements | The brief is kept outside this repository, so quotes rely on `API_CONTRACT.md` and `DATA_MODEL.md` |
| R-4 (browser behaviour after a role change), TD-1, TD-2 | Found by reading the code. None was run or reproduced |
| Behaviour on a real host, real SMTP or real data | Not deployed, and not tested for this audit. See `TEST_EVIDENCE.md` §7 |
| Volumes behind R-7, R-18 and R-21 | No measurements exist of notification, comment or submission growth |
| The reason for R-13's mixed approach and R-15's "approved" comment | No record explains either one |

## 9. How to record an approval

1. The approval owner states the decision in a pull request review or comment, or in a dated written note the team keeps.
2. Update this register with the decision, the person, the date and a link to that evidence.
3. Update `API_CONTRACT.md` or `DATA_MODEL.md` in the same pull request, and change the code and tests if the decision requires it.

Until then, the item stays unresolved, whatever the software currently does.
