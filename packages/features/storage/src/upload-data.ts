/** Upload-dialog data: the file-entry model, its status badges, the base64 reader,
 * and the pre-flight conflict check. */

export type UploadMode = 'text' | 'files';

/** One picked file, its derived resource id, and its per-file upload outcome. */
export interface FileEntry {
  readonly id: string;
  readonly file: File;
  readonly status: 'pending' | 'uploading' | 'done' | 'error';
  readonly error: string | null;
}

export const STATUS_BADGE: Record<FileEntry['status'], { label: string; variant: string }> = {
  pending: { label: 'Ready', variant: 'neutral' },
  uploading: { label: 'Uploading…', variant: 'primary' },
  done: { label: 'Uploaded', variant: 'success' },
  error: { label: 'Failed', variant: 'danger' },
};

/**
 * Read a picked file as base64, stripping the `data:<mime>;base64,` prefix the door
 * does not want. A read failure rejects loudly — never a stale/empty payload.
 */
export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error(`Could not read ${file.name}`));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error(`Could not read ${file.name}`));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * The pre-flight conflict check, run BEFORE any request: a derived id that already
 * exists (upload overwrites) or a name picked twice in the batch blocks the whole
 * batch so nothing is clobbered by accident.
 */
export function uploadConflicts(
  outstanding: readonly FileEntry[],
  existingIds: readonly string[],
): string[] {
  const existing = new Set(existingIds);
  const seen = new Map<string, number>();
  for (const entry of outstanding) seen.set(entry.id, (seen.get(entry.id) ?? 0) + 1);
  return outstanding
    .filter((entry) => existing.has(entry.id) || (seen.get(entry.id) ?? 0) > 1)
    .map((entry) => entry.id);
}
