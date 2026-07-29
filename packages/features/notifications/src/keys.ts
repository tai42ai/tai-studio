/**
 * TanStack Query keys for the notifications surface. Centralising the key keeps
 * the query definition and any later invalidation referring to the same tuple.
 */

/** Key for the internal notifications feed (`GET /api/notifications`). */
export const notificationsKey = ['notifications'] as const;
