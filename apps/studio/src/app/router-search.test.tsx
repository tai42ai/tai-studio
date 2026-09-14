/**
 * The router's typed URL-search parsing, exercised through the built route tree:
 * each route's `validateSearch` (from `route-search`) lands its parsed shape on the
 * match, and a malformed hand-edited URL is tolerated rather than thrown.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from '@tanstack/react-router';
import type { RouteSearch } from '@tai42/studio-sdk';

import { buildRouter } from './router';
import { createPluginLoader } from './plugin-loader';

describe('observability search parsing', () => {
  async function loadObservabilitySearch(url: string): Promise<RouteSearch<'observability'>> {
    const loader = createPluginLoader({
      api: { listStudioPlugins: () => Promise.resolve([]) },
      importModule: () => Promise.resolve(undefined),
      loadStylesheet: () => Promise.resolve(() => undefined),
      onUnauthorized: () => undefined,
    });
    const router = buildRouter({
      plugins: loader,
      getAuth: () => ({
        token: 't',
        isAuthenticated: true,
        login: () => undefined,
        logout: () => undefined,
      }),
      history: createMemoryHistory({ initialEntries: [url] }),
    });
    await router.load();
    // Each route's `validateSearch` output lands on its match; the leaf match is
    // the observability route, whose `search` is the typed, parsed shape.
    const leaf = router.state.matches.at(-1);
    const search: unknown = leaf?.search;
    return search as RouteSearch<'observability'>;
  }

  it('parses a tab + filters URL into the typed search', async () => {
    const search = await loadObservabilitySearch(
      '/observability?tab=tracing&from=24h&to=2026-01-01T00:00:00Z&tags=a,b' +
        '&status=error&minCost=1.5&maxTokens=1000&minLatencyMs=50' +
        '&sort=cost&dir=asc&trace=t-123',
    );
    expect(search).toMatchObject({
      tab: 'tracing',
      from: '24h',
      to: '2026-01-01T00:00:00Z',
      tags: ['a', 'b'],
      status: 'error',
      minCost: 1.5,
      maxTokens: 1000,
      minLatencyMs: 50,
      sort: 'cost',
      dir: 'asc',
      trace: 't-123',
    });
  });

  it('accepts tags as a JSON array', async () => {
    const search = await loadObservabilitySearch('/observability?tags=["x","y"]');
    expect(search.tags).toEqual(['x', 'y']);
  });

  it('drops garbage numerics and invalid enums without throwing', async () => {
    const search = await loadObservabilitySearch(
      '/observability?tab=bogus&status=maybe&minCost=abc&sort=nope&dir=sideways',
    );
    expect(search.tab).toBeUndefined();
    expect(search.status).toBeUndefined();
    expect(search.minCost).toBeUndefined();
    expect(search.sort).toBeUndefined();
    expect(search.dir).toBeUndefined();
  });

  it('treats a bare /observability as valid empty search', async () => {
    const search = await loadObservabilitySearch('/observability');
    expect(search.tab).toBeUndefined();
    expect(search.tags).toBeUndefined();
    expect(search.trace).toBeUndefined();
  });
});
