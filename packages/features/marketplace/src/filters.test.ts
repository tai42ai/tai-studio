/**
 * The URL-search projections that feed the api-client search query and merge
 * partial edits back into a full search object. The single source of truth is the
 * route search state, so these pin the exact mapping, the relevance-drop rule,
 * and the undefined-dropping.
 */
import { describe, expect, it } from 'vitest';

import { activeTab, mergeSearch, searchParams, type MarketplaceSearch } from './filters';

describe('activeTab', () => {
  it('defaults to browse when no tab is set', () => {
    expect(activeTab({})).toBe('browse');
  });

  it('returns the explicit tab when present', () => {
    expect(activeTab({ tab: 'installed' })).toBe('installed');
    expect(activeTab({ tab: 'browse' })).toBe('browse');
  });
});

describe('searchParams', () => {
  it('projects the filter keys and never carries tab/plugin/page', () => {
    const search: MarketplaceSearch = {
      tab: 'browse',
      plugin: 'tai42/toolbox',
      q: 'uuid',
      kind: 'tool',
      category: 'productivity',
      tags: ['a', 'b'],
      sort: 'downloads',
    };
    const params = searchParams(search);
    expect(params).toEqual({
      q: 'uuid',
      kind: 'tool',
      category: 'productivity',
      tags: ['a', 'b'],
      sort: 'downloads',
    });
    expect(params).not.toHaveProperty('tab');
    expect(params).not.toHaveProperty('plugin');
    expect(params).not.toHaveProperty('page');
  });

  it('keeps sort=relevance when a query string is set', () => {
    expect(searchParams({ q: 'uuid', sort: 'relevance' }).sort).toBe('relevance');
  });

  it('drops a stale sort=relevance when the query string is unset', () => {
    expect(searchParams({ sort: 'relevance' }).sort).toBeUndefined();
  });
});

describe('mergeSearch', () => {
  it('overlays the patch onto the current search', () => {
    expect(mergeSearch({ tab: 'browse', kind: 'tool' }, { category: 'productivity' })).toEqual({
      tab: 'browse',
      kind: 'tool',
      category: 'productivity',
    });
  });

  it('overwrites an existing key with the patched value', () => {
    expect(mergeSearch({ tab: 'browse' }, { tab: 'installed' })).toEqual({ tab: 'installed' });
  });

  it('drops keys the patch sets to undefined', () => {
    const merged = mergeSearch({ tab: 'browse', plugin: 'tai42/toolbox' }, { plugin: undefined });
    expect(merged).toEqual({ tab: 'browse' });
    expect(merged).not.toHaveProperty('plugin');
  });
});
