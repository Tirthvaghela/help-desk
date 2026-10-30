// The staff dashboards keep their current page in the address (?page=…), so a refresh, a
// shared link and the browser's Back/Forward all show the same page. The URL is the only
// source of truth: the dashboards read the page from it and change it to navigate.
//
//   ?page=Users                 that page (unknown or missing values → the first page)
//   ?ticket=<id>                a ticket link: opens `ticketPage` unless ?page= names another
//   other parameters            always kept

// The page to show for these search params. `pages[0]` is the default (Overview).
export function pageFromSearch(params, pages, { ticketPage } = {}) {
  const page = params.get("page");
  if (pages.includes(page)) return page;
  if (ticketPage && params.get("ticket")) return ticketPage;
  return pages[0];
}

// Search params for showing `page`, starting from the current ones. The default page has no
// ?page= (clean address). `ticket` is set when given; otherwise it is dropped only when moving
// to a different page, since a ticket link belongs to the page it was opened on.
export function searchForPage(params, page, pages, { ticket, ticketPage } = {}) {
  const next = new URLSearchParams(params);
  const current = pageFromSearch(params, pages, { ticketPage });
  if (page === pages[0]) next.delete("page");
  else next.set("page", page);
  if (ticket) next.set("ticket", ticket);
  else if (page !== current) next.delete("ticket");
  return next;
}

// True when navigating would not change the address (so no duplicate history entry is made).
export function sameSearch(a, b) {
  const sorted = (params) => [...new URLSearchParams(params)].map(([k, v]) => `${k}=${v}`).sort().join("&");
  return sorted(a) === sorted(b);
}
