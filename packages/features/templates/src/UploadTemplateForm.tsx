/**
 * Upload form for templates. TEXT mode authors one template inline. FILES mode picks
 * many, but the backend door is single-item, so it loops — one request per file, path
 * derived from the file name. A conflict check blocks the whole batch before any
 * request, since the door overwrites silently on a colliding path. FILES resets only
 * when every file succeeded, leaving failures listed to retry.
 */
import { useRef, useState, type ChangeEvent, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  RadioGroup,
  Spinner,
  Textarea,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { templateDetailKey, templatesListKey } from './keys';

type UploadMode = 'text' | 'files';

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

/** The single-template authoring form (a path + its content). */
function TextUploadForm(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [path, setPath] = useState('');
  const [content, setContent] = useState('');

  const mutation = useMutation({
    mutationFn: (input: { path: string; content: string }) =>
      api.uploadTemplate(input.path, input.content),
    onSuccess: (_result, variables) => {
      setPath('');
      setContent('');
      void queryClient.invalidateQueries({ queryKey: templatesListKey });
      // Overwriting an existing template must also refresh its open detail view,
      // which is keyed by path — the list key alone would leave it stale.
      void queryClient.invalidateQueries({ queryKey: templateDetailKey(variables.path) });
    },
  });

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    mutation.mutate({ path, content });
  };

  const canSubmit = path.trim().length > 0 && !mutation.isPending;

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
    >
      <Field label="Path" description="The template path, e.g. prompts/summary.md">
        <TextInput
          value={path}
          placeholder="prompts/summary.md"
          onChange={(event) => {
            setPath(event.target.value);
          }}
        />
      </Field>
      <Field label="Content">
        <Textarea
          value={content}
          rows={8}
          placeholder="Template body…"
          onChange={(event) => {
            setContent(event.target.value);
          }}
        />
      </Field>
      {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {mutation.isPending ? <Spinner label="Uploading" /> : null}
          Upload
        </Button>
      </div>
    </form>
  );
}

/** One picked file, its derived template path, and its per-file upload outcome. */
interface FileEntry {
  readonly path: string;
  readonly file: File;
  readonly status: 'pending' | 'uploading' | 'done' | 'error';
  readonly error: string | null;
}

const STATUS_BADGE: Record<FileEntry['status'], { label: string; variant: string }> = {
  pending: { label: 'Ready', variant: 'neutral' },
  uploading: { label: 'Uploading…', variant: 'primary' },
  done: { label: 'Uploaded', variant: 'success' },
  error: { label: 'Failed', variant: 'danger' },
};

/** The multi-file batch form: pick many, loop the single-item door, report each. */
function FilesUploadForm(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // The existing keys, read from the shared list cache, are the conflict oracle.
  const listQuery = useQuery({ queryKey: templatesListKey, queryFn: () => api.listTemplates() });
  const existing = new Set(listQuery.data ?? []);

  // The entries awaiting upload (a `done` entry is settled and excluded).
  const outstanding = entries.filter((entry) => entry.status !== 'done');

  // CONFLICT CHECK — computed on every render, BEFORE any request. A path already on
  // the server, or a name picked twice in this batch, blocks the whole batch: the
  // single-item door overwrites, so an accidental collision would clobber silently.
  const seen = new Map<string, number>();
  for (const entry of outstanding) seen.set(entry.path, (seen.get(entry.path) ?? 0) + 1);
  const conflicts = outstanding
    .filter((entry) => existing.has(entry.path) || (seen.get(entry.path) ?? 0) > 1)
    .map((entry) => entry.path);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <Field
        label="Files"
        description="Each file becomes a template; its path is the file name."
        group
      >
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
            const conflict = conflictSet.has(entry.path);
            return (
              <li
                key={entry.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--tai-space-2)',
                }}
              >
                <span className="tai-mono" style={{ wordBreak: 'break-all', flex: '1 1 auto' }}>
                  {entry.path}
                </span>
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

      {listQuery.isError ? (
        <ErrorState
          message={`Could not load existing templates to check for conflicts: ${errorMessage(listQuery.error)}. Uploading is blocked until the list loads — retry.`}
        />
      ) : null}
      {conflicts.length > 0 ? (
        <ErrorState
          message={`These paths already exist or repeat in this batch: ${conflicts.join(', ')}. Rename or remove them before uploading.`}
        />
      ) : null}
      {entries.some((entry) => entry.status === 'error') ? (
        <ErrorState message="Some files failed to upload. The ones still marked Failed can be retried." />
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
        <Button
          type="button"
          variant="primary"
          disabled={!canSubmit}
          onClick={() => {
            void onSubmit();
          }}
        >
          {submitting ? <Spinner label="Uploading" /> : null}
          Upload
        </Button>
      </div>
    </div>
  );
}

export function UploadTemplateForm(): ReactNode {
  const [mode, setMode] = useState<UploadMode>('text');

  return (
    <Card>
      <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
        Upload template
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <Field label="Source" group>
          <RadioGroup
            name="template-upload-mode"
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
        {mode === 'text' ? <TextUploadForm /> : <FilesUploadForm />}
      </div>
    </Card>
  );
}
