/** Storage resource CRUD sub-client. */
import * as s from '../schemas';
import { apiDownload, isUnsafePathSegment } from '../http';
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
function encodePath(id: string): string {
  const segments = id.split('/');
  if (segments.some(isUnsafePathSegment)) {
    throw new Error("storage path must be a relative path with no empty, '.', or '..' segment");
  }
  return segments.map(encodeURIComponent).join('/');
}

export function storageClient(t: Transport) {
  const { config, req } = t;
  return {
    // The content store a storage-provider plugin exposes. Dead by default:
    // `getStorageInfo` reports `present: false` (a 200 empty state) and every other
    // door answers a loud 501 when no provider is installed. Ids may be nested
    // paths, so each is `encodePath`-encoded (per-segment, `/` preserved).
    getStorageInfo: (signal?: AbortSignal) => req('/api/storage', s.storageInfo, { signal }),
    listStorageResources: (signal?: AbortSignal) =>
      req('/api/storage/resources', s.storageResourceList, { signal }),
    statStorageResource: (id: string, signal?: AbortSignal) =>
      req(`/api/storage/resources/${encodePath(id)}/stat`, s.storageResourceStat, { signal }),
    downloadStorageResource: (id: string, signal?: AbortSignal): Promise<Blob> =>
      apiDownload(config, `/api/storage/resources/${encodePath(id)}/content`, { signal }),
    uploadStorageResource: (body: StorageUploadBody) =>
      req('/api/storage/resources', s.storageResourceStored, { method: 'POST', body }),
    deleteStorageResource: (id: string) =>
      req(`/api/storage/resources/${encodePath(id)}`, s.storageResourceDeleted, {
        method: 'DELETE',
      }),
    deleteStorageDir: (path: string) =>
      req(`/api/storage/dirs/${encodePath(path)}`, s.storageDirDeleted, { method: 'DELETE' }),
  };
}
