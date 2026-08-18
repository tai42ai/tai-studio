/**
 * The URL contract. Neither a `thread` without its `route` nor a blank value
 * names anything the API can be asked for, so both are repaired away in one
 * pass; every legal search is returned by IDENTITY, which is what lets the page
 * fire its repair navigation at most once.
 */
import { describe, expect, it } from 'vitest';

import { mergeSearch, sanitizeSearch, textQuery, threadFilters } from './search';

describe('sanitizeSearch', () => {
  it('returns the same reference for a legal search', () => {
    const empty = {};
    expect(sanitizeSearch(empty)).toBe(empty);
    const routeOnly = { route: 'chat' };
    expect(sanitizeSearch(routeOnly)).toBe(routeOnly);
    const both = { route: 'chat', thread: 't1' };
    expect(sanitizeSearch(both)).toBe(both);
    const filtered = { route: 'chat', status: 'failed' as const, address: 'ana', q: 'widget' };
    expect(sanitizeSearch(filtered)).toBe(filtered);
  });

  it('keeps the filters when a route scopes them', () => {
    const filtered = { route: 'chat', status: 'delivered' as const, address: '+1555', q: 'widget' };
    expect(sanitizeSearch(filtered)).toEqual(filtered);
  });

  it('drops every filter that names no route, in ONE pass', () => {
    const once = sanitizeSearch({ status: 'failed', address: 'ana', q: 'widget' });
    expect(once).toEqual({});
    expect(sanitizeSearch(once)).toBe(once);
  });

  it('reads a blank address / q as absent', () => {
    expect(sanitizeSearch({ route: 'chat', address: '  ', q: '' })).toEqual({ route: 'chat' });
  });

  it('drops a thread that names no route', () => {
    expect(sanitizeSearch({ thread: 't1' })).toEqual({ route: undefined, thread: undefined });
  });

  it('reads a blank value as absent, whitespace included', () => {
    expect(sanitizeSearch({ route: '' })).toEqual({ route: undefined, thread: undefined });
    expect(sanitizeSearch({ route: 'chat', thread: '' })).toEqual({
      route: 'chat',
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

describe('threadFilters', () => {
  it('projects status + address onto the api-client query shape', () => {
    expect(threadFilters({ route: 'chat', status: 'failed', address: 'ana' })).toEqual({
      status: 'failed',
      address: 'ana',
    });
  });

  it('reads a blank address as absent', () => {
    expect(threadFilters({ route: 'chat', address: '   ' })).toEqual({
      status: undefined,
      address: undefined,
    });
  });
});

describe('textQuery', () => {
  it('returns the needle when set, undefined when blank/absent', () => {
    expect(textQuery({ route: 'chat', q: 'widget' })).toBe('widget');
    expect(textQuery({ route: 'chat', q: '   ' })).toBeUndefined();
    expect(textQuery({ route: 'chat' })).toBeUndefined();
  });
});

describe('mergeSearch', () => {
  it('merges a partial edit and drops keys set to undefined', () => {
    expect(
      mergeSearch({ route: 'chat', status: 'failed' }, { status: undefined, q: 'hi' }),
    ).toEqual({ route: 'chat', q: 'hi' });
  });
});
