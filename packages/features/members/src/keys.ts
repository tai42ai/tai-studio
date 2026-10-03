/**
 * TanStack Query keys for the members surface. Centralising the keys keeps the
 * query definitions and any later invalidation referring to the same tuples.
 */

/** Key for the aggregated membership read (`GET /api/auth/members`). */
export const membersKey = ['members'] as const;

/** Key for the declared member-action catalog (`GET /api/auth/member-actions`). */
export const memberActionsKey = ['member-actions'] as const;
