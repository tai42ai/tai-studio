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
 * description, `action` its authorization class, and `role_reach` the server's
 * decision of what opens it for a non-admin role — the Roles grant editor groups
 * routes by `tags` and offers a level only on a group with a `level` route. An
 * unregistered path carries `tags: []`, `summary: ''`, `action: null`,
 * `role_reach: null`. `declared_public` is `true` for
 * a route its registration declares public: it is served without authentication
 * and no scope mapping or public pin changes that, so the mapper never offers it
 * for a scope.
 */
export const authRoute = openapi.routeMappingRow;
export type AuthRoute = z.infer<typeof authRoute>;
export const authRoutes = openapi.routeMappingList;

/**
 * A route's authorization ACTION class, joined onto the catalog from the route
 * registry: `read`/`write` by the route's method, `fenced`/`secret` reserved for
 * admins. `null` on a row marks a path the registry carries no metadata for (an
 * unregistered/ungated path — no feature tags, no action).
 */
export const routeAction = openapi.routeMappingRow.shape.action.unwrap();
export type RouteAction = z.infer<typeof routeAction>;

/**
 * A route's role reach, the server's decision of what opens it for a non-admin role:
 * `level` — a role's per-tag level opens it; `self_service` — every role keeps it, no
 * level; `admin_only` — a fenced/secret class or a control-plane route the base tier
 * reserves; `public` — the route is not authenticated and answers everyone without a
 * login. `null` on a row marks a path with no registry metadata.
 */
export const routeRoleReach = openapi.routeMappingRow.shape.role_reach.unwrap();
export type RouteRoleReach = z.infer<typeof routeRoleReach>;

/** `GET /api/auth/public-routes` — the sorted urls pinned to the public marker. */
export const publicRoutes = openapi.stringList;

/** `POST /api/auth/public-routes` — the pinned url. */
export const pinPublicResult = openapi.urlAck;
/** `DELETE /api/auth/public-routes` — the unpinned url (404 when not pinned). */
export const unpinPublicResult = openapi.urlAck;
