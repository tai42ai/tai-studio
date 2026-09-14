/**
 * The view-model for the multi-file template upload: the picked-file entries, the
 * conflict oracle (existing keys + repeats in the batch), and the per-file upload
 * loop over the single-item door.
 */
import { useRef, useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, useApi } from '@tai42/studio-sdk';

import { templateDetailKey, templatesListKey } from './keys';

/** One picked file, its derived template path, and its per-file upload outcome. */
export interface FileEntry {
  readonly path: string;
  readonly file: File;
  readonly status: 'pending' | 'uploading' | 'done' | 'error';
  readonly error: string | null;
}

/** Read a picked file's text; a read failure rejects loudly (never a silent blank). */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error(`Could not read ${file.name}`));
    };
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Could not read ${file.name}`));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsText(file);
  });
}

/**
 * The paths that would collide: a path already on the server, or a name picked
 * twice in this batch. The single-item door overwrites silently, so a collision
 * blocks the whole batch before any request.
 */
export function computeConflicts(
  outstanding: readonly FileEntry[],
  existing: ReadonlySet<string>,
): string[] {
  const seen = new Map<string, number>();
  for (const entry of outstanding) seen.set(entry.path, (seen.get(entry.path) ?? 0) + 1);
  return outstanding
    .filter((entry) => existing.has(entry.path) || (seen.get(entry.path) ?? 0) > 1)
    .map((entry) => entry.path);
}

export function useFilesUpload() {
  const api = useApi();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // The existing keys, read from the shared list cache, are the conflict oracle.
  const listQuery = useQuery({ queryKey: templatesListKey, queryFn: () => api.listTemplates() });
  const existing = new Set(listQuery.data ?? []);

  // The entries awaiting upload (a `done` entry is settled and excluded), and the
  // conflict set computed on every render, BEFORE any request.
  const outstanding = entries.filter((entry) => entry.status !== 'done');
  const conflicts = computeConflicts(outstanding, existing);
  const conflictSet = new Set(conflicts);

  const onFilesChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    setEntries(files.map((file) => ({ path: file.name, file, status: 'pending', error: null })));
  };

  const reset = (): void => {
    setEntries([]);
    if (inputRef.current !== null) inputRef.current.value = '';
  };

  const patch = (path: string, next: Partial<FileEntry>): void => {
    setEntries((prev) =>
      prev.map((entry) => (entry.path === path ? { ...entry, ...next } : entry)),
    );
  };

  // A conflict check needs the existing names; when the list query ERRORED they are
  // unknown, so the guard cannot run and the batch must not proceed as if conflict-free.
  const canSubmit =
    outstanding.length > 0 &&
    conflicts.length === 0 &&
    !submitting &&
    !listQuery.isPending &&
    !listQuery.isError;

  const onSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    setSubmitting(true);
    let anySuccess = false;
    let anyFailure = false;
    for (const entry of outstanding) {
      patch(entry.path, { status: 'uploading', error: null });
      try {
        const content = await readFileText(entry.file);
        await api.uploadTemplate(entry.path, content);
        patch(entry.path, { status: 'done', error: null });
        void queryClient.invalidateQueries({ queryKey: templateDetailKey(entry.path) });
        anySuccess = true;
      } catch (err) {
        patch(entry.path, { status: 'error', error: errorMessage(err) });
        anyFailure = true;
      }
    }
    setSubmitting(false);
    // Reflect every uploaded template even on a partial batch; reset ONLY when the
    // whole batch succeeded (close-on-success-only) so failures stay listed to retry.
    if (anySuccess) void queryClient.invalidateQueries({ queryKey: templatesListKey });
    if (!anyFailure) reset();
  };

  return {
    inputRef,
    entries,
    conflicts,
    conflictSet,
    listQuery,
    canSubmit,
    submitting,
    onFilesChange,
    onSubmit,
  };
}
