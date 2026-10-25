import {
  Badge,
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  Field,
  RadioGroup,
  Spinner,
  Textarea,
  TextInput,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, type CSSProperties, type ReactNode, useRef, useState } from 'react';

import { listKey, storageEntryKey, templateNamesKey } from './keys';
import { monoStyle } from './storage-view';
import {
  type FileEntry,
  readFileBase64,
  readFileUtf8,
  STATUS_BADGE,
  uploadConflicts,
  type UploadMode,
} from './upload-data';
import type { StorageDoor } from './use-storage-doors';

const endRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 'var(--tai-space-2)',
};

/**
 * FILES mode picks one or MORE files at once; the backend door stays single-item, so
 * the UI LOOPS it — one `content_base64` request per file, each id derived from the
 * file name — reporting per-file success/failure. A conflict check (an id already
 * stored, or a name picked twice) blocks the whole batch first. The dialog closes only
 * when every file succeeded; a partial failure keeps the failed files listed to retry.
 * The templates door stores text only, so on it every file must decode as UTF-8 and a
 * file that does not blocks the batch.
 */
function FilesUploadPanel({
  door,
  existingIds,
  onWritten,
  onClose,
}: {
  readonly door: StorageDoor;
  readonly existingIds: readonly string[];
  readonly onWritten: (ids: readonly string[]) => void;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notText, setNotText] = useState<readonly string[]>([]);

  const outstanding = entries.filter((entry) => entry.status !== 'done');
  const conflicts = uploadConflicts(outstanding, existingIds);
  const conflictSet = new Set(conflicts);

  const onFilesChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    setEntries(files.map((file) => ({ id: file.name, file, status: 'pending', error: null })));
    setNotText([]);
  };

  const patch = (entryId: string, next: Partial<FileEntry>): void => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === entryId ? { ...entry, ...next } : entry)),
    );
  };

  const canSubmitFiles =
    outstanding.length > 0 && conflicts.length === 0 && notText.length === 0 && !submitting;

  const submitFiles = async (): Promise<void> => {
    if (!canSubmitFiles) return;
    setSubmitting(true);
    const texts = new Map<string, string>();
    if (door === 'templates') {
      const undecodable: string[] = [];
      for (const entry of outstanding) {
        const text = await readFileUtf8(entry.file);
        if (text === null) undecodable.push(entry.id);
        else texts.set(entry.id, text);
      }
      if (undecodable.length > 0) {
        setNotText(undecodable);
        setSubmitting(false);
        return;
      }
    }
    const written: string[] = [];
    let anyFailure = false;
    for (const entry of outstanding) {
      patch(entry.id, { status: 'uploading', error: null });
      try {
        const text = texts.get(entry.id);
        if (text !== undefined) {
          await api.uploadTemplate(entry.id, text);
        } else {
          const content = await readFileBase64(entry.file);
          await api.uploadStorageResource({ id: entry.id, content_base64: content });
        }
        patch(entry.id, { status: 'done', error: null });
        written.push(entry.id);
      } catch (err) {
        patch(entry.id, { status: 'error', error: errorMessage(err) });
        anyFailure = true;
      }
    }
    setSubmitting(false);
    if (written.length > 0) onWritten(written);
    // Close ONLY when the whole batch succeeded; a partial failure stays open with the
    // failed files listed so they alone can be retried.
    if (!anyFailure) onClose();
  };

  return (
    <>
      <Field label="Files" description="Each file becomes a resource id from its name." group>
        <input
          ref={inputRef}
          type="file"
          multiple
          aria-label="Choose files"
          onChange={onFilesChange}
        />
      </Field>

      {entries.length > 0 ? (
        <ul
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
          className="tai-stack tai-stack-2"
          aria-label="Selected files"
        >
          {entries.map((entry) => {
            const badge = STATUS_BADGE[entry.status];
            const conflict = conflictSet.has(entry.id);
            return (
              <li
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--tai-space-2)',
                }}
              >
                <span style={{ flex: '1 1 auto', ...monoStyle }}>{entry.id}</span>
                <Badge variant={conflict ? 'danger' : badge.variant}>
                  {conflict ? 'Conflict' : badge.label}
                </Badge>
                {entry.error !== null ? (
                  <span className="tai-status tai-status-err" style={{ flexBasis: '100%' }}>
                    {entry.error}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {notText.length > 0 ? (
        <ErrorState
          message={`These files are not UTF-8 text: ${notText.join(', ')}. Your access stores text only; ask for the storage grant to upload other files.`}
        />
      ) : null}
      {conflicts.length > 0 ? (
        <ErrorState
          message={`These ids already exist or repeat in this batch: ${conflicts.join(', ')}. Rename or remove them before uploading.`}
        />
      ) : null}
      {entries.some((entry) => entry.status === 'error') ? (
        <ErrorState message="Some files failed to upload. The ones still marked Failed can be retried." />
      ) : null}

      <div style={endRowStyle}>
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!canSubmitFiles}
          onClick={() => {
            void submitFiles();
          }}
        >
          {submitting ? <Spinner label="Uploading" /> : null}
          Upload
        </Button>
      </div>
    </>
  );
}

/**
 * The upload dialog. TEXT mode authors one resource: an id + its text content
 * (`content_text`). FILES mode picks one or more files (see {@link FilesUploadPanel}).
 * Uploading an existing id overwrites its content. It posts through the upload door
 * the caller reaches. Server errors render verbatim.
 */
export function UploadDialog({
  door,
  existingIds,
  onClose,
}: {
  readonly door: StorageDoor;
  readonly existingIds: readonly string[];
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<UploadMode>('text');
  const [id, setId] = useState('');
  const [text, setText] = useState('');

  const onWritten = (ids: readonly string[]): void => {
    void queryClient.invalidateQueries({ queryKey: listKey(door) });
    void queryClient.invalidateQueries({ queryKey: templateNamesKey });
    for (const written of ids) {
      void queryClient.invalidateQueries({ queryKey: storageEntryKey(written) });
    }
  };

  const textUpload = useMutation({
    mutationFn: async (): Promise<void> => {
      if (door === 'storage') {
        await api.uploadStorageResource({ id: id.trim(), content_text: text });
      } else {
        await api.uploadTemplate(id.trim(), text);
      }
    },
    onSuccess: () => {
      onWritten([id.trim()]);
      onClose();
    },
  });
  const canSubmitText = id.trim().length > 0 && text.length > 0 && !textUpload.isPending;

  return (
    <Dialog
      title="Upload resource"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          Uploading an existing id overwrites its content.
        </p>
        <Field label="Source" group>
          <RadioGroup
            name="upload-mode"
            value={mode}
            onValueChange={(next) => {
              setMode(next as UploadMode);
            }}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'files', label: 'Files' },
            ]}
          />
        </Field>

        {mode === 'text' ? (
          <>
            <Field label="Resource id">
              <TextInput
                value={id}
                placeholder="notes/todo.txt"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setId(event.target.value);
                }}
              />
            </Field>
            <Field label="Text content">
              <Textarea
                value={text}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                  setText(event.target.value);
                }}
              />
            </Field>
            {textUpload.isError ? <ErrorState message={errorMessage(textUpload.error)} /> : null}
            <div style={endRowStyle}>
              <Button type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!canSubmitText}
                onClick={() => {
                  textUpload.mutate();
                }}
              >
                Upload
              </Button>
            </div>
          </>
        ) : (
          <FilesUploadPanel
            door={door}
            existingIds={existingIds}
            onWritten={onWritten}
            onClose={onClose}
          />
        )}
      </div>
    </Dialog>
  );
}
