/**
 * The fixed-kwargs JSON field: a textarea whose description lists the base tool's
 * declared input field names when they resolve. A malformed body blocks submit with
 * the parser message (surfaced via `error`), never a silent empty bake.
 */
import { Field, Textarea } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

// The secret-reference help shared by every fixed-kwargs authoring surface (the
// create form and the save-version dialog). Single-quoted so the `${VAR}` markers
// stay literal text, never string interpolation.
export const KWARGS_SECRET_REFERENCE_HELP =
  'A string value written !ENV ${VAR} is a secret reference: the server resolves it ' +
  'from that environment variable when the preset binds and stores only the reference, ' +
  'never the resolved value. A !ENV ${VAR:default} default is stored in the clear, so ' +
  'never write a credential as a default.';

export function PresetKwargsField({
  hints,
  value,
  onChange,
  error,
}: {
  readonly hints: string[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error: string | undefined;
}): ReactNode {
  const base = 'A JSON object of values baked into the preset as fixed constants.';
  const withHints = hints.length > 0 ? `${base} Base tool inputs: ${hints.join(', ')}` : base;
  return (
    <Field
      label="Fixed kwargs"
      description={`${withHints} ${KWARGS_SECRET_REFERENCE_HELP}`}
      error={error}
    >
      <Textarea
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        rows={5}
        aria-label="Fixed kwargs JSON"
        style={{ fontFamily: 'var(--tai-font-mono)' }}
      />
    </Field>
  );
}
