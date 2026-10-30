import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CATEGORY_UNAVAILABLE_MESSAGE,
  INACTIVE_CATEGORY_API_MESSAGE,
  isInactiveCategoryError,
} from '../src/pages/customer/validation.js';

// The New Ticket page's category messages. The page's behaviour is covered by the browser checks.

const source = (path) => readFileSync(join(import.meta.dirname, '..', path), 'utf8');
const inactive = { status: 400, code: 'VALIDATION_ERROR', message: INACTIVE_CATEGORY_API_MESSAGE };

describe('a category deactivated while the form is open', () => {
  it('recognises the API response for an inactive category', () => {
    assert.equal(isInactiveCategoryError(inactive), true);
  });

  it('does not mistake any other failure for it', () => {
    for (const error of [
      null,
      undefined,
      {},
      { ...inactive, status: 500 },
      { ...inactive, code: 'INVALID_ID' },
      { ...inactive, message: 'categoryId is required' },
      { status: 400, code: 'VALIDATION_ERROR', message: 'subject must be at least 5 characters' },
      { code: 'NETWORK_ERROR', message: 'Cannot reach the server.' },
    ]) {
      assert.equal(isInactiveCategoryError(error), false, JSON.stringify(error));
    }
  });

  // There is no dedicated error code, so the two sides must keep the same text. If the backend
  // wording changes, this fails; the page would then show the server's message instead.
  it('matches the message the backend actually sends', () => {
    const controller = source('../backend/src/controllers/customerTicket.controller.js');
    assert.ok(controller.includes(`ApiError.badRequest("${INACTIVE_CATEGORY_API_MESSAGE}")`));
  });

  it('tells the customer in plain words, without the internal field name', () => {
    assert.equal(CATEGORY_UNAVAILABLE_MESSAGE, 'That category is no longer available. Choose another one.');
    assert.doesNotMatch(CATEGORY_UNAVAILABLE_MESSAGE, /categoryId/);
  });

  it('the page clears the choice, shows the field error and reloads the list', () => {
    const page = source('src/pages/customer/NewTicket.jsx');
    const handler = page.slice(page.indexOf('isInactiveCategoryError(createError)'), page.indexOf('setError(ticketErrorMessage(createError'));
    assert.match(handler, /categoryId: ""/);
    assert.match(handler, /setFieldErrors\(\{ categoryId: CATEGORY_UNAVAILABLE_MESSAGE \}\)/);
    assert.match(handler, /categories\.reload\(\)/);
  });
});

describe('no categories available', () => {
  it('states the situation, with the approved wording, and not "set up yet"', () => {
    const page = source('src/pages/customer/NewTicket.jsx');
    assert.ok(page.includes("No ticket categories are available right now, so tickets can't be raised. Please try again later."));
    assert.ok(!page.includes("haven't been set up yet"));
  });
});
