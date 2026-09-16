/** Principal (identity) reference, row, listing and delete-result schemas. */
import { z } from 'zod';

/**
 * A compact reference to a principal — the owner of a key, or the human behind a
 * session — carried inline on payloads that name one.
 */
export const principalRef = z.object({
  user_id: z.string(),
  kind: z.enum(['human', 'service']),
  display_name: z.string(),
});
export type PrincipalRef = z.infer<typeof principalRef>;

/**
 * A principal row (`/api/auth/principals`). `kind` is `human` (logs in
 * interactively) or `service` (holds keys only, never logs in). `created_by` is
 * the principal that created this one, or `null` for the owner the setup door
 * mints. `disabled` turns off every credential the principal owns. `created_at`
 * is an ISO-8601 instant.
 */
export const principal = z.object({
  user_id: z.string(),
  kind: z.enum(['human', 'service']),
  display_name: z.string(),
  created_by: z.string().nullable(),
  disabled: z.boolean(),
  created_at: z.string(),
});
export type Principal = z.infer<typeof principal>;

/** The principals listing (`GET /api/auth/principals`). */
export const principalList = z.array(principal);
export type PrincipalList = z.infer<typeof principalList>;

/** The delete result (`DELETE /api/auth/principals/{user_id}`). */
export const principalDeleted = z.object({
  user_id: z.string(),
  deleted: z.boolean(),
});
export type PrincipalDeleted = z.infer<typeof principalDeleted>;
