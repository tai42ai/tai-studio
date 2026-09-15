/**
 * The fixed-kwargs JSON field: a textarea whose description lists the base tool's
 * declared input field names when they resolve. A malformed body blocks submit with
 * the parser message (surfaced via `error`), never a silent empty bake.
 */
import { Field, Textarea } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

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
  return (
    <Field
      label="Fixed kwargs"
      description={hints.length > 0 ? `${base} Base tool inputs: ${hints.join(', ')}` : base}
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
