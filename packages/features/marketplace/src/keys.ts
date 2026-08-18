/**
 * TanStack Query key factory for the marketplace surface. All keys are
 * namespaced under `['marketplace', …]`. Search pages key on the full filter
 * set so a filter change is a distinct cache entry; the installed list, the
 * category list, and the advisory state are singletons.
 */
import type { MarketplaceSearchQuery } from '@tai42/api-client';

/** Key for one search result set, by its full filter set (page excluded). */
export const marketplaceSearchKey = (params: MarketplaceSearchQuery) =>
  ['marketplace', 'search', params] as const;

/** Key for one plugin's detail, by its `namespace/name` ref. */
export function marketplacePluginKey(ref: string): readonly ['marketplace', 'plugin', string] {
  return ['marketplace', 'plugin', ref];
}

/**
 * Key for one install preview, by its ref, target version, and the serialized
 * base-override map. The mount key changes as the operator remaps a base, so each
 * remap is a distinct cache entry and the preview refetches for it.
 */
export function marketplacePreviewKey(
  ref: string,
  version: string | null,
  mounts: string,
): readonly ['marketplace', 'preview', string, string | null, string] {
  return ['marketplace', 'preview', ref, version, mounts];
}

/** Key for the installed-plugins list (the local attribution store). */
export const marketplaceInstalledKey = ['marketplace', 'installed'] as const;

/** Key for the registry's controlled category list (the category facet). */
export const marketplaceCategoriesKey = ['marketplace', 'categories'] as const;

/** Key for the registry's controlled item-kind list (the kind facet). */
export const marketplaceKindsKey = ['marketplace', 'kinds'] as const;

/** Key for the advisory state covering installed plugins. */
export const marketplaceAdvisoriesKey = ['marketplace', 'advisories'] as const;

/**
 * Key for the deployment env map (`GET /api/config/env` → `{ env, secret_keys }`).
 * The mcp-server install dialog reads its var NAMES only, to pre-satisfy a required
 * `!ENV` marker the deployment already provides. Mirrors the SAME tuple VALUE the
 * settings/manifest features own so React-Query shares the one cache entry.
 */
export const envConfigKey = ['env-config'] as const;
