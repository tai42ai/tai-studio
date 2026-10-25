/**
 * TanStack Query keys for the Storage screen. Centralising the keys keeps each
 * query definition and its later invalidation referring to the same tuple.
 */
import type { StorageDoor } from './use-storage-doors';

/** Key for the storage-provider identity (`GET /api/storage`). */
export const storageInfoKey = ['storage', 'info'] as const;

/** Key for the resource-id list (`GET /api/storage/resources`). */
export const storageResourcesKey = ['storage', 'resources'] as const;

/** Key for the template-id list (`GET /api/templates`); the template pickers share it. */
export const templateNamesKey = ['templates', 'names'] as const;

/** The list key of a door. */
export function listKey(door: StorageDoor): readonly string[] {
  return door === 'storage' ? storageResourcesKey : templateNamesKey;
}

/** Key prefix of every object's detail. */
export const storageEntryRoot = ['storage', 'entry'] as const;

/** Key for one object's detail, whichever door reads it. */
export const storageEntryKey = (id: string) => [...storageEntryRoot, id] as const;
