/**
 * The URL-search projections that feed the two api-client query shapes and merge
 * partial edits back into a full search object. The single source of truth is the
 * route search state, so these pin the exact mapping and the undefined-dropping.
 */
import type { ObservabilityCapabilities } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import {
  activeTab,
  hasIncompatibleFilter,
  incompatibleFilters,
  isSortServed,
  mergeSearch,
  metricsParams,
  type ObservabilitySearch,
  rangeToPatch,
  runsParams,
  sanitizeSearch,
  searchToRange,
} from './filters';

describe('activeTab', () => {
  it('defaults to the dashboard when no tab is set', () => {
    expect(activeTab({})).toBe('dashboard');
  });

  it('returns the explicit tab when present', () => {
    expect(activeTab({ tab: 'tracing' })).toBe('tracing');
    expect(activeTab({ tab: 'dashboard' })).toBe('dashboard');
  });
});

describe('metricsParams', () => {
  it('carries the window from the search and the caller-supplied granularity', () => {
    expect(metricsParams({ from: '2026-01-01', to: '2026-02-01' }, 'day')).toEqual({
      from: '2026-01-01',
      to: '2026-02-01',
      granularity: 'day',
    });
  });

  it('passes an undefined granularity through unchanged', () => {
    expect(metricsParams({ from: '2026-01-01' }, undefined)).toEqual({
      from: '2026-01-01',
      to: undefined,
      granularity: undefined,
    });
  });
});

describe('runsParams', () => {
  it('projects only the runs-table filter keys, dropping tab/trace and page', () => {
    const search: ObservabilitySearch = {
      tab: 'tracing',
      trace: 't1',
      from: '2026-01-01',
      to: '2026-02-01',
      tags: ['alpha', 'beta'],
      status: 'error',
      minCost: 1,
      maxCost: 9,
      minTokens: 10,
      maxTokens: 90,
      minLatencyMs: 100,
      maxLatencyMs: 900,
      sort: 'cost',
      dir: 'desc',
    };
    expect(runsParams(search)).toEqual({
      from: '2026-01-01',
      to: '2026-02-01',
      tags: ['alpha', 'beta'],
      status: 'error',
      minCost: 1,
      maxCost: 9,
      minTokens: 10,
      maxTokens: 90,
      minLatencyMs: 100,
      maxLatencyMs: 900,
      sort: 'cost',
      dir: 'desc',
    });
    expect(runsParams(search)).not.toHaveProperty('tab');
    expect(runsParams(search)).not.toHaveProperty('trace');
    expect(runsParams(search)).not.toHaveProperty('page');
  });
});

describe('mergeSearch', () => {
  it('overlays the patch onto the current search', () => {
    expect(mergeSearch({ tab: 'dashboard', status: 'error' }, { minCost: 5 })).toEqual({
      tab: 'dashboard',
      status: 'error',
      minCost: 5,
    });
  });

  it('overwrites an existing key with the patched value', () => {
    expect(mergeSearch({ tab: 'dashboard' }, { tab: 'tracing' })).toEqual({ tab: 'tracing' });
  });

  it('drops keys the patch sets to undefined', () => {
    const merged = mergeSearch({ tab: 'tracing', trace: 't1' }, { trace: undefined });
    expect(merged).toEqual({ tab: 'tracing' });
    expect(merged).not.toHaveProperty('trace');
  });
});

/**
 * An arbitrary served declaration: nothing in it matches any one backend, so a
 * passing suite proves the helpers read the served map and no built-in constant.
 * Here the TIME sort is the one that cannot carry the tags filter, and the metric
 * sorts combine with everything.
 */
const CAP: ObservabilityCapabilities = {
  pageSizeMax: 25,
  sortKeys: ['createdAt', 'cost'],
  incompatibleFilters: { createdAt: ['tags', 'user'] },
  metrics: { measures: [], dimensions: [] },
};

describe('isSortServed / incompatibleFilters / hasIncompatibleFilter', () => {
  it('serves only the declared sort keys', () => {
    expect(isSortServed(CAP, 'createdAt')).toBe(true);
    expect(isSortServed(CAP, 'cost')).toBe(true);
    expect(isSortServed(CAP, 'latencyMs')).toBe(false);
    expect(isSortServed(CAP, 'totalTokens')).toBe(false);
  });

  it('reads the filters a sort cannot carry from the served map', () => {
    expect(incompatibleFilters(CAP, 'createdAt')).toEqual(['tags', 'user']);
    expect(incompatibleFilters(CAP, 'cost')).toEqual([]);
    expect(incompatibleFilters(CAP, undefined)).toEqual([]);
  });

  it('detects a set filter the sort cannot carry, ignoring every other filter', () => {
    expect(hasIncompatibleFilter({ tags: ['x'] }, CAP, 'createdAt')).toBe(true);
    expect(hasIncompatibleFilter({ minCost: 1, status: 'error' }, CAP, 'createdAt')).toBe(false);
    expect(hasIncompatibleFilter({ tags: ['x'] }, CAP, 'cost')).toBe(false);
    expect(hasIncompatibleFilter({}, CAP, 'createdAt')).toBe(false);
  });
});

describe('sanitizeSearch', () => {
  it('drops the sort (and its direction) when the served map says it cannot carry a set filter', () => {
    const cleaned = sanitizeSearch(
      { tab: 'tracing', sort: 'createdAt', dir: 'asc', tags: ['x'] },
      CAP,
    );
    expect(cleaned).toEqual({ tab: 'tracing', tags: ['x'] });
    expect(cleaned).not.toHaveProperty('sort');
    expect(cleaned).not.toHaveProperty('dir');
  });

  it('keeps a sort the served map lets combine with every set filter', () => {
    const search: ObservabilitySearch = {
      tab: 'tracing',
      sort: 'cost',
      dir: 'desc',
      minCost: 5,
      status: 'error',
      tags: ['x'],
    };
    expect(sanitizeSearch(search, CAP)).toBe(search);
  });

  it('returns the same reference when nothing needs repair', () => {
    const search: ObservabilitySearch = { tab: 'tracing', sort: 'createdAt', status: 'error' };
    expect(sanitizeSearch(search, CAP)).toBe(search);
  });
});

describe('searchToRange', () => {
  it('mirrors the backend 30d default when no window is set', () => {
    expect(searchToRange({})).toEqual({ kind: 'relative', token: '30d' });
  });

  it('reads a relative token in `from` as a relative window', () => {
    expect(searchToRange({ from: '7d' })).toEqual({ kind: 'relative', token: '7d' });
  });

  it('reads an ISO `from`/`to` as an absolute window', () => {
    expect(searchToRange({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' })).toEqual({
      kind: 'absolute',
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
    });
  });

  it('shows an absolute `from` with no `to` against the injected now', () => {
    const now = new Date('2026-08-02T00:00:00Z');
    expect(searchToRange({ from: '2026-01-01T00:00:00Z' }, () => now)).toEqual({
      kind: 'absolute',
      from: '2026-01-01T00:00:00Z',
      to: now.toISOString(),
    });
  });
});

describe('rangeToPatch', () => {
  it('carries a relative token in `from` and clears `to`', () => {
    expect(rangeToPatch({ kind: 'relative', token: '24h' })).toEqual({
      from: '24h',
      to: undefined,
    });
  });

  it('carries both instants for an absolute window', () => {
    expect(
      rangeToPatch({ kind: 'absolute', from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }),
    ).toEqual({ from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' });
  });
});
