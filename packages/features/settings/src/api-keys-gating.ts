/**
 * The projection ⊆ gate helpers for the API-keys tab: which scope ids exist, whether
 * the deployment-wide scopes mapper is reachable, whether the caller may mint a key,
 * and the scope options a scoped session is capped to.
 */
import { type CapabilityState, coversAnyRoute, isFullProjection } from '@tai42/studio-sdk';

/** Unique scope ids across the scope map, excluding the implicit `public` scope. */
export function scopeIdsOf(scopes: Record<string, string>): string[] {
  return [...new Set(Object.values(scopes))].filter((id) => id !== 'public').sort();
}

/** The mint route the caller's projection must be able to reach to create a key. */
export const MINT_ROUTE = '/api/auth/api-keys';

/**
 * The admin reads the scopes mapper issues on mount: the route table
 * (`/api/auth/routes`), the public-route pins (`/api/auth/public-routes`), and the
 * sub-MCP mounts (`/api/sub-mcp`). A caller that cannot reach EVERY one of them would
 * 403-wall the card, so the mapper renders only when the projection covers them all.
 */
export const SCOPES_MAPPER_READ_ROUTES = [
  '/api/auth/routes',
  '/api/auth/public-routes',
  '/api/sub-mcp',
] as const;

/**
 * Whether the deployment-wide access-control mapper is shown to this caller — the
 * visibility half of the projection ⊆ gate for an embedded admin sub-card. A full
 * (admin / gate-off) projection always shows it; a scoped session shows it only when
 * its projection reaches every read the mapper mounts. Fails closed while the
 * projection is not ready.
 */
export function scopesMapperVisible(state: CapabilityState): boolean {
  if (state.status !== 'ready') return false;
  const { projection } = state;
  return (
    isFullProjection(projection) ||
    SCOPES_MAPPER_READ_ROUTES.every((route) => coversAnyRoute(projection, [route]))
  );
}

/**
 * Whether the caller's projection permits minting a key — the client half of the
 * projection ⊆ gate invariant. `canMintRoute` is `useCanWrite` for the mint POST:
 * `true` for a full (admin / gate-off) projection or a scoped one that reaches the
 * route, and `false` until the projection is ready (fail closed). A full projection
 * always mints; a scoped session mints only when the route is reached AND the key is
 * NOT owned (owned keys 403 on mint via a per-request rule invisible to the route table).
 */
export function projectionCanMint(state: CapabilityState, canMintRoute: boolean): boolean {
  if (!canMintRoute) return false;
  // `canMintRoute` implies `ready`; this narrows the state for the owner check below.
  if (state.status !== 'ready') return false;
  const { projection } = state;
  if (isFullProjection(projection)) return true;
  return projection.owner_user_id === null;
}

/**
 * The scope options the create dialog offers. A scoped session is capped to the
 * scopes its projection carries; a full (or not-yet-ready) projection keeps the whole
 * scope map. A `"*"` in `projection.scopes` is the universal wildcard (`"*" ∩ X = X`
 * server-side), NOT a concrete scope id, so it expands to the WHOLE scope map rather
 * than intersecting to nothing.
 */
export function mintableScopeIds(scopeIds: readonly string[], state: CapabilityState): string[] {
  if (state.status !== 'ready' || isFullProjection(state.projection)) return [...scopeIds];
  const { scopes } = state.projection;
  if (scopes.includes('*')) return [...scopeIds];
  const allowed = new Set(scopes);
  return scopeIds.filter((id) => allowed.has(id));
}
