/** The error helpers: the readable message and the no-grant refusal test. */
import { describe, expect, it } from 'vitest';

import { errorMessage, isForbiddenError } from './errors';

describe('isForbiddenError', () => {
  it('is true for a 403', () => {
    expect(isForbiddenError({ status: 403 })).toBe(true);
    expect(isForbiddenError(Object.assign(new Error('forbidden'), { status: 403 }))).toBe(true);
  });

  it('is false for 401, 404, 501 and non-objects', () => {
    expect(isForbiddenError({ status: 401 })).toBe(false);
    expect(isForbiddenError(Object.assign(new Error('missing'), { status: 404 }))).toBe(false);
    expect(isForbiddenError({ status: 501 })).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
    expect(isForbiddenError('403')).toBe(false);
    expect(isForbiddenError(403)).toBe(false);
  });
});

describe('errorMessage', () => {
  it('reads an Error, a string and anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(42)).toBe('An unexpected error occurred.');
  });
});
