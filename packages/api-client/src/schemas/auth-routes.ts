/** Route catalog, scope mapping and public-route response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

/** `{ url: scope_id }` — every URL currently mapped to a scope. */
export const authScopes = openapi.scopeUrlMap;

export const addUrlToScopeResult = openapi.scopeUrlAck;
export const removeUrlFromScopeResult = openapi.urlAck;
export const removeScopeResult = openapi.scopeDeleteResult;

/**
 * One row of the route catalog (`GET /api/auth/routes`) — a plain HTTP route with
 * its current mapping, JOINED with its route-registry metadata. `mapped` is the
 * scope id, the public marker, or `null` when the path is unmapped (the mapper's
 * "unassigned" bucket source). `methods` is the route's method set with `HEAD`
 * removed. `tags` are the route's feature-group labels, `summary` its one-line
 * description, and `action` its authorization class — the join fields the Roles
 * grant editor reads to derive grantable feature groups and mark the admin-only
 * (fenced/secret) routes it must never offer a grant for. An unregistered path
 * carries `tags: []`, `summary: ''`, `action: null`. `declared_public` is `true` for
 * a route its registration declares public: it is served without authentication
 * and no scope mapping or public pin changes that, so the mapper never offers it
 * for a scope.
 */
export const authRoute = openapi.routeMappingRow;
export type AuthRoute = z.infer<typeof authRoute>;
export const authRoutes = openapi.routeMappingList;

/**
 * A route's authorization ACTION class, joined onto the catalog from the route
 * registry. `read`/`write` routes are GRANTABLE — a role's per-tag level opens
 * them; `fenced`/`secret` routes are ADMIN-ONLY and never grantable (no per-tag
 * level reaches them). `null` on a row marks a path the registry carries no metadata
 * for (an unregistered/ungated path — no feature tags, no action).
 */
export const routeAction = openapi.routeMappingRow.shape.action.unwrap();
export type RouteAction = z.infer<typeof routeAction>;

/** `GET /api/auth/public-routes` — the sorted urls pinned to the public marker. */
export const publicRoutes = openapi.stringList;

/** `POST /api/auth/public-routes` — the pinned url. */
export const pinPublicResult = openapi.urlAck;
/** `DELETE /api/auth/public-routes` — the unpinned url (404 when not pinned). */
export const unpinPublicResult = openapi.urlAck;
