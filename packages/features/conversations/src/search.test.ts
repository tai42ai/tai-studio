/**
 * The URL contract. Neither a `thread` without its `route` nor a blank value
 * names anything the API can be asked for, so both are repaired away in one
 * pass; every legal search is returned by IDENTITY, which is what lets the page
 * fire its repair navigation at most once.
 */
import { describe, expect, it } from 'vitest';

import { sanitizeSearch } from './search';

describe('sanitizeSearch', () => {
  it('returns the same reference for a legal search', () => {
    const empty = {};
    expect(sanitizeSearch(empty)).toBe(empty);
    const routeOnly = { route: 'support' };
    expect(sanitizeSearch(routeOnly)).toBe(routeOnly);
    const both = { route: 'support', thread: 't1' };
    expect(sanitizeSearch(both)).toBe(both);
  });

  it('drops a thread that names no route', () => {
    expect(sanitizeSearch({ thread: 't1' })).toEqual({ route: undefined, thread: undefined });
  });

  it('reads a blank value as absent, whitespace included', () => {
    expect(sanitizeSearch({ route: '' })).toEqual({ route: undefined, thread: undefined });
    expect(sanitizeSearch({ route: 'support', thread: '' })).toEqual({
      route: 'support',
      thread: undefined,
    });
    expect(sanitizeSearch({ route: '  ', thread: 't1' })).toEqual({
      route: undefined,
      thread: undefined,
    });
  });

  it('repairs a blank route and its orphaned thread in ONE pass', () => {
    // The repaired result must itself need no further repair, or the page would
    // navigate twice.
    const once = sanitizeSearch({ route: '', thread: 't1' });
    expect(once).toEqual({ route: undefined, thread: undefined });
    expect(sanitizeSearch(once)).toBe(once);
  });

  it('keeps a value whose spaces are part of the name', () => {
    const spaced = { route: 'a b', thread: ' t 1 ' };
    expect(sanitizeSearch(spaced)).toBe(spaced);
  });
});
