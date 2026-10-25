/** Storage resource CRUD sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import { apiDownload } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

/**
 * Body for a storage upload (POST `/api/storage/resources`). Exactly ONE of
 * `content_text` (stored verbatim) or `content_base64` (a base64 string decoded to
 * bytes) supplies the content for `id`; uploading an existing id overwrites it
 * (provider passthrough semantics).
 */
export interface StorageUploadBody {
  readonly id: string;
  readonly content_text?: string;
  readonly content_base64?: string;
}

/**
 * A possibly-nested storage id for a `{resource_id:path}` route parameter. Only a `.`
 * or `..` segment is refused here: the browser's URL parser removes those before the
 * request is sent, so `./x` would silently reach `x`. Every other spelling (`a//b`,
 * `x/`) is sent as typed, and the server refuses every non-canonical key, these
 * included, with the same words.
 */
function storagePath(id: string): string {
  if (id.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error(
      `non-canonical store key '${id}': a key is '/'-separated names with no empty, '.' or '..' segment`,
    );
  }
  return id;
}

export function storageClient(t: Transport) {
  const { config, req } = t;
  return {
    // The content store a storage-provider plugin exposes. Dead by default:
    // `getStorageInfo` reports `present: false` (a 200 empty state) and every other
    // door answers a loud 501 when no provider is installed. Ids may be nested
    // paths: `storagePath` refuses a dot segment the browser would remove, and
    // `buildPath` encodes each part of the route's `{…:path}` parameter with the `/`
    // separators preserved; the server refuses every other non-canonical key.
    getStorageInfo: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_storage.path, s.storageInfo, { signal }),
    listStorageResources: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_storage_resources.path, s.storageResourceList, { signal }),
    readStorageResource: (id: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_storage_entries_resource_id.path, {
          resource_id: storagePath(id),
        }),
        s.storedEntry,
        { signal },
      ),
    statStorageResource: (id: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_storage_resources_resource_id_stat.path, {
          resource_id: storagePath(id),
        }),
        s.storageResourceStat,
        { signal },
      ),
    downloadStorageResource: (id: string, signal?: AbortSignal): Promise<Blob> =>
      apiDownload(
        config,
        buildPath(apiRoutes.get_api_storage_resources_resource_id_content.path, {
          resource_id: storagePath(id),
        }),
        { signal },
      ),
    uploadStorageResource: (body: StorageUploadBody) =>
      req(apiRoutes.post_api_storage_resources.path, s.storageResourceStored, {
        method: 'POST',
        body,
      }),
    deleteStorageResource: (id: string) =>
      req(
        buildPath(apiRoutes.delete_api_storage_resources_resource_id.path, {
          resource_id: storagePath(id),
        }),
        s.storageResourceDeleted,
        {
          method: 'DELETE',
        },
      ),
    deleteStorageDir: (path: string) =>
      req(
        buildPath(apiRoutes.delete_api_storage_dirs_dir_path.path, { dir_path: storagePath(path) }),
        s.storageDirDeleted,
        {
          method: 'DELETE',
        },
      ),
  };
}
