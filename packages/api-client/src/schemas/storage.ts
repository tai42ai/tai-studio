/** Storage-provider info and resource CRUD response schemas. */
import { z } from 'zod';

/** `GET /api/storage` — the storage-provider identity, or the absent sentinel
 * (`present: false`, a 200) when no storage-provider plugin is installed. */
export const storageInfo = z.object({
  present: z.boolean(),
  provider: z.string().nullable(),
  module: z.string().nullable(),
});
export type StorageInfo = z.infer<typeof storageInfo>;

/** `GET /api/storage/resources` — the full sorted resource-id list. */
export const storageResourceList = z.object({ resources: z.array(z.string()) });

/** `GET /api/storage/resources/{id}/stat` — an object's inferred content type;
 * `null` when the provider cannot infer one (e.g. an unknown suffix). */
export const storageResourceStat = z.object({
  id: z.string(),
  content_type: z.string().nullable(),
});
export type StorageResourceStat = z.infer<typeof storageResourceStat>;

/** `POST /api/storage/resources` — the stored object's id. */
export const storageResourceStored = z.object({ id: z.string(), stored: z.literal(true) });

/** `DELETE /api/storage/resources/{id}` — the removed object's id. */
export const storageResourceDeleted = z.object({ id: z.string(), deleted: z.literal(true) });

/** `DELETE /api/storage/dirs/{path}` — the removed directory subtree. */
export const storageDirDeleted = z.object({ dir: z.string(), deleted: z.literal(true) });
