/**
 * TanStack Query keys for the storage surface. Centralising the keys keeps each
 * query definition and its later invalidation referring to the same tuple.
 */

/** Key for the storage-provider identity (`GET /api/storage`). */
export const storageInfoKey = ['storage', 'info'] as const;

/** Key for the resource-id list (`GET /api/storage/resources`). */
export const storageResourcesKey = ['storage', 'resources'] as const;

/** Key for one resource's stat (`GET /api/storage/resources/{id}/stat`). */
export const storageStatKey = (id: string) => ['storage', 'stat', id] as const;
