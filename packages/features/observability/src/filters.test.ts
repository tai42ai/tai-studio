/**
 * The URL-search projections that feed the two api-client query shapes and merge
 * partial edits back into a full search object. The single source of truth is the
 * route search state, so these pin the exact mapping and the undefined-dropping.
 */
import { describe, expect, it } from 'vitest';

import {
  activeTab,
  hasMetricIncompatibleFilter,
  isMetricSort,
  mergeSearch,
  metricsParams,
  rangeToPatch,
  runsParams,
  sanitizeSearch,
  searchToRange,
  type ObservabilitySearch,
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

describe('isMetricSort / hasMetricIncompatibleFilter', () => {
  it('marks the globally-ranked metric sorts, but not the native timestamp sort', () => {
    expect(isMetricSort('cost')).toBe(true);
    expect(isMetricSort('latencyMs')).toBe(true);
    expect(isMetricSort('totalTokens')).toBe(true);
    expect(isMetricSort('createdAt')).toBe(false);
    expect(isMetricSort(undefined)).toBe(false);
  });

  it('detects any level/cost/token/latency filter, ignoring range/tags/sort', () => {
    expect(hasMetricIncompatibleFilter({ status: 'error' })).toBe(true);
    expect(hasMetricIncompatibleFilter({ minCost: 1 })).toBe(true);
    expect(hasMetricIncompatibleFilter({ maxLatencyMs: 900 })).toBe(true);
    expect(hasMetricIncompatibleFilter({ from: '7d', tags: ['x'], dir: 'asc' })).toBe(false);
    expect(hasMetricIncompatibleFilter({})).toBe(false);
  });
});

describe('sanitizeSearch', () => {
  it('drops a metric sort (and its direction) when an incompatible filter is set', () => {
    const cleaned = sanitizeSearch({ tab: 'tracing', sort: 'cost', dir: 'asc', minCost: 5 });
    expect(cleaned).toEqual({ tab: 'tracing', minCost: 5 });
    expect(cleaned).not.toHaveProperty('sort');
    expect(cleaned).not.toHaveProperty('dir');
  });

  it('keeps a metric sort with only range/tags set', () => {
    const search: ObservabilitySearch = {
      tab: 'tracing',
      sort: 'cost',
      dir: 'desc',
      from: '7d',
      tags: ['x'],
    };
    expect(sanitizeSearch(search)).toBe(search);
  });

  it('keeps the native timestamp sort alongside any filter', () => {
    const search: ObservabilitySearch = { sort: 'createdAt', dir: 'desc', minCost: 5 };
    expect(sanitizeSearch(search)).toBe(search);
  });

  it('returns the same reference when nothing needs repair', () => {
    const search: ObservabilitySearch = { tab: 'tracing', status: 'error' };
    expect(sanitizeSearch(search)).toBe(search);
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
