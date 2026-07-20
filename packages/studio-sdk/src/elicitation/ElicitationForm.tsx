/**
 * `ElicitationForm` — the Studio-as-elicit-client widget. It renders a
 * FastMCP elicitation request (its `message` + `requestedSchema`) as a
 * `SchemaForm`, validates the answer against the schema, and hands the typed
 * answer back on submit. The schema is carried through intact, so the caller
 * gets exactly the shape it asked for.
 *
 * Accept-or-submit only: this widget's job is to collect and return a valid
 * answer. A decline/cancel is not modeled here (the platform bridge is
 * accept-or-raise); the optional `onCancel` is a UI affordance, not an MCP
 * decline round-trip. Reusable by any feature that must answer an elicit.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import { Button } from '../components/primitives';
import { defaultValueForSchema } from '../schema-form/default-value';
import { SchemaForm } from '../schema-form/SchemaForm';
import type { JsonSchema, SchemaFormErrors } from '../schema-form/types';
import { validateAgainstSchema } from '../schema-form/validate';

export interface ElicitationFormProps {
  /** The elicit request's human-readable message. */
  readonly message: string;
  /** The elicit `requestedSchema` — the answer's form schema. */
  readonly schema: JsonSchema;
  /** Called with the validated answer when the human submits. */
  readonly onSubmit: (answer: unknown) => void;
  /** Optional cancel affordance (UI only; not an MCP decline). */
  readonly onCancel?: () => void;
  /** Disables submission while an answer is in flight. */
  readonly busy?: boolean;
  readonly submitLabel?: string;
}

const messageStyle: CSSProperties = {
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
  marginBottom: 'var(--tai-space-3)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  marginTop: 'var(--tai-space-4)',
};

const stackStyle: CSSProperties = { display: 'flex', flexDirection: 'column' };

/**
 * Render the elicit message + a schema-driven answer form. On submit the answer
 * is validated against the schema; on success `onSubmit` receives the typed
 * value, otherwise the per-field errors surface and nothing is emitted.
 */
export function ElicitationForm({
  message,
  schema,
  onSubmit,
  onCancel,
  busy = false,
  submitLabel = 'Submit',
}: ElicitationFormProps): ReactNode {
  const [value, setValue] = useState<unknown>(() => defaultValueForSchema(schema));
  const [errors, setErrors] = useState<SchemaFormErrors>({});

  const submit = () => {
    const found = validateAgainstSchema(schema, value);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      onSubmit(value);
    }
  };

  return (
    <div style={stackStyle} data-testid="elicitation-form">
      <p style={messageStyle}>{message}</p>
      <SchemaForm
        schema={schema}
        value={value}
        onChange={setValue}
        errors={errors}
        idPrefix="elicit-form"
      />
      <div style={actionsStyle}>
        <Button variant="primary" onClick={submit} disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
