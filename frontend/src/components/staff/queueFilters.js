// Filters for the staff ticket queues (GET /api/tickets, API contract §7). The backend scopes
// every query (agents: unassigned tickets and their own; admins: all), so these only choose
// what to ask for within that scope. "all" is never sent (see queryString).

// The agent's assignment views. "All accessible" is the agent's whole scope, which never
// includes another agent's tickets.
export const AGENT_ASSIGNEE_OPTIONS = Object.freeze([
  { value: "all", label: "All accessible" },
  { value: "me", label: "My tickets" },
  { value: "unassigned", label: "Unassigned" },
]);

// The `assignee` parameter for an agent's choice. Agents never send a user id; anything
// unexpected falls back to the whole scope.
export function agentAssigneeParam(choice) {
  return choice === "me" || choice === "unassigned" ? choice : undefined;
}

// The `assignee` parameter for an admin's choice: "unassigned", the id of a listed staff
// member, or nothing (all assignees).
export function adminAssigneeParam(choice, staff) {
  if (choice === "unassigned") return choice;
  return staff?.some((member) => member.id === choice) ? choice : undefined;
}

// The `category` parameter: the id of a listed category, or nothing (all categories).
export function categoryParam(choice, categories) {
  return categories?.some((category) => category.id === choice) ? choice : undefined;
}

// A list page belongs to the filters it was chosen under. Keep { key, page } in state and
// read it through pagingFor: when any filter changes the list starts again at page 1 in the
// same render, so the old page is never requested with the new filters. Store the result
// back when it differs, so returning to earlier filters does not bring back their old page.
export function filterKey(filters) {
  return JSON.stringify(Object.keys(filters).sort().map((key) => [key, filters[key] ?? null]));
}

export function pagingFor(paging, key) {
  return paging.key === key ? paging : { key, page: 1 };
}
