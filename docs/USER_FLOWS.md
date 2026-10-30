# Help Desk — User Flows

How customers, agents and administrators move through the application, as implemented (October 2026). Screens are named as they appear in the app; routes are in `code`. The rules behind each step are in [API_CONTRACT.md](API_CONTRACT.md) (decision numbers such as D-10 refer to it).

GitHub renders the diagrams below. In other viewers, paste a block into <https://mermaid.live>.

## Contents

1. [Entry points and roles](#1-entry-points-and-roles)
2. [Customer](#2-customer)
3. [Agent](#3-agent)
4. [Administrator](#4-administrator)
5. [Ticket lifecycle and who may change it](#5-ticket-lifecycle-and-who-may-change-it)
6. [Account recovery and security](#6-account-recovery-and-security)

---

## 1. Entry points and roles

Customers sign up themselves. Agents and administrators are staff accounts: the first admin is created with `npm run create:staff`, and admins then change roles in the dashboard. Every signed-in page checks the role on the server as well as in the browser.

```mermaid
flowchart LR
    Landing["Landing page<br/>/"] --> CustLogin["Customer sign in<br/>/login"]
    Landing --> Signup["Create account<br/>/signup"]
    Landing --> StaffLogin["Staff sign in<br/>/staff/login"]
    Signup -->|"account created as customer"| MyTickets
    CustLogin -->|"role: customer"| MyTickets["My tickets<br/>/tickets"]
    StaffLogin -->|"role: agent"| AgentDash["Agent dashboard<br/>/agent/dashboard"]
    StaffLogin -->|"role: admin"| AdminDash["Admin dashboard<br/>/admin/dashboard"]
    CustLogin -.->|"staff account"| Refused1["Not signed in: message<br/>with a link to staff sign in"]
    StaffLogin -.->|"customer account"| Refused2["Not signed in: staff-only message"]
```

Signed-in users also have a **notification bell** in every header (new ticket, assignment, status change, reply), and **account settings**: `/profile` for customers, `/staff/account` for staff.

## 2. Customer

```mermaid
flowchart TD
    A["Sign in / create account"] --> B["My tickets<br/>list with status filter and pages"]
    B -->|"New ticket"| C["Raise a ticket<br/>subject, description, category, priority"]
    C -->|"validated in the browser and on the server"| D{"Created?"}
    D -->|"yes: HD-n reference"| E["Ticket detail<br/>/tickets/:id"]
    D -->|"no: field errors or failure message"| C
    B -->|"open a ticket"| E
    E --> F["Read the conversation<br/>replies with date and time"]
    E --> G["Reply to the agent"]
    G --> E
    E --> H["Track status<br/>badge plus status history"]
    E --> B
```

- A customer sees **only their own tickets**; another customer's ticket link gives "not found".
- A repeated submission (double click, retry after a network error) returns the ticket already created instead of a second one (contract §7, `Idempotency-Key`).
- Replies are allowed on open, in-progress and resolved tickets (D-3).
- When staff move a ticket to In Progress or Resolved, its customer gets one email (contract §8). Customers see no SLA information.
- If no category is active, New Ticket explains that tickets can't be raised right now and disables the form; an admin fixes this under Categories. If a category is deactivated while the form is open, submitting asks the customer to choose another, keeping what they wrote.

## 3. Agent

```mermaid
flowchart TD
    A["Staff sign in"] --> B["Agent dashboard: Overview<br/>counts: open, in progress, resolved, assigned to me"]
    B --> C["Inbox<br/>unassigned tickets + tickets assigned to me"]
    C --> F["Search and filter<br/>status, priority, category,<br/>Show: All accessible / My tickets / Unassigned"]
    F --> C
    C --> D["Open a ticket<br/>conversation, controls, status history"]
    D -->|"unassigned"| E["Assign to me"]
    E --> G["Status: Open → In Progress"]
    G --> H["Reply to the customer"]
    H --> I["Status: In Progress → Resolved"]
    I --> J["Resolved: final, read-only controls"]
    D -->|"assigned to me, still open"| K["Release (back to unassigned)"]
    K --> C
```

- An agent never sees tickets assigned to **another** agent (OPEN-1), whatever filter is chosen.
- An agent changes status and replies **only on tickets assigned to them** (D-10, D-11); the screen explains why a control is locked.
- An in-progress ticket cannot be released, only resolved (or reassigned by an admin).
- Each ticket in the Inbox and in Admin Tickets shows an SLA badge: Due, Due soon, Overdue, Met, Missed or No SLA. Ticket details also show the exact due date. A priority change moves the due date; assignment and status changes do not.

## 4. Administrator

```mermaid
flowchart TD
    A["Staff sign in"] --> O["Admin dashboard: Overview<br/>tickets by status, unassigned,<br/>top categories, agent workload"]
    O --> T["Tickets<br/>all tickets, search and filters:<br/>status, priority, category, assignee"]
    T --> TD["Ticket dialog<br/>assign or reassign to any active agent or admin,<br/>change status, status history"]
    O --> U["Users<br/>search, role and status filters"]
    U --> UR["Change role<br/>customer / agent / admin"]
    U --> UA["Activate or deactivate"]
    O --> C["Categories"]
    C --> CA["Add category"]
    C --> CE["Rename, describe, activate or deactivate"]
    O --> R["Reports<br/>status, priority, category, resolution time,<br/>SLA and agent figures for a date range; CSV export"]
```

- Admins cannot change their own role or deactivate themselves, and the **last active admin** cannot be demoted or deactivated.
- Category names are unique ignoring letter case. A deactivated category stays on its existing tickets but cannot be chosen for new ones; the backend also refuses it if sent directly.
- Reports covers tickets **created** in the selected range (last 7, 30 or 90 days, all time, or custom dates in the browser's time zone). Resolved outcomes (Met, Missed) are kept apart from current risk (Due, Due soon, Overdue), and the CSV export follows the same range.

## 5. Ticket lifecycle and who may change it

```mermaid
stateDiagram-v2
    [*] --> Open: customer raises the ticket
    state "In Progress" as InProgress
    Open --> Open: assign, reassign or release (agents only themselves, admins anyone)
    Open --> InProgress: assignee or admin, only once assigned
    InProgress --> InProgress: admin may reassign, never to unassigned
    InProgress --> Resolved: assignee or admin
    Resolved --> [*]
    note right of Resolved
        Final: status, priority and assignee
        can no longer change. Replies are still allowed.
    end note
```

| Status | Has an assignee | Who can move it forward | Recorded |
| --- | --- | --- | --- |
| Open | optional | the assignee, or an admin, once it is assigned | first history entry, by the customer |
| In Progress | always | the assignee or an admin | history entry with who and when |
| Resolved | always | nobody (final) | history entry and `resolvedAt` |

Skipping a step, going backwards or repeating a status is refused (`400 INVALID_STATUS_TRANSITION`); changing an unassigned or resolved ticket is refused with a clear message (`ASSIGNEE_REQUIRED`, `TICKET_RESOLVED`).

## 6. Account recovery and security

```mermaid
flowchart LR
    F["Forgot password<br/>/forgot-password"] -->|"same answer whether or not the email exists"| M["Email with a one-time link"]
    M --> R["Reset password<br/>/reset-password"]
    R -->|"link valid, unused, not expired"| S["Signed out everywhere;<br/>sign in with the new password"]
    P["Account settings"] --> PC["Change password<br/>(current password required)"]
    P --> EC["Change email"]
    EC --> V["Confirmation link sent to the new address<br/>/verify-email"]
```

Emails need a working email transport: in development they are written to `backend/.outbox/`; in production SMTP must be configured (see README, "Email").
