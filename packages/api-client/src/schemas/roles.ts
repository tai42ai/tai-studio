/** Role grant, version and audit response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import { roleBody } from './served';
import { jsonValue } from './shared';

/** A role's per-tag ACCESS LEVEL: `none` (no access), `read`, or `write`. */
export const grantLevel = roleBody.shape.grants.valueType;
export type GrantLevel = z.infer<typeof grantLevel>;

/** A role's editable grant map: feature-group TAG name → the role's access level. */
export const roleGrants = roleBody.shape.grants;
export type RoleGrants = z.infer<typeof roleGrants>;

export const roleList = openapi.roleDefinitionList;

/** `DELETE /api/auth/roles/{name}` — the deleted role's name. */
export const roleDeleted = openapi.roleDeleted;

// The version and audit bodies are hand-typed: the spec publishes a version body as an open
// object.

/**
 * One immutable role-version row (`GET /api/auth/roles/{name}/versions` →
 * `versions`). `body` is the role body at that version; `is_current` flags the
 * active pointer. Mirrors the generic versioned-store row shape.
 */
export const roleVersion = openapi.documentVersion.extend({ body: roleBody });
export type RoleVersion = z.infer<typeof roleVersion>;

/**
 * One who/action/before→after audit row (`GET /api/auth/roles/{name}/versions` →
 * `audit`). Its `body` carries the mutation kind, the actor, and the before/after
 * role bodies (both `null` for a create's `before` / a delete's `after`).
 */
export const roleAuditEvent = openapi.documentVersion.extend({
  body: z.object({
    action: z.string(),
    actor: z.string().nullable(),
    before: jsonValue.nullable(),
    after: jsonValue.nullable(),
  }),
});
export type RoleAuditEvent = z.infer<typeof roleAuditEvent>;

/** `GET /api/auth/roles/{name}/versions` — the append-only history + audit trail. */
export const roleVersions = openapi.roleVersionsView.extend({
  versions: z.array(roleVersion),
  audit: z.array(roleAuditEvent),
});
export type RoleVersions = z.infer<typeof roleVersions>;
