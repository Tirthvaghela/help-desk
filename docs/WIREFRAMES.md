# Help Desk — UI Wireframes

Low-fidelity layouts of the screens as implemented (October 2026). They show structure, content and controls, not colours or exact spacing; the running app is the reference for visual design. How the screens connect is in [USER_FLOWS.md](USER_FLOWS.md).

Conventions: `[Button]`, `[Select ▾]`, `[____]` text field, `( ) / (•)` choices, `🔔` notification bell. Every data screen also has a loading state, an error state with **Try again**, and an empty state ("No tickets yet", "No tickets match your search or filters").

## Contents

- [Shared header](#shared-header)
- Public: [Landing](#landing) · [Customer sign in / sign up](#customer-sign-in--sign-up) · [Staff sign in](#staff-sign-in)
- Customer: [My tickets](#my-tickets) · [Raise a ticket](#raise-a-ticket) · [Ticket detail](#ticket-detail)
- Agent: [Overview](#agent-overview) · [Inbox](#agent-inbox)
- Admin: [Overview](#admin-overview) · [Tickets and ticket dialog](#admin-tickets) · [Users](#admin-users) · [Categories](#admin-categories) · [Reports](#admin-reports)
- [Small screens](#small-screens)

---

## Shared header

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▣ Help Desk     [Tab] [Tab] [Tab] …                       🔔(3)   (AB ▾) │
└──────────────────────────────────────────────────────────────────────────┘
  Customer tabs: My tickets · New ticket · Profile
  Agent tabs:    Overview · Inbox
  Admin tabs:    Overview · Tickets · Users · Categories · Reports
  🔔 opens the latest notifications (mark one / all as read). Staff: the avatar menu has
  Account settings and Sign out, and the selected tab is kept in the address (?page=).
  Customers: initials and a separate [Sign out] button; settings are under Profile.
```

## Landing

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▣ Help Desk   How it works · For your team · Ticket lifecycle · FAQ      │
│                                                [Sign in]  [Get started]  │
├──────────────────────────────────────────────────────────────────────────┤
│  Every request, one calm thread.                   ┌──────────────────┐  │
│  Short explanation of the service                  │ product preview: │  │
│  [Primary action]  [See the three views]           │ ticket + replies │  │
│                                                    └──────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│  How it works: ① Open a ticket  ② An agent picks it up  ③ Resolved       │
│  One product, three views:  [Open a ticket] [Open the inbox]             │
│                             [Open the admin view]                        │
│  Everyone sees the same status:  Open → In progress → Resolved           │
│  Common questions (FAQ, expandable)                                      │
│  Got a problem? Start the thread.   [call to action]                     │
├──────────────────────────────────────────────────────────────────────────┤
│  Footer links                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Customer sign in / sign up

```
┌───────────────────────────────┐   Sign up: Full name, Email address, Password,
│  Sign in to Help Desk         │   Confirm password. Errors appear under each field and in an
│  Email     [________________] │   alert above the button (wrong password,
│  Password  [________________] │   deactivated account, staff account →
│  [Sign in]                    │   "Go to staff sign-in").
│  Forgot password?             │
│  New here? Create an account  │
│  Staff sign-in                │
└───────────────────────────────┘
```

## Staff sign in

```
┌──────────────────────────────┬──────────────────────────────────┐
│ Support Management           │  Welcome back                    │
│ Every request, … (intro      │  Workspace  [ Agent | Admin ]    │
│ panel with feature points)   │  Email address [______________]  │
│                              │  Password      [______________]  │
│                              │  [Sign in]   Forgot password?    │
└──────────────────────────────┴──────────────────────────────────┘
  The Workspace toggle is a visual choice only: the dashboard opened depends on
  the role the server returns. Customer accounts get a staff-only message.
```

## My tickets

```
┌──────────────────────────────────────────────────────────────────────────┐
│ My tickets                                                  [New ticket] │
│ (All 5) (Open 2) (In progress 2) (Resolved 1)        ← status filter     │
├──────────────────────────────────────────────────────────────────────────┤
│ HD-12  Locked out after resetting my password      [Open]  [High]   2h  │
│ HD-9   Exporting the monthly report to PDF fails   [In progress] [High] │
│ HD-4   Change the email address on my account      [Resolved]  [Low]    │
│ …                                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│                      [← Newer]   Page 1 of 2   [Older →]                 │
└──────────────────────────────────────────────────────────────────────────┘
```

## Raise a ticket

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back to my tickets                                         │
│ Raise a ticket                                               │
│ Subject      [__________________________________]   12/120   │
│ Category     [Billing ▾]        Priority  [Medium ▾]         │
│ Description  [__________________________________]           │
│              [__________________________________]  80/5000   │
│ [Submit ticket]   [Cancel]                                   │
└──────────────────────────────────────────────────────────────┘
  While sending: fields disabled, "Submitting…". On success: ticket detail
  with "HD-n created". Loading: "Loading categories…" in the Category field.
  No active categories: a message above the form, which stays visible but disabled.
  Categories could not be loaded: an error with Try again.
  A category deactivated while the form is open: on submit, a message under Category,
  the list refreshes and the customer chooses another, keeping what they wrote.
```

## Ticket detail

```
┌──────────────────────────────────────────────────────────────────────────┐
│ HD-12 · Locked out after resetting my password      [Open]  [High]       │
│ Category: Account & Login   Assigned to: Not assigned yet                │
│ Opened: Oct 29, 2026 · 09:10   Last updated: …                           │
│ Description ──────────────────────────────────────────────────────────── │
│ I reset my password this morning …                                       │
│ Status history ───────────────────────────────────────────────────────── │
│ ● Open  Oct 29 · 09:10                                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ Conversation                                              [Refresh]      │
│ ┌ Sara Thomas (Agent) · Oct 29, 11:02 ─────────────────────────────────┐ │
│ │ Hi Rohan, …                                                          │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ Your reply [____________________________________________]   0/2000      │
│ [Send reply]                                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

## Agent overview

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Open Tickets │ In Progress  │ Resolved     │ Assigned to Me│
│     12       │      4       │     30       │      5       │
└──────────────┴──────────────┴──────────────┴──────────────┘
┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ Unassigned Tickets               │ │ My Tickets                       │
│ Requests waiting for an agent    │ │ Support requests assigned to you │
│ HD-12 Locked out …  [High]       │ │ HD-9 Exporting … [In progress]   │
└──────────────────────────────────┘ └──────────────────────────────────┘
  Each ticket opens in the Inbox.
```

## Agent inbox

```
┌─────────────────────────────┬────────────────────────────────────────────┐
│ Support Inbox     [26 Tick.]│ (RK) Locked out after resetting my password│
│ Unassigned + assigned to you│ HD-12 · Rohan Kapoor   Not assigned yet    │
│ [🔍 Search ticket ID or …  ]│                      [High] [Open]         │
│ (All 9)(Open 5)(In Pr 3)(Re)│ Status [Open ▾] Priority [High ▾]          │
│ Show      [All accessible ▾]│ Assignee [Unassigned ▾ / You (Agent)]      │
│ Priority  [All Priorities ▾]│ Account & Login · Opened Oct 29 · 09:10    │
│ Category  [All Categories ▾]│ Due Oct 30 · 09:10                         │
│                             │ "Assign the ticket before starting work."  │
│ ┌─────────────────────────┐ │ ▸ Status history · 1 entry  (expandable)   │
│ │ RK Rohan Kapoor   9:10  │ ├────────────────────────────────────────────┤
│ │ HD-12                   │ │        Ticket conversation                 │
│ │ Locked out after …      │ │ ┌ customer message ┐                       │
│ │ [Open][High][Due in 12h]│ │ └──────────────────┘   ┌ agent reply ┐     │
│ │ [Unassigned]            │ │                                            │
│ └─────────────────────────┘ │                        └─────────────┘     │
│ … more tickets              ├────────────────────────────────────────────┤
│ [← Newer] Page 1 of 2 [Old→]│ [Reply to Rohan…                ] [Send →] │
│                             │ "Assign this ticket to yourself to reply." │
└─────────────────────────────┴────────────────────────────────────────────┘
  Show: All accessible · My tickets · Unassigned. Controls that the rules do not
  allow are disabled with a one-line reason (D-10, D-11).
  The selected ticket's header also shows its SLA badge. Badges: Due in 12h ·
  Due soon · in 4h · Overdue by 3h · Met · Missed · No SLA. Older tickets show No SLA
  and no due date.
```

## Admin overview

```
┌────────────┬────────────┬────────────┬────────────┐
│ Total      │ Open       │ In Progress│ Resolved   │   + Unassigned
└────────────┴────────────┴────────────┴────────────┘
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│ Unresolved by    │ │ Tickets by       │ │ Agent workload       │
│ priority         │ │ category (top 5) │ │ (top 5): open / in   │
│ ▇▇▇ High      4  │ │ ▇▇▇▇▇ Billing 14 │ │ progress / resolved  │
│ [Manage Tickets] │ │ [Manage Categ.]  │ │ [Manage Users]       │
└──────────────────┘ └──────────────────┘ └──────────────────────┘
```

## Admin tickets

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Total Tickets│ Open         │ In Progress  │ Resolved     │
└──────────────┴──────────────┴──────────────┴──────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│ Search [________] Status [All ▾] Priority [All ▾] Category [All ▾]       │
│ Assignee [All Assignees ▾ / Unassigned / each agent / admins]            │
├──────────────────────────────────────────────────────────────────────────┤
│ All Support Tickets                                            32 tickets│
│ Ticket         Customer      Category  Priority  Status / SLA  Agent      │
│ HD-12 Locked … Rohan Kapoor  Account   [High]    [Open]        Unassigned [Manage]│
│                                                  [Due in 12h]             │
│ …                                                                        │
│                     [← Newer]   Page 1 of 2   [Older →]                  │
└──────────────────────────────────────────────────────────────────────────┘

Ticket dialog ([Manage] or a ?ticket= link):
┌──────────────────────────────────────────────┐
│ HD-12                                     [✕]│
│ Locked out after resetting my password       │
│ Customer · Created · Category · Priority     │
│ SLA [Due in 12h]   Due Oct 30, 2026 · 09:10  │
│ Issue Description  [ … ]                     │
│ Assign Agent [Unassigned ▾]  Ticket Status [Open ▾] │
│ "Assign the ticket before starting work."    │
│ ▾ Status history · 1 entry                   │
│   ● Open  Oct 29, 2026 · 09:10 by Rohan …    │
│                                      [Done]  │
└──────────────────────────────────────────────┘
```

## Admin users

```
┌──────────────┬──────────────┬────────────────┬──────────────┐
│ Total Users  │ Customers    │ Support Agents │ Active Users │
└──────────────┴──────────────┴────────────────┴──────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│ User Directory — View and manage registered users                        │
│ Search Users [Search name or email…]  [All Roles ▾]  [All Statuses ▾]    │
├──────────────────────────────────────────────────────────────────────────┤
│ User                     Role       Status    Tickets  Joined   Action    │
│ Rohan Kapoor  rohan@…    Customer   Active    2        Oct 15   [Manage]  │
│ Sara Thomas   sara@…     Agent      Active    3        Oct 15   [Manage]  │
└──────────────────────────────────────────────────────────────────────────┘
  Manage dialog: Role (Customer / Agent / Admin), Account Status (Active /
  Inactive), [Done]. Own account and the last active admin are protected.
```

## Admin categories

```
┌──────────────────────────────┐  ┌──────────────────────────────────────────┐
│ Add New Category             │  │ Ticket Categories                        │
│ Category Name                │  │ Manage categories available to customers │
│ [e.g. Data & Privacy       ] │  │ Account & Login  Active   [Rename] [Deactivate]│
│ Description                  │  │ Billing          Active   [Rename] [Deactivate]│
│ [Briefly describe this …   ] │  │ Retired          Inactive [Rename] [Activate]  │
│ [Add category]               │  │ Deactivated categories stay on existing  │
└──────────────────────────────┘  │ tickets but are not offered for new ones.│
                                  └──────────────────────────────────────────┘
  Rename opens "Rename Category" with [Cancel]. Names are unique ignoring case.
```

## Admin reports

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Support Performance — Based on ticket creation date    [Last 30 Days ▾]  │
│ Custom only: Start [__] End [__] [Apply]; both dates included, your zone │
│ Showing: Last 30 Days, since Sep 30, 2026 · 09:10                        │
├────────────┬────────────┬────────────┬────────────┬──────────────────────┤
│ Total      │ Open       │ In Progress│ Resolved   │ Unassigned           │
├────────────┴────────────┴───┬────────┴────────────┴──────────────────────┤
│ Tickets by Status           │ Tickets by Priority                        │
│ Open        ▇▇▇▇  30 · 68%  │ High        ▇▇▇   21 · 47.7%               │
├─────────────────────────────┴────────────────────────────────────────────┤
│ Tickets by Category (most first)   Billing ▇▇▇▇▇▇  39 · 88.6%            │
├──────────────────────────────────────────────────────────────────────────┤
│ Average Resolution Time   6h   across 13 resolved tickets                │
├──────────────────────────────────────────────────────────────────────────┤
│ SLA Performance   Compliance 40%  Met ÷ (Met + Missed), across 5 tickets │
│ Resolved: Met · Missed                                                   │
│ Unresolved (as of a time): Due · Due soon · Overdue      No SLA: count   │
├──────────────────────────────────────────────────────────────────────────┤
│ Agent Performance: assigned and resolved per person                      │
├──────────────────────────────────────────────────────────────────────────┤
│ Export: tickets in the selected range                     [Export CSV]   │
└──────────────────────────────────────────────────────────────────────────┘
  Periods: Last 7, 30 or 90 Days, All Time, Custom. A failed request shows an
  error, Try again and "—", never 0. A range with no tickets shows real zeros and
  "No tickets in this period". While refreshing, the old figures stay, dimmed.
```

## Small screens

On phones (about 390 px wide) every screen stacks into one column: filters above lists, the Inbox list above the selected ticket, tables scroll sideways inside their card, and dialogs fill the width and scroll. No page scrolls sideways (checked in a real browser at 390 px for the staff ticket views, Agent Inbox and Admin Tickets with SLA badges, Reports, New Ticket and admin Categories; not every screen has been checked at this width).
