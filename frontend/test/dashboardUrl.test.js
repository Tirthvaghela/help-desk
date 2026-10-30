import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pageFromSearch, sameSearch, searchForPage } from '../src/components/staff/dashboardUrl.js';

// Regression (QA G1): the dashboards kept the page only in memory and removed ?page= and
// ?ticket= from the address, so a refresh always showed Overview and Back/Forward did nothing.

const ADMIN = ['Overview', 'Tickets', 'Users', 'Categories', 'Reports'];
const AGENT = ['Overview', 'Inbox'];
const params = (text) => new URLSearchParams(text);

describe('pageFromSearch', () => {
  it('reads a valid ?page=', () => {
    assert.equal(pageFromSearch(params('page=Users'), ADMIN), 'Users');
    assert.equal(pageFromSearch(params('page=Inbox'), AGENT), 'Inbox');
  });

  it('missing, empty, unknown or wrongly cased values give the default page', () => {
    for (const text of ['', 'page=', 'page=users', 'page=Admin', 'page=Inbox', 'page=%3Cscript%3E', 'other=1']) {
      assert.equal(pageFromSearch(params(text), ADMIN), 'Overview', text);
    }
    assert.equal(pageFromSearch(params('page=Users'), AGENT), 'Overview', 'admin page on the agent dashboard');
  });

  it('a ticket link opens the ticket page, unless ?page= names another valid page', () => {
    assert.equal(pageFromSearch(params('ticket=t1'), ADMIN, { ticketPage: 'Tickets' }), 'Tickets');
    assert.equal(pageFromSearch(params('ticket=t1'), AGENT, { ticketPage: 'Inbox' }), 'Inbox');
    assert.equal(pageFromSearch(params('ticket=t1&page=bogus'), AGENT, { ticketPage: 'Inbox' }), 'Inbox');
    assert.equal(pageFromSearch(params('ticket=t1&page=Users'), ADMIN, { ticketPage: 'Tickets' }), 'Users');
    assert.equal(pageFromSearch(params('ticket='), AGENT, { ticketPage: 'Inbox' }), 'Overview', 'empty ticket is no link');
  });
});

describe('searchForPage', () => {
  const opts = { ticketPage: 'Inbox' };

  it('sets ?page= for other pages and removes it for the default page', () => {
    assert.equal(searchForPage(params(''), 'Users', ADMIN).toString(), 'page=Users');
    assert.equal(searchForPage(params('page=Users'), 'Overview', ADMIN).toString(), '');
  });

  it('keeps unrelated parameters', () => {
    const next = searchForPage(params('utm=mail&page=Users&x=1'), 'Reports', ADMIN);
    assert.equal(next.get('page'), 'Reports');
    assert.equal(next.get('utm'), 'mail');
    assert.equal(next.get('x'), '1');
  });

  it('opening a ticket sets page and ticket and keeps other parameters', () => {
    const next = searchForPage(params('utm=mail'), 'Inbox', AGENT, { ...opts, ticket: 't9' });
    assert.deepEqual(Object.fromEntries(next), { utm: 'mail', page: 'Inbox', ticket: 't9' });
  });

  it('a ticket link survives staying on its page, and is dropped when moving to another page', () => {
    assert.equal(searchForPage(params('ticket=t1'), 'Inbox', AGENT, opts).get('ticket'), 't1');
    assert.equal(searchForPage(params('page=Inbox&ticket=t1'), 'Inbox', AGENT, opts).get('ticket'), 't1');
    const away = searchForPage(params('page=Inbox&ticket=t1&utm=mail'), 'Overview', AGENT, opts);
    assert.deepEqual(Object.fromEntries(away), { utm: 'mail' });
  });

  it('does not modify the params it was given', () => {
    const current = params('page=Users&ticket=t1');
    searchForPage(current, 'Overview', ADMIN, { ticketPage: 'Tickets' });
    assert.equal(current.toString(), 'page=Users&ticket=t1');
  });
});

describe('sameSearch (no duplicate history entries)', () => {
  it('ignores parameter order; detects real changes', () => {
    assert.equal(sameSearch(params('a=1&page=Users'), params('page=Users&a=1')), true);
    assert.equal(sameSearch(params('page=Users'), params('page=Reports')), false);
    assert.equal(sameSearch(params(''), params('')), true);
  });

  it('choosing the page already shown changes nothing', () => {
    const current = params('page=Users');
    assert.equal(sameSearch(searchForPage(current, 'Users', ADMIN), current), true);
    const overview = params('');
    assert.equal(sameSearch(searchForPage(overview, 'Overview', ADMIN), overview), true);
  });
});
