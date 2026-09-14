/** Caller capability projection and auth-capabilities schemas. */
import { z } from 'zod';
import { subMcpMount } from './sub-mcp';

/** A concrete route the caller can reach, with the methods that pass its jq fence. */
export const routeEntry = z.object({
  path: z.string(),
  methods: z.array(z.string()),
});
export type RouteEntry = z.infer<typeof routeEntry>;

/**
 * A dynamic route pattern the caller can reach — a mount/pattern surface not
 * enumerable into concrete paths, projected only when its scope AND jq admit it.
 */
export const patternEntry = z.object({
  pattern: z.string(),
  scope_id: z.string(),
});
export type PatternEntry = z.infer<typeof patternEntry>;

/**
 * A sub-MCP mount the caller can reach, with the tools it exposes and its
 * transport. Shares the {@link subMcpMount} shape with the registry list, adding
 * the `slug` the projection carries inline (the list keys mounts by slug instead).
 */
export const subMcpEntry = subMcpMount.extend({ slug: z.string() });
export type SubMcpEntry = z.infer<typeof subMcpEntry>;

/**
 * `GET /api/auth/me` — the caller's derived capability projection: the concrete
 * (path, method) surface, dynamic patterns, sub-MCP mounts, tools, and agents it
 * can reach RIGHT NOW (derived server-side, never stored). `admin` is the
 * condition-free ownerless `"*"` discriminator (a TOTAL projection); a scoped
 * session carries `admin: false` and a jq-exact `routes` list. `owner_user_id` is
 * the key's owner claim, `null` for an ownerless key. The invariant is
 * projection ⊆ gate: every projected surface is one the server would admit, so
 * the UI can filter on it without ever advertising a door the gate denies.
 */
export const meProjection = z.object({
  user_id: z.string(),
  owner_user_id: z.string().nullable(),
  admin: z.boolean(),
  scopes: z.array(z.string()),
  routes: z.array(routeEntry),
  route_patterns: z.array(patternEntry),
  sub_mcp: z.array(subMcpEntry),
  tools: z.array(z.string()),
  agents: z.array(z.string()),
  mintable: z.boolean(),
});
export type MeProjection = z.infer<typeof meProjection>;

/**
 * `POST /api/auth/claim-links` — a one-time claim link minted in the key-create
 * flow. `claim_path` is a fragment-carrier path (`/login#claim=<token>`, never an
 * absolute URL — the Studio composes the origin); `token` is the raw claim token
 * returned exactly ONCE; `expires_at` is an ISO-8601 instant.
 */
export const claimLinkCreated = z.object({
  claim_path: z.string(),
  token: z.string(),
  expires_at: z.string(),
});
export type ClaimLinkCreated = z.infer<typeof claimLinkCreated>;

/**
 * `POST /api/auth/logout` — the single authed logout dispatcher's result.
 * `revoked` is `true` when a live accounts session was revoked; a plain `sk-` key
 * has nothing to revoke and answers `404` (a loud absent-session signal), never a
 * `revoked: false` body. Non-strict, so a SUCCESSFUL logout never throws
 * `ApiSchemaError` on an additive field.
 */
export const logoutResult = z.object({ revoked: z.boolean() });
export type LogoutResult = z.infer<typeof logoutResult>;

/**
 * `GET /api/auth/capabilities` — whether this deployment can MINT API keys
 * locally. `mintable: false` means every configured identity provider is
 * validator-only (keys are issued at an external issuer), so the key-creation
 * UI disables up front instead of surfacing a raw mint failure. Non-strict.
 */
export const authCapabilities = z.object({
  mintable: z.boolean(),
  providers: z.array(z.object({ name: z.string(), mintable: z.boolean() })),
});
export type AuthCapabilities = z.infer<typeof authCapabilities>;
