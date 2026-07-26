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
import type { ReactNode } from 'react';
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
    <div className="tai-stack" data-testid="elicitation-form">
      {/* The message is text the Studio did not author — the prose measure keeps
          a long elicit prompt to a readable line length. It applies to a
          PARAGRAPH INSIDE `.tai-prose`, so the class goes on the wrapper. */}
      <div className="tai-prose">
        <p>{message}</p>
      </div>
      <SchemaForm
        schema={schema}
        value={value}
        onChange={setValue}
        errors={errors}
        idPrefix="elicit-form"
      />
      <div className="tai-row">
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
