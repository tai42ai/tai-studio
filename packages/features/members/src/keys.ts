/**
 * TanStack Query keys for the members surface. Centralising the key keeps the
 * query definition and any later invalidation referring to the same tuple.
 */

/** Key for the aggregated membership read (`GET /api/auth/members`). */
export const membersKey = ['members'] as const;
