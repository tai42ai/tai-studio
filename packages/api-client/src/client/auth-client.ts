/** Auth scopes, routes, roles and API-key sub-client. */
import { encodeSegment } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

/** Body for creating or editing an API key (POST/PUT `/api/auth/api-keys`). */
export interface ApiKeyBody {
  readonly user_id: string;
  readonly description: string;
  readonly scopes: string[];
  // `null` is an explicit clear on edit (PATCH-style PUT): absent preserves the
  // stored policy data, `null` wipes it. Create never sends `null`.
  readonly policy_data?: Record<string, unknown> | null;
  // The access-control condition: an authored templated-text value (inline content
  // or a stored template id), or `null` to explicitly clear it on edit.
  readonly condition?: s.TemplatedText | null;
}

/**
 * Body for one-time claim-link creation (POST `/api/auth/claim-links`). The
 * `api_key` is a raw key the caller holds (the just-minted key, client-side
 * exactly once); `ttl_seconds` optionally overrides the default lifetime (the
 * server caps it at its ceiling).
 */
export interface ClaimLinkBody {
  readonly api_key: string;
  readonly ttl_seconds?: number | null;
}

/** Body for adding a URL to a scope (POST `/api/auth/scopes`). */
export interface AddUrlToScopeBody {
  readonly scope_id: string;
  readonly url: string;
  readonly pattern?: string;
}

/**
 * Body for creating a role (POST `/api/auth/roles`). `base_tier` is the security
 * tier the role inherits (`editor`/`viewer` — `admin` is reserved); its jq is
 * resolved server-side, never authored here. `grants` is the editable per-tag
 * access-level map (feature-group tag → `none`/`read`/`write`); it defaults to
 * empty (every group `none`, fail-closed) when omitted.
 */
export interface RoleCreateBody {
  readonly name: string;
  readonly description?: string;
  readonly base_tier: string;
  readonly grants?: Record<string, s.GrantLevel>;
}

/**
 * Body for editing a role (PUT `/api/auth/roles/{name}`). Both fields are
 * omit-means-KEEP: an absent `grants` preserves the stored map (never a silent
 * wipe), an absent `description` preserves the stored description. The base-tier jq
 * is seed-fixed and not editable here.
 */
export interface RoleUpdateBody {
  readonly grants?: Record<string, s.GrantLevel>;
  readonly description?: string;
}

/**
 * Body for pinning a route public (POST `/api/auth/public-routes`). `pattern` is an
 * optional regex the AC verifier full-matches request paths against, mapping every
 * match to the `url` key (so a mount's whole subtree can be pinned in one call).
 */
export interface PinRoutePublicBody {
  readonly url: string;
  readonly pattern?: string;
}

export function authClient(t: Transport) {
  const { req } = t;
  return {
    listScopes: (signal?: AbortSignal) => req('/api/auth/scopes', s.authScopes, { signal }),
    addUrlToScope: (body: AddUrlToScopeBody) =>
      req('/api/auth/scopes', s.addUrlToScopeResult, { method: 'POST', body }),
    removeUrlFromScope: (body: { url: string }) =>
      req('/api/auth/scopes/urls', s.removeUrlFromScopeResult, { method: 'DELETE', body }),
    removeScope: (scopeId: string) =>
      req(`/api/auth/scopes/${encodeSegment(scopeId)}`, s.removeScopeResult, {
        method: 'DELETE',
      }),
    // The app's HTTP route catalog with each route's current mapping — the only
    // source of the mapper's unassigned-routes bucket (`mapped: null` entries).
    listAuthRoutes: (signal?: AbortSignal) => req('/api/auth/routes', s.authRoutes, { signal }),
    // The urls pinned to the public marker; pinning/unpinning is the dedicated
    // public-routes writer, never the scope machinery.
    listPublicRoutes: (signal?: AbortSignal) =>
      req('/api/auth/public-routes', s.publicRoutes, { signal }),
    pinRoutePublic: (body: PinRoutePublicBody) =>
      req('/api/auth/public-routes', s.pinPublicResult, { method: 'POST', body }),
    // Unpin a public url. A url that is absent or scope-mapped is a loud 404.
    unpinPublicRoute: (url: string) =>
      req('/api/auth/public-routes', s.unpinPublicResult, { method: 'DELETE', body: { url } }),

    // The seeded + operator-authored roles as full bodies (base-tier ceiling +
    // editable per-tag grant map). ADMIN-ONLY — the route is `secret` (a listing
    // exposes each role's raw base-tier jq); a non-admin projection never reaches it.
    listRoles: (signal?: AbortSignal) => req('/api/auth/roles', s.roleList, { signal }),
    // Create an operator-authored role. The server validates the grant map + base
    // tier and 409s on a name collision; the reserved `admin` role cannot be created.
    createRole: (body: RoleCreateBody) =>
      req('/api/auth/roles', s.roleBody, { method: 'POST', body }),
    // Edit a role's per-tag grant map + description (omit-means-keep). The reserved
    // `admin` role and any `allow_all` role are block-downgrade guarded server-side.
    updateRole: (name: string, body: RoleUpdateBody) =>
      req(`/api/auth/roles/${encodeSegment(name)}`, s.roleBody, { method: 'PUT', body }),
    // Delete a role. The reserved `admin` role is undeletable; a role still assigned
    // to any principal is a loud 409.
    deleteRole: (name: string) =>
      req(`/api/auth/roles/${encodeSegment(name)}`, s.roleDeleted, { method: 'DELETE' }),
    // A role's append-only version history + who/action/before→after audit trail.
    // ADMIN-ONLY (`secret`).
    listRoleVersions: (name: string, signal?: AbortSignal) =>
      req(`/api/auth/roles/${encodeSegment(name)}/versions`, s.roleVersions, { signal }),
    // Re-point a role's active version to a prior one (LIVE — holders follow on
    // their next request); returns the re-pointed role body.
    rollbackRole: (name: string, version: number) =>
      req(`/api/auth/roles/${encodeSegment(name)}/rollback`, s.roleBody, {
        method: 'POST',
        body: { version },
      }),

    listTokensPayload: (signal?: AbortSignal) =>
      req('/api/auth/tokens-payload', s.tokensPayload, { signal }),
    createApiKey: (body: ApiKeyBody) =>
      req('/api/auth/api-keys', s.createdApiKey, { method: 'POST', body }),
    editApiKey: (userId: string, body: Omit<ApiKeyBody, 'user_id'>) =>
      req(`/api/auth/api-keys/${encodeSegment(userId)}`, s.editApiKeyResult, {
        method: 'PUT',
        body,
      }),
    revokeApiKey: (userId: string) =>
      req(`/api/auth/api-keys/${encodeSegment(userId)}`, s.revokeApiKeyResult, {
        method: 'DELETE',
      }),
    // Mint a one-time claim link carrying a raw key to another device (the QR
    // onboarding leg). The token rides the URL fragment; the server returns a
    // relative `claim_path` and the raw token ONCE.
    createClaimLink: (body: ClaimLinkBody) =>
      req('/api/auth/claim-links', s.claimLinkCreated, { method: 'POST', body }),
  };
}
