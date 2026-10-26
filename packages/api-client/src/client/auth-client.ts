/** Auth scopes, routes, roles and API-key sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

/** Body for creating or editing an API key (POST/PUT `/api/auth/api-keys`). */
export interface ApiKeyBody {
  readonly user_id: string;
  readonly description: string;
  readonly scopes: string[];
  // The principal that OWNS the key. Admin-only: an admin may name a service
  // principal; a non-admin omits it and the server forces self-ownership.
  readonly owner_user_id?: string;
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

/**
 * Body for invoking a declared member action (POST
 * `/api/auth/member-actions/invoke`). `action_key` is the opaque catalog key;
 * `target_handle` is the row handle the action acts on, `null` for a page-scoped
 * action; `input` is the per-action input the backend validates against the action's
 * declared input model. All three are opaque to Studio — the keys are joined and
 * echoed, the input is built from the action's `input_schema`, and no provider field
 * is named here.
 */
export interface InvokeMemberActionBody {
  readonly action_key: string;
  readonly target_handle: string | null;
  readonly input: Record<string, unknown>;
}

/** Scope mapping, the route catalog and the public-route pins. */
function scopeRouteMethods(t: Transport) {
  const { req } = t;
  return {
    listScopes: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_scopes.path, s.authScopes, { signal }),
    addUrlToScope: (body: AddUrlToScopeBody) =>
      req(apiRoutes.post_api_auth_scopes.path, s.addUrlToScopeResult, { method: 'POST', body }),
    removeUrlFromScope: (body: { url: string }) =>
      req(apiRoutes.delete_api_auth_scopes_urls.path, s.removeUrlFromScopeResult, {
        method: 'DELETE',
        body,
      }),
    removeScope: (scopeId: string) =>
      req(
        buildPath(apiRoutes.delete_api_auth_scopes_scope_id.path, { scope_id: scopeId }),
        s.removeScopeResult,
        {
          method: 'DELETE',
        },
      ),
    // The app's HTTP route catalog with each route's current mapping — the only
    // source of the mapper's unassigned-routes bucket (`mapped: null` entries).
    listAuthRoutes: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_routes.path, s.authRoutes, { signal }),
    // The urls pinned to the public marker; pinning/unpinning is the dedicated
    // public-routes writer, never the scope machinery.
    listPublicRoutes: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_public_routes.path, s.publicRoutes, { signal }),
    pinRoutePublic: (body: PinRoutePublicBody) =>
      req(apiRoutes.post_api_auth_public_routes.path, s.pinPublicResult, { method: 'POST', body }),
    // Unpin a public url. A url that is absent or scope-mapped is a loud 404.
    unpinPublicRoute: (url: string) =>
      req(apiRoutes.delete_api_auth_public_routes.path, s.unpinPublicResult, {
        method: 'DELETE',
        body: { url },
      }),
  };
}

/** Role bodies, their version history and rollback. */
function roleMethods(t: Transport) {
  const { req } = t;
  return {
    // The seeded + operator-authored roles as full bodies (base-tier ceiling +
    // editable per-tag grant map). ADMIN-ONLY — the route is `secret` (a listing
    // exposes each role's raw base-tier jq); a non-admin projection never reaches it.
    listRoles: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_roles.path, s.roleList, { signal }),
    // Create an operator-authored role. The server validates the grant map + base
    // tier and 409s on a name collision; the reserved `admin` role cannot be created.
    createRole: (body: RoleCreateBody) =>
      req(apiRoutes.post_api_auth_roles.path, s.roleBody, { method: 'POST', body }),
    // Edit a role's per-tag grant map + description (omit-means-keep). The reserved
    // `admin` role and any `allow_all` role are block-downgrade guarded server-side.
    updateRole: (name: string, body: RoleUpdateBody) =>
      req(buildPath(apiRoutes.put_api_auth_roles_name.path, { name }), s.roleBody, {
        method: 'PUT',
        body,
      }),
    // Delete a role. The reserved `admin` role is undeletable; a role still assigned
    // to any principal is a loud 409.
    deleteRole: (name: string) =>
      req(buildPath(apiRoutes.delete_api_auth_roles_name.path, { name }), s.roleDeleted, {
        method: 'DELETE',
      }),
    // A role's append-only version history + who/action/before→after audit trail.
    // ADMIN-ONLY (`secret`).
    listRoleVersions: (name: string, signal?: AbortSignal) =>
      req(buildPath(apiRoutes.get_api_auth_roles_name_versions.path, { name }), s.roleVersions, {
        signal,
      }),
    // Re-point a role's active version to a prior one (LIVE — holders follow on
    // their next request); returns the re-pointed role body.
    rollbackRole: (name: string, version: number) =>
      req(buildPath(apiRoutes.post_api_auth_roles_name_rollback.path, { name }), s.roleBody, {
        method: 'POST',
        body: { version },
      }),
  };
}

