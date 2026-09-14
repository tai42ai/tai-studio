/**
 * The document editor: the effective schema's `SchemaForm` when representable (an
 * object shape), else a client-validated JSON `Textarea`. Save is blocked while the
 * value is invalid, so no `PUT` fires on a malformed document. A `create` seeds the
 * value from the schema.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  ErrorState,
  Field,
  SchemaForm,
  Spinner,
  Textarea,
  defaultValueForSchema,
  errorMessage,
  validateAgainstSchema,
  type JsonSchema,
} from '@tai42/studio-sdk';

/** Whether a schema can drive the visual `SchemaForm` (an object shape), else JSON. */
function isRepresentable(schema: JsonSchema | null): schema is JsonSchema {
  if (schema === null) return false;
  if (schema.type === 'object') return true;
  return schema.properties !== undefined;
}

export interface DocumentEditorProps {
  readonly schema: JsonSchema | null;
  readonly initial: Record<string, unknown> | undefined;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onCancel: () => void;
  readonly onSave: (data: Record<string, unknown>) => void;
}

export function DocumentEditor({
  schema,
  initial,
  pending,
  error,
  onCancel,
  onSave,
}: DocumentEditorProps): ReactNode {
  const representable = isRepresentable(schema);
  const seed = useMemo<unknown>(() => {
    if (initial !== undefined) return initial;
    return representable ? defaultValueForSchema(schema) : {};
  }, [initial, representable, schema]);

  const [formValue, setFormValue] = useState<unknown>(seed);
  const [text, setText] = useState<string>(() => JSON.stringify(seed ?? {}, null, 2));
  const [textError, setTextError] = useState<string | null>(null);

  const formErrors = useMemo(
    () => (representable ? validateAgainstSchema(schema, formValue) : {}),
    [representable, schema, formValue],
  );
  const formInvalid = representable && Object.keys(formErrors).length > 0;

  const onSubmit = (): void => {
    if (representable) {
      if (formInvalid) return;
      onSave((formValue ?? {}) as Record<string, unknown>);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      setTextError(`Invalid JSON: ${errorMessage(parseError)}`);
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setTextError('The document must be a JSON object.');
      return;
    }
    setTextError(null);
    onSave(parsed as Record<string, unknown>);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      {representable ? (
        <SchemaForm schema={schema} value={formValue} onChange={setFormValue} errors={formErrors} />
      ) : (
        <Field
          label="Document (JSON)"
          description="This state's schema is not a plain object shape; edit the document as JSON."
          error={textError ?? undefined}
        >
          <Textarea
            value={text}
            rows={12}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        </Field>
      )}
      {error !== null && error !== undefined ? <ErrorState message={errorMessage(error)} /> : null}
      <div style={{ display: 'flex', gap: 'var(--tai-space-3)' }}>
        <Button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onSubmit}
          disabled={pending || formInvalid}
        >
          {pending ? <Spinner label="Saving" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}
