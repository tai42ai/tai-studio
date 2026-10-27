/** Caller capability projection and auth-capabilities schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

/**
 * A route the caller can reach — a concrete path, or a route template such as
 * `/api/presets/{name}` — with the methods its grant admits (on a representative
 * instance, for a template).
 */
export const routeEntry = openapi.routeEntry;
export type RouteEntry = z.infer<typeof routeEntry>;

/**
 * A dynamic route pattern the caller can reach — a mount/pattern surface not
 * enumerable into concrete paths, projected only when its scope AND jq admit it.
 * `open_prefix` is the literal path prefix the pattern opens, or `null` when the pattern
 * opens none a prefix test can read.
 */
export const patternEntry = openapi.patternEntry;
export type PatternEntry = z.infer<typeof patternEntry>;

/**
 * A sub-MCP mount the caller can reach, with the tools it exposes, its transport and
 * its served mount URL and access pattern, and the `slug` the projection carries inline
 * (the registry list keys mounts by slug instead).
 */
export const subMcpEntry = openapi.subMcpEntry;
export type SubMcpEntry = z.infer<typeof subMcpEntry>;

/**
 * `GET /api/auth/me` — the caller's derived capability projection: the (path, method)
 * surface (concrete paths and route templates), dynamic patterns, sub-MCP mounts, tools, and agents it
 * can reach RIGHT NOW (derived server-side, never stored). `admin` is the
 * condition-free `"*"` discriminator (a TOTAL projection); a scoped
 * session carries `admin: false` and its projected `routes` list. `owner_user_id` is
 * the key's owner claim, `null` for a key with no owner claim. `principal` is the
 * caller's principal (kind + display name), `null` when no principal row backs the
 * credential. `public_resource_id` is the deployment's reserved public marker (the
 * route-table id a public route maps to — never a scope). The invariant is projection ⊆ gate: every projected surface is one
 * the server would admit for a role-holder; a credential fenced per instance is
 * decided at the server, which answers 403 where its fence denies the instance.
 */
export const meProjection = openapi.projectionResult;
export type MeProjection = z.infer<typeof meProjection>;

/**
 * `POST /api/auth/claim-links` — a one-time claim link minted in the key-create
 * flow. `claim_path` is a fragment-carrier path (`/login#claim=<token>`, never an
 * absolute URL — the Studio composes the origin); `token` is the raw claim token
 * returned exactly ONCE; `expires_at` is an ISO-8601 instant.
 */
export const claimLinkCreated = openapi.claimLinkResult;
export type ClaimLinkCreated = z.infer<typeof claimLinkCreated>;

/**
 * `POST /api/auth/logout` — the single authed logout dispatcher's result.
 * `revoked` is `true` when a live accounts session was revoked; a plain `sk-` key
 * has nothing to revoke and answers `404` (a loud absent-session signal), never a
 * `revoked: false` body. `end_session_url` is the identity provider's end-session
 * URL when the session came through one, `null` otherwise. Non-strict, so a
 * SUCCESSFUL logout never throws `ApiSchemaError` on an additive field.
 */
export const logoutResult = openapi.logoutResult;
export type LogoutResult = z.infer<typeof logoutResult>;

/**
 * `GET /api/auth/capabilities` — whether this deployment can MINT API keys
 * locally. `mintable: false` means every configured identity provider is
 * validator-only (keys are issued at an external issuer), so the key-creation
 * UI disables up front instead of surfacing a raw mint failure. Non-strict.
 */
export const authCapabilities = openapi.mintCapabilities;
export type AuthCapabilities = z.infer<typeof authCapabilities>;
