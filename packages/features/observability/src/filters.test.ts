/**
 * The URL-search projections that feed the two api-client query shapes and merge
 * partial edits back into a full search object. The single source of truth is the
 * route search state, so these pin the exact mapping and the undefined-dropping.
 */
import { describe, expect, it } from 'vitest';

import {
  activeTab,
  mergeSearch,
  metricsParams,
  runsParams,
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
