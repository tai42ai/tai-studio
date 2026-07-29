/**
 * The marketplace filter set lives in the URL search params — the single source
 * of truth is the SDK route contract, so the filter type is DERIVED from
 * `PageProps<'marketplace'>['search']`. These helpers project that search state
 * onto the api-client query shape and merge partial edits back into a full
 * search object for `navigate`.
 */
import type { PageProps } from '@tai42/studio-sdk';
import type { MarketplaceSearchQuery } from '@tai42/api-client';

/** The full marketplace route search state (tab + drill-in plugin + filters). */
export type MarketplaceSearch = PageProps<'marketplace'>['search'];

export type MarketplaceTabId = 'browse' | 'installed';

export function activeTab(search: MarketplaceSearch): MarketplaceTabId {
  return search.tab ?? 'browse';
}

/**
 * The search-request filter set. `page` is supplied per-request by the infinite
 * query, not from the URL, so it is intentionally absent here.
 */
export function searchParams(search: MarketplaceSearch): MarketplaceSearchQuery {
  return {
    q: search.q,
    kind: search.kind,
    category: search.category,
    tags: search.tags,
    // `relevance` is only valid with a query string (the route rejects it with
    // a 400 otherwise), so a stale relevance sort is dropped when `q` is unset.
    sort: search.sort === 'relevance' && !search.q ? undefined : search.sort,
  };
}

/** Merge a partial edit into the current search, dropping keys set to `undefined`. */
export function mergeSearch(
  current: MarketplaceSearch,
  patch: Partial<MarketplaceSearch>,
): MarketplaceSearch {
  const merged: Record<string, unknown> = { ...current, ...patch };
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(merged)) {
    if (merged[key] !== undefined) next[key] = merged[key];
  }
  return next;
}
