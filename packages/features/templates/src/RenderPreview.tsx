/**
 * Render preview: the caller supplies `kwargs` as JSON in a `<Textarea>`.
 * The JSON is parsed to an object BEFORE any request; a parse failure (or a
 * non-object value) is a LOUD inline field error and the render call is never
 * made. On success the rendered string is shown in a `<CodeBlock>` as ESCAPED
 * text — the no-HTML-sink rule applies to rendered output too, so a template
 * that emits `<script>` is displayed verbatim, never executed.
 */
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  CodeBlock,
  ErrorState,
  Field,
  Spinner,
  Textarea,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

/** Parse the kwargs textarea into a plain JSON object, or throw a display error. */
function parseKwargs(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return {};

  let value: unknown;
  try {
    value = JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON: ${errorMessage(error)}`);
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('kwargs must be a JSON object, e.g. { "name": "Ada" }.');
  }
  return value as Record<string, unknown>;
}

export function RenderPreview({ templateId }: { templateId: string }): ReactNode {
  const api = useApi();

  const [kwargsText, setKwargsText] = useState('{}');
  const [kwargsError, setKwargsError] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (kwargs: Record<string, unknown>) =>
      api.renderTemplate({ template_id: templateId, kwargs }),
  });

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();

    let kwargs: Record<string, unknown>;
    try {
      kwargs = parseKwargs(kwargsText);
    } catch (error) {
      setKwargsError(errorMessage(error));
      return;
    }
    setKwargsError(undefined);
    mutation.mutate(kwargs);
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Render preview</h3>
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        <Field
          label="Keyword arguments (JSON)"
          description="A JSON object passed to the template as kwargs."
          error={kwargsError}
        >
          <Textarea
            value={kwargsText}
            rows={6}
            spellCheck={false}
            onChange={(event) => {
              setKwargsText(event.target.value);
            }}
          />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner label="Rendering" /> : null}
            Render
          </Button>
        </div>
      </form>
      {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
      {mutation.isSuccess ? (
        <CodeBlock language="rendered output" code={mutation.data.rendered} />
      ) : null}
    </section>
  );
}
