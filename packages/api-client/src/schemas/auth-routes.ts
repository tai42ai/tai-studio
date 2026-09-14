/** Route catalog, scope mapping and public-route response schemas. */
import { z } from 'zod';

/** `{ url: scope_id }` — every URL currently mapped to a scope. */
export const authScopes = z.record(z.string(), z.string());

export const addUrlToScopeResult = z.object({ scope_id: z.string(), url: z.string() });
export const removeUrlFromScopeResult = z.object({ url: z.string() });
export const removeScopeResult = z.object({ scope_id: z.string(), deleted_keys: z.number() });

/**
 * A route's authorization ACTION class, joined onto the catalog from the route
 * registry. `read`/`write` routes are GRANTABLE — a role's per-tag level opens
 * them; `fenced`/`secret` routes are ADMIN-ONLY and never grantable (no per-tag
 * level reaches them). `null` marks a path the registry carries no metadata for
 * (an unregistered/ungated path — no feature tags, no action).
 */
export const routeAction = z.enum(['read', 'write', 'fenced', 'secret']);
export type RouteAction = z.infer<typeof routeAction>;

/**
 * One row of the route catalog (`GET /api/auth/routes`) — a plain HTTP route with
 * its current mapping, JOINED with its route-registry metadata. `mapped` is the
 * scope id, the public marker, or `null` when the path is unmapped (the mapper's
 * "unassigned" bucket source). `methods` is the route's method set with `HEAD`
 * removed. `tags` are the route's feature-group labels, `summary` its one-line
 * description, and `action` its authorization class — the join fields the Roles
 * grant editor reads to derive grantable feature groups and mark the admin-only
 * (fenced/secret) routes it must never offer a grant for. An unregistered path
 * carries `tags: []`, `summary: ''`, `action: null`.
 */
export const authRoute = z.object({
  path: z.string(),
  methods: z.array(z.string()),
  mapped: z.string().nullable(),
  tags: z.array(z.string()),
  summary: z.string(),
  action: routeAction.nullable(),
});
export type AuthRoute = z.infer<typeof authRoute>;
export const authRoutes = z.array(authRoute);
/** `GET /api/auth/public-routes` — the sorted urls pinned to the public marker. */
export const publicRoutes = z.array(z.string());

/** `POST /api/auth/public-routes` — the pinned url. */
export const pinPublicResult = z.object({ url: z.string() });
/** `DELETE /api/auth/public-routes` — the unpinned url (404 when not pinned). */
export const unpinPublicResult = z.object({ url: z.string() });
