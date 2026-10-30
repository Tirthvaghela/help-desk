import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryString } from '../src/api/client.js';
import {
  AGENT_ASSIGNEE_OPTIONS,
  adminAssigneeParam,
  agentAssigneeParam,
  categoryParam,
  filterKey,
  pagingFor,
} from '../src/components/staff/queueFilters.js';

// C-1: category and assignee filters on the staff queues. The backend scopes every query
// (agents: unassigned + their own), so these check what the screens ask for.

const STAFF = [
  { id: 'a1', name: 'Agent One', role: 'agent' },
  { id: 'a2', name: 'Agent Two', role: 'agent' },
  { id: 'ad', name: 'Admin', role: 'admin' },
];
const CATEGORIES = [
  { id: 'c1', name: 'Billing', isActive: true },
  { id: 'c2', name: 'Legacy', isActive: false },
];

describe('agent assignment filter', () => {
  it('offers All accessible, My tickets and Unassigned', () => {
    assert.deepEqual(
      AGENT_ASSIGNEE_OPTIONS.map((option) => [option.value, option.label]),
      [['all', 'All accessible'], ['me', 'My tickets'], ['unassigned', 'Unassigned']],
    );
  });

  it('maps each option to the backend parameter; All accessible sends none (the whole scope)', () => {
    assert.equal(agentAssigneeParam('me'), 'me');
    assert.equal(agentAssigneeParam('unassigned'), 'unassigned');
    assert.equal(agentAssigneeParam('all'), undefined);
    assert.equal(queryString({ assignee: agentAssigneeParam('all') }), '');
  });

  it('never sends a user id, so an agent cannot ask for another agent\'s tickets', () => {
    for (const choice of ['a2', 'ad', 'u42', '', null, undefined, 'ME', 'mine', '__proto__']) {
      assert.equal(agentAssigneeParam(choice), undefined, String(choice));
    }
  });
});

describe('admin assignee filter', () => {
  it('sends unassigned, or the id of a listed staff member (agent or admin)', () => {
    assert.equal(adminAssigneeParam('unassigned', STAFF), 'unassigned');
    assert.equal(adminAssigneeParam('a2', STAFF), 'a2');
    assert.equal(adminAssigneeParam('ad', STAFF), 'ad');
  });

  it('All assignees, unknown ids, and a staff list that has not loaded send nothing', () => {
    assert.equal(adminAssigneeParam('all', STAFF), undefined);
    assert.equal(adminAssigneeParam('u42', STAFF), undefined);
    assert.equal(adminAssigneeParam('a1', null), undefined);
    assert.equal(adminAssigneeParam('unassigned', null), 'unassigned', 'needs no staff list');
  });
});

describe('category filter', () => {
  it('sends the id of a listed category, active or not', () => {
    assert.equal(categoryParam('c1', CATEGORIES), 'c1');
    assert.equal(categoryParam('c2', CATEGORIES), 'c2');
  });

  it('All categories, unknown ids and an unloaded list send nothing', () => {
    assert.equal(categoryParam('all', CATEGORIES), undefined);
    assert.equal(categoryParam('c9', CATEGORIES), undefined);
    assert.equal(categoryParam('c1', undefined), undefined);
  });
});

describe('paging under filters', () => {
  const base = { status: 'open', priority: 'all', category: undefined, assignee: 'me', q: '' };

  // What the screens do on each render: read the paging for the current filters and store it
  // back when it differs. Returns the page that render requests.
  function screen(initialFilters) {
    let stored = { key: filterKey(initialFilters), page: 1 };
    return {
      render(filters) {
        const paging = pagingFor(stored, filterKey(filters));
        if (paging !== stored) stored = paging;
        return paging.page;
      },
      goToPage(filters, page) {
        stored = { key: filterKey(filters), page };
      },
    };
  }

  it('keeps the chosen page while the filters stay the same', () => {
    const key = filterKey(base);
    const paging = { key, page: 3 };
    assert.equal(pagingFor(paging, key), paging, 'same object: nothing to store');
    assert.equal(filterKey({ ...base }), key, 'same filters, same key');
    assert.equal(filterKey({ q: '', assignee: 'me', category: undefined, priority: 'all', status: 'open' }), key, 'key order does not matter');
  });

  it('returns to page 1 when any filter changes, alone or combined with others', () => {
    const paging = { key: filterKey(base), page: 3 };
    const changes = [
      { category: 'c1' },
      { assignee: 'unassigned' },
      { assignee: undefined },
      { status: 'resolved' },
      { priority: 'high' },
      { q: 'printer' },
      { category: 'c1', q: 'printer', priority: 'high' },
    ];
    for (const change of changes) {
      const key = filterKey({ ...base, ...change });
      assert.deepEqual(pagingFor(paging, key), { key, page: 1 }, JSON.stringify(change));
    }
  });

  // Regression (D-C1-1): the page shown for new filters was 1, but the stored page stayed 2,
  // so changing the filter back (or clearing the search) showed page 2 again.
  it('changing a filter and changing it back stays on page 1 both times', () => {
    const list = screen(base);
    list.goToPage(base, 2);
    assert.equal(list.render(base), 2, 'on page 2');
    assert.equal(list.render({ ...base, assignee: 'unassigned' }), 1, 'filter changed');
    assert.equal(list.render(base), 1, 'filter changed back');
    assert.equal(list.render(base), 1, 'and stays there');
  });

  it('typing a search and clearing it stays on page 1', () => {
    const list = screen(base);
    list.goToPage(base, 2);
    assert.equal(list.render({ ...base, q: 'printer' }), 1, 'search typed');
    assert.equal(list.render(base), 1, 'search cleared');
  });

  it('returning to an earlier combination of several filters starts at page 1', () => {
    const earlier = { ...base, category: 'c1', priority: 'high' };
    const list = screen(earlier);
    list.goToPage(earlier, 3);
    assert.equal(list.render({ ...earlier, status: 'resolved' }), 1);
    assert.equal(list.render({ ...earlier, status: 'resolved', q: 'x' }), 1);
    assert.equal(list.render(earlier), 1, 'back to the earlier combination');
  });

  it('a page chosen under the new filters is kept until the filters change again', () => {
    const list = screen(base);
    const filtered = { ...base, category: 'c1' };
    assert.equal(list.render(filtered), 1);
    list.goToPage(filtered, 2);
    assert.equal(list.render(filtered), 2);
    assert.equal(list.render(base), 1);
  });
});
