import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/utils/ApiError.js';
import { requireString, requireOneOf, requireEmail } from '../src/utils/validate.js';

// Asserts that fn throws a 400 VALIDATION_ERROR with the given message.
function assertValidationError(fn, message) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.message, message);
    return true;
  });
}

describe('requireString', () => {
  it('returns the trimmed value', () => {
    assert.equal(requireString('  Unable to reset password  ', 'subject'), 'Unable to reset password');
  });

  it('rejects missing, empty, whitespace-only and non-string values', () => {
    for (const value of [undefined, null, '', '   ', 42, {}]) {
      assertValidationError(() => requireString(value, 'subject'), 'subject is required');
    }
  });

  it('enforces min and max length after trimming', () => {
    assertValidationError(() => requireString(' ab ', 'name', { min: 3 }), 'name must be at least 3 characters');
    assertValidationError(() => requireString('abcdef', 'name', { max: 5 }), 'name must be at most 5 characters');
    assert.equal(requireString('abcde', 'name', { min: 5, max: 5 }), 'abcde');
  });
});

describe('requireOneOf', () => {
  const priorities = ['low', 'medium', 'high'];

  it('returns an allowed value', () => {
    assert.equal(requireOneOf('high', priorities, 'priority'), 'high');
  });

  it('rejects values outside the list, including different case', () => {
    for (const value of ['urgent', 'HIGH', undefined, '']) {
      assertValidationError(
        () => requireOneOf(value, priorities, 'priority'),
        'priority must be one of: low, medium, high',
      );
    }
  });
});

describe('requireEmail', () => {
  it('returns a trimmed, lower-cased email', () => {
    assert.equal(requireEmail('  Customer@Example.COM '), 'customer@example.com');
  });

  it('rejects missing and malformed emails', () => {
    assertValidationError(() => requireEmail(''), 'email is required');
    for (const value of ['plainaddress', 'a@b', 'a b@example.com', '@example.com']) {
      assertValidationError(() => requireEmail(value), 'email must be a valid email address');
    }
  });
});
