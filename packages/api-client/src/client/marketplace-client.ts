/** Marketplace search, install, update and advisory sub-client. */
import { encodeSegment } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

/**
 * The marketplace search filter (GET `/api/marketplace/search` query params).
 * `tags` is sent as REPEATED `tags` params, one per value; `page` is supplied
 * per-request by the infinite query, never from the URL. `tier`, `namespace`,
 * `contract`, and `page_size` are accepted by the route but the v1 UI sends none
 * of them (every v1 row is official/tai42; the page size stays the server
 * default) — they exist for contract completeness.
 */
export interface MarketplaceSearchQuery {
  readonly q?: string;
  readonly kind?: string;
  readonly category?: string;
  readonly tags?: string[];
  readonly namespace?: string;
  readonly tier?: string;
  readonly contract?: string;
  readonly sort?: 'downloads' | 'updated' | 'name' | 'relevance';
  readonly page?: number;
  readonly page_size?: number;
}

/**
 * Body for installing / updating a plugin. `ref` is `namespace/name`.
 *
 * `env` / `secret_keys` satisfy an mcp-server entry's required `!ENV` markers in
 * the same transaction that writes the entry: `env` supplies the values,
 * `secret_keys` marks which land in the secret band. Both omitted for a plain
 * install (no required markers).
 *
 * `route_mounts` maps a route-carrying item name to the base prefix its routes
 * mount under (the default or the operator's remap); `accept_public_routes`
 * explicitly consents to the routes served without authentication. Omitted for a
 * plugin that registers no routes.
 */
export interface MarketplaceInstallBody {
  readonly ref: string;
  readonly version?: string;
  readonly env?: Record<string, string>;
  readonly secret_keys?: string[];
  readonly route_mounts?: Record<string, string>;
  readonly accept_public_routes?: boolean;
}

/**
 * Body for previewing an install / update (`POST /api/marketplace/install/preview`):
 * resolves the spec and computes the routes, collisions, and public rows WITHOUT
 * side effects. `route_mounts` applies base overrides so the operator sees the
 * effect of a remap before committing.
 */
export interface MarketplaceInstallPreviewBody {
  readonly ref: string;
  readonly version?: string;
  readonly route_mounts?: Record<string, string>;
}

/** Body for uninstalling a plugin. */
export interface MarketplaceUninstallBody {
  readonly ref: string;
}

export function marketplaceClient(t: Transport) {
  const { req } = t;
  return {
    // Browse/search proxy the registry through the app (one origin, one auth);
    // install/uninstall/update mutate the RUNNING app (pip install + manifest
    // patch + reload) and return synchronous receipts.
    searchMarketplace: (query: MarketplaceSearchQuery = {}, signal?: AbortSignal) =>
      req('/api/marketplace/search', s.marketplaceSearchPage, {
        query: {
          q: query.q,
          kind: query.kind,
          category: query.category,
          tags: query.tags,
          namespace: query.namespace,
          tier: query.tier,
          contract: query.contract,
          sort: query.sort,
          page: query.page,
          page_size: query.page_size,
        },
        signal,
      }),
    getMarketplacePlugin: (namespace: string, name: string, signal?: AbortSignal) =>
      req(
        `/api/marketplace/plugins/${encodeSegment(namespace)}/${encodeSegment(name)}`,
        s.marketplacePluginDetail,
        { signal },
      ),
    listMarketplaceCategories: (signal?: AbortSignal) =>
      req('/api/marketplace/categories', s.marketplaceCategories, { signal }),
    listMarketplaceKinds: (signal?: AbortSignal) =>
      req('/api/marketplace/kinds', s.marketplaceKinds, { signal }),
    listInstalledMarketplacePlugins: (signal?: AbortSignal) =>
      req('/api/marketplace/installed', s.marketplaceInstalled, { signal }),
    // Preview resolves the spec and computes routes/collisions/public rows with
    // NO side effects, so the install dialog can show absolute paths, block on a
    // collision, and surface the public routes before the operator commits.
    previewMarketplaceInstall: (body: MarketplaceInstallPreviewBody, signal?: AbortSignal) =>
      req('/api/marketplace/install/preview', s.marketplaceInstallPreview, {
        method: 'POST',
        body,
        signal,
      }),
    installMarketplacePlugin: (body: MarketplaceInstallBody) =>
      req('/api/marketplace/install', s.marketplaceInstallResult, { method: 'POST', body }),
    uninstallMarketplacePlugin: (body: MarketplaceUninstallBody) =>
      req('/api/marketplace/uninstall', s.marketplaceUninstallResult, { method: 'POST', body }),
    updateMarketplacePlugin: (body: MarketplaceInstallBody) =>
      req('/api/marketplace/update', s.marketplaceInstallResult, { method: 'POST', body }),
    // Upgrade EVERY installed plugin to its newest compatible version in one
    // pass; the response is the per-plugin outcome readout.
    upgradeAllMarketplacePlugins: () =>
      req('/api/marketplace/upgrade-all', s.marketplaceUpgradeAllResult, { method: 'POST' }),
    getMarketplaceAdvisories: (signal?: AbortSignal) =>
      req('/api/marketplace/advisories', s.marketplaceAdvisories, { signal }),
  };
}
