/** Member, invite, directory and member-action schemas for the generic Members view. */
import { z } from 'zod';

import { jsonSchema } from './shared';

/**
 * Where a declared member action renders: a page-level button, a member-row menu
 * item, or an invite-row menu item. A provider classifies each of its own actions
 * into one of these three places; Studio only joins by `scope`, never reads the
 * provider's meaning behind it.
 */
export const memberActionScope = z.enum(['page', 'member_row', 'invite_row']);
export type MemberActionScope = z.infer<typeof memberActionScope>;

/**
 * One platform principal a member holds (`GET /api/auth/members` →
 * `members[].principals[]`). `user_id` is the platform principal id; `disabled` is
 * taken from that principal's own record (the store the principals listing reads) and
 * `role` is the role it holds, joined from its own policy record — both never from a
 * provider. `role` is `null` when the principal's policy was not written from a role
 * template.
 */
export const memberPrincipalState = z.object({
  user_id: z.string(),
  disabled: z.boolean(),
  role: z.string().nullable(),
});
export type MemberPrincipalState = z.infer<typeof memberPrincipalState>;

/**
 * One person an accounts provider owns, as the directory door returns them
 * (`GET /api/auth/members` → `members[]`). `id` is the provider's stable handle for
 * the person (a list key, not shown). `email` is the sign-in identity; `role` is the
 * one role name every principal holds (the NAME only — the role definition is read
 * from the role listing), or `null` when there is no single name: every principal's
 * access was set directly, or the principals hold different roles
 * (`principals[].role` carries each one's own). `principals` carries each principal's
 * platform-joined state; `disabled` is derived True only when EVERY principal is disabled, so a
 * person with any enabled principal still reads active while the per-principal truth
 * stays visible. `handle` routes an invoke back to the producing provider and pins
 * this row; `action_keys` are the opaque catalog keys of the actions applicable to
 * it — Studio joins and echoes both, never parses them. `created_at` is an ISO-8601
 * instant.
 */
export const memberRow = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string().nullable(),
  created_at: z.string(),
  principals: z.array(memberPrincipalState),
  disabled: z.boolean(),
  handle: z.string(),
  action_keys: z.array(z.string()),
});
export type MemberRow = z.infer<typeof memberRow>;

/**
 * One outstanding invitation an accounts provider holds, as the directory door
 * returns them (`GET /api/auth/members` → `invites[]`). `id` is the provider's
 * stable handle for the invited person; `email` is the invited address; `role` names
 * the platform role they will hold (name only, or `null` when not from a role template). An
 * invitation holds no principal, so it carries no principal state. `handle` and
 * `action_keys` are the opaque routing tokens (see {@link memberRow}). `created_at`
 * and `expires_at` are ISO-8601 instants.
 */
export const inviteRow = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
  handle: z.string(),
  action_keys: z.array(z.string()),
});
export type InviteRow = z.infer<typeof inviteRow>;

/**
 * The deployment-wide membership (`GET /api/auth/members`): every accounts
 * provider's people and outstanding invitations, aggregated and platform-joined by
 * the backend into one view so a generic Members screen renders without naming any
 * provider.
 */
export const memberDirectory = z.object({
  members: z.array(memberRow),
  invites: z.array(inviteRow),
});
export type MemberDirectory = z.infer<typeof memberDirectory>;

/**
 * One declared member action, serialized for the catalog (`GET
 * /api/auth/member-actions` → `actions[]`). `key` is the opaque catalog key a caller
 * joins and echoes, never parses. `label` is the resolved wording. `scope` places
 * the action; `destructive` asks for a confirm before invoking. `input_schema` and
 * `result_schema` are the declared models' JSON Schema — a caller renders an input
 * form and a read-only result view from them generically, with no provider field
 * name known to Studio.
 */
export const memberActionDescriptor = z.object({
  key: z.string(),
  label: z.string(),
  scope: memberActionScope,
  destructive: z.boolean(),
  input_schema: jsonSchema,
  result_schema: jsonSchema,
});
export type MemberActionDescriptor = z.infer<typeof memberActionDescriptor>;

/**
 * Every declared member action across the registered accounts providers (`GET
 * /api/auth/member-actions`). ADMIN-ONLY (`secret`) — a non-admin projection never
 * reaches the route, exactly as the members listing.
 */
export const memberActionCatalog = z.object({
  actions: z.array(memberActionDescriptor),
});
export type MemberActionCatalog = z.infer<typeof memberActionCatalog>;

/**
 * The invoke-door result (`POST /api/auth/member-actions/invoke`): the provider's
 * result-model dump, carried opaquely. `result` is rendered through the action's
 * `result_schema`; Studio reads no field of it by name.
 */
export const invokeMemberActionResult = z.object({
  result: jsonSchema,
});
export type InvokeMemberActionResult = z.infer<typeof invokeMemberActionResult>;
