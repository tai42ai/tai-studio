/**
 * Upload form: a template `path` and its `content` are posted to
 * `api.uploadTemplate`; on success the master list query is invalidated so the
 * new template appears, and the form resets. A failed upload surfaces loudly in
 * an inline `ErrorState`.
 */
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Spinner,
  Textarea,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { templateDetailKey, templatesListKey } from './keys';

export function UploadTemplateForm(): ReactNode {
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
    <Card>
      <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
        Upload template
      </h2>
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
    </Card>
  );
}
