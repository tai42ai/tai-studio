/** Storage-provider info and resource CRUD response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

/** `GET /api/storage` — the storage-provider identity, or the absent sentinel
 * (`present: false`, a 200) when no storage-provider plugin is installed. */
export const storageInfo = openapi.storageInfo;
export type StorageInfo = z.infer<typeof storageInfo>;

/** `GET /api/storage/resources` — the full sorted resource-id list. */
export const storageResourceList = openapi.resourceList;

/** `GET /api/storage/resources/{id}/stat` — an object's inferred content type. */
export const storageResourceStat = openapi.resourceStat;
export type StorageResourceStat = z.infer<typeof storageResourceStat>;

/** `POST /api/storage/resources` — the stored object's id. */
export const storageResourceStored = openapi.resourceStored;

/** `DELETE /api/storage/resources/{id}` — the removed object's id. */
export const storageResourceDeleted = openapi.resourceDeleted;

/** `DELETE /api/storage/dirs/{path}` — the removed directory subtree. */
export const storageDirDeleted = openapi.dirDeleted;
