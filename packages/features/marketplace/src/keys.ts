/**
 * TanStack Query key factory for the marketplace surface. All keys are
 * namespaced under `['marketplace', …]`. Search pages key on the full filter
 * set so a filter change is a distinct cache entry; the category list, the kind
 * list, and the advisory state are singletons. The plugin detail and the installed
 * list key on the SDK's shared keys.
 */
import type { MarketplaceSearchQuery } from '@tai42/api-client';

/** Key for one search result set, by its full filter set (page excluded). */
export const marketplaceSearchKey = (params: MarketplaceSearchQuery) =>
  ['marketplace', 'search', params] as const;

/** Key for the registry's controlled category list (the category facet). */
export const marketplaceCategoriesKey = ['marketplace', 'categories'] as const;

/** Key for the registry's controlled item-kind list (the kind facet). */
export const marketplaceKindsKey = ['marketplace', 'kinds'] as const;

/** Key for the advisory state covering installed plugins. */
export const marketplaceAdvisoriesKey = ['marketplace', 'advisories'] as const;
