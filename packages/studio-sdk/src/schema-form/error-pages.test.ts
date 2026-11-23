import { describe, expect, it } from 'vitest';

import { errorPathField, firstPageWithError } from './error-pages';

describe('errorPathField', () => {
  it('maps a nested error path to its top-level field', () => {
    expect(errorPathField('name')).toBe('name');
    expect(errorPathField('addr.city')).toBe('addr');
    expect(errorPathField('items[0].label')).toBe('items');
    expect(errorPathField('')).toBe('');
  });
});

describe('firstPageWithError', () => {
  it('returns the index of the first page carrying an errored field (nested paths included)', () => {
    const pages = [{ fields: ['name'] }, { fields: ['addr'] }];
    expect(firstPageWithError(pages, { 'addr.city': 'required' })).toBe(1);
  });

  it('returns -1 when no page carries an errored field', () => {
    expect(firstPageWithError([{ fields: ['name'] }], { phone: 'required' })).toBe(-1);
  });
});