/** API keys, claim links and the member directory with its actions. */
function keyMemberMethods(t: Transport) {
  const { req } = t;
  return {
    listTokensPayload: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_tokens_payload.path, s.tokensPayload, { signal }),
    createApiKey: (body: ApiKeyBody) =>
      req(apiRoutes.post_api_auth_api_keys.path, s.createdApiKey, { method: 'POST', body }),
    // PATCH-style PUT: an omitted `scopes` keeps the key's stored scopes.
    editApiKey: (
      userId: string,
      body: Omit<ApiKeyBody, 'user_id' | 'scopes'> & { readonly scopes?: string[] },
    ) =>
      req(
        buildPath(apiRoutes.put_api_auth_api_keys_user_id.path, { user_id: userId }),
        s.editApiKeyResult,
        {
          method: 'PUT',
          body,
        },
      ),
    revokeApiKey: (userId: string) =>
      req(
        buildPath(apiRoutes.delete_api_auth_api_keys_user_id.path, { user_id: userId }),
        s.revokeApiKeyResult,
        {
          method: 'DELETE',
        },
      ),
    // Mint a one-time claim link carrying a raw key to another device (the QR
    // onboarding leg). The token rides the URL fragment; the server returns a
    // relative `claim_path` and the raw token ONCE.
    createClaimLink: (body: ClaimLinkBody) =>
      req(apiRoutes.post_api_auth_claim_links.path, s.claimLinkCreated, { method: 'POST', body }),

    // The deployment-wide membership: every accounts provider's people and
    // outstanding invitations, aggregated and platform-joined server-side into one
    // directory (each row carrying its principal state + opaque routing tokens).
    // ADMIN-ONLY (`secret`) — a non-admin projection never reaches the route.
    listMembers: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_members.path, s.memberDirectory, { signal }),

    // The catalog of member-admin actions every accounts provider declares, each
    // with its opaque key, rendered label, placement, and input/result JSON Schema.
    // ADMIN-ONLY (`secret`) — the same fence the members listing carries.
    listMemberActions: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_member_actions.path, s.memberActionCatalog, { signal }),
    // Invoke one declared action by its opaque key, echoing the target row's handle
    // and the per-action input. The result is carried opaquely for a read-only,
    // schema-driven render. ADMIN-ONLY (`fenced`).
    invokeMemberAction: (body: InvokeMemberActionBody) =>
      req(apiRoutes.post_api_auth_member_actions_invoke.path, s.invokeMemberActionResult, {
        method: 'POST',
        body,
      }),
  };
}

/** The deployment's principals. */
function principalMethods(t: Transport) {
  const { req } = t;
  return {
    // The deployment's principals (identities). ADMIN-ONLY (`secret`) — a
    // non-admin projection never reaches the route.
    listPrincipals: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_principals.path, s.principalList, { signal }),
    // Create a `human` or `service` principal and apply its role (admin only).
    // A duplicate id is a loud 409; an unknown role a loud 400.
    createPrincipal: (body: {
      user_id?: string;
      kind: s.PrincipalKind;
      display_name: string;
      role: string;
    }) => req(apiRoutes.post_api_auth_principals.path, s.principal, { method: 'POST', body }),
    // Update a principal's display name and/or `disabled` flag (omit-means-keep;
    // an all-absent body is a loud 400). Disabling turns off every credential the
    // principal owns.
    updatePrincipal: (userId: string, body: { display_name?: string; disabled?: boolean }) =>
      req(
        buildPath(apiRoutes.put_api_auth_principals_user_id.path, { user_id: userId }),
        s.principal,
        { method: 'PUT', body },
      ),
    // Delete a principal — revokes every key it owns and its policy row.
    deletePrincipal: (userId: string) =>
      req(
        buildPath(apiRoutes.delete_api_auth_principals_user_id.path, { user_id: userId }),
        s.principalDeleted,
        {
          method: 'DELETE',
        },
      ),
  };
}

export function authClient(t: Transport) {
  return {
    ...scopeRouteMethods(t),
    ...roleMethods(t),
    ...keyMemberMethods(t),
    ...principalMethods(t),
  };
}
