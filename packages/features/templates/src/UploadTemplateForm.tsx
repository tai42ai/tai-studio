/**
 * Upload form for templates. TEXT mode authors one template inline. FILES mode picks
 * many, but the backend door is single-item, so it loops — one request per file, path
 * derived from the file name. A conflict check blocks the whole batch before any
 * request, since the door overwrites silently on a colliding path. FILES resets only
 * when every file succeeded, leaving failures listed to retry.
 */
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useFilesUpload, type FileEntry } from './use-files-upload';

type UploadMode = 'text' | 'files';

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

const STATUS_BADGE: Record<FileEntry['status'], { label: string; variant: string }> = {
  pending: { label: 'Ready', variant: 'neutral' },
  uploading: { label: 'Uploading…', variant: 'primary' },
  done: { label: 'Uploaded', variant: 'success' },
  error: { label: 'Failed', variant: 'danger' },
};

/** The multi-file batch form: pick many, loop the single-item door, report each. */
function FilesUploadForm(): ReactNode {
  const {
    inputRef,
    entries,
    conflicts,
    conflictSet,
    listQuery,
    canSubmit,
    submitting,
    onFilesChange,
    onSubmit,
  } = useFilesUpload();

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
