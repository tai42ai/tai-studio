/** Member, invite and aggregated-listing schemas for the generic Members view. */
import { z } from 'zod';

/**
 * One person an accounts provider owns (`GET /api/auth/members` → `members[]`).
 * `id` is the provider's stable handle for the person (used only as a list key, not
 * shown). `email` is the sign-in identity; `role` names the platform role the person
 * holds (the NAME only — the role definition is read from the role listing).
 * `disabled` turns off the account. `created_at` is an ISO-8601 instant.
 */
export const memberEntry = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  disabled: z.boolean(),
  created_at: z.string(),
});
export type MemberEntry = z.infer<typeof memberEntry>;

/**
 * One outstanding invitation an accounts provider holds (`GET /api/auth/members` →
 * `invites[]`). `id` is the provider's stable handle for the invited person; `email`
 * is the invited address; `role` names the platform role they will hold (name only, as
 * on {@link memberEntry}). `created_at` and `expires_at` are ISO-8601 instants.
 */
export const inviteEntry = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
});
export type InviteEntry = z.infer<typeof inviteEntry>;

/**
 * The deployment-wide membership (`GET /api/auth/members`): every accounts provider's
 * people and outstanding invitations, aggregated by the backend into one view so a
 * generic Members screen renders without naming any provider.
 */
export const memberListing = z.object({
  members: z.array(memberEntry),
  invites: z.array(inviteEntry),
});
export type MemberListing = z.infer<typeof memberListing>;
