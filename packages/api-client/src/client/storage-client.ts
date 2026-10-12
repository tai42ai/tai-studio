/** Storage resource CRUD sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import { apiDownload, isUnsafePathSegment } from '../http';
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
 * Encode a possibly-nested storage id / directory path for use in a URL path,
 * percent-encoding each segment while preserving the `/` separators. A storage id
 * can be a nested path (e.g. `a/b c.txt`); encoding each segment independently keeps
 * the slashes structural and escapes everything else (spaces, `#`, `?`, …).
 *
 * Dot segments (`.`, `..`), empty segments (a leading/trailing/doubled `/`, or an
 * empty id) are REJECTED loudly rather than encoded: the browser's WHATWG URL parser
 * removes dot-segments from a relative request path before it is sent — collapsing
 * `..` even when percent-encoded — so such an id can never be faithfully transmitted.
 * Left to encode, it would silently retarget the request at an unrelated same-origin
 * route. The server enforces the same relative-path rule; failing fast here keeps a
 * malformed id from ever leaving the client.
 */
function storagePath(id: string): string {
  if (id.split('/').some(isUnsafePathSegment)) {
    throw new Error("storage path must be a relative path with no empty, '.', or '..' segment");
  }
  return id;
}

export function storageClient(t: Transport) {
  const { config, req } = t;
  return {
    // The content store a storage-provider plugin exposes. Dead by default:
    // `getStorageInfo` reports `present: false` (a 200 empty state) and every other
    // door answers a loud 501 when no provider is installed. Ids may be nested
    // paths: `storagePath` refuses a dot or empty segment, and `buildPath` encodes each
    // segment of the route's `{…:path}` parameter with the `/` separators preserved.
    getStorageInfo: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_storage.path, s.storageInfo, { signal }),
    listStorageResources: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_storage_resources.path, s.storageResourceList, { signal }),
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
