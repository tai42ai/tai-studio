import { describe, expect, it } from 'vitest';

import { isEmptyResult } from './empty-result';

describe('isEmptyResult', () => {
  it.each([undefined, null, '', '   \n', [], {}])('calls %j empty', (value) => {
    expect(isEmptyResult(value)).toBe(true);
  });

  it.each([0, false, 'ok', [null], { a: null }])('calls %j a value', (value) => {
    expect(isEmptyResult(value)).toBe(false);
  });
});
