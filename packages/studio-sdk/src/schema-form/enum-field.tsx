/**
 * The enum field renderer. A short enum (up to {@link RADIO_MAX_OPTIONS}
 * options) renders as a radio group; a longer one renders as a select. Options
 * are keyed by index so a non-string enum value round-trips through the string
 * control.
 */
import type { ReactNode } from 'react';

import { Field } from '../components/field';
import { RadioGroup } from '../components/radio-group';
import { Select } from '../components/select';
import type { FieldModel } from './classify';

const RADIO_MAX_OPTIONS = 3;

export function EnumField({
  heading,
  description,
  error,
  model,
  value,
  onChange,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  model: Extract<FieldModel, { kind: 'enum' }>;
  value: unknown;
  onChange: (value: unknown) => void;
}): ReactNode {
  const options = model.options.map((option, index) => ({
    key: String(index),
    label: option.label,
    value: option.value,
  }));
  const selected = options.find((option) => option.value === value);
  // Always a defined string so the control stays controlled from first render
  // (an `undefined` → string transition warns about uncontrolled→controlled).
  const selectedKey = selected?.key ?? '';
  const emit = (key: string): void => {
    const match = options.find((option) => option.key === key);
    if (match !== undefined) onChange(match.value);
  };

  if (options.length <= RADIO_MAX_OPTIONS) {
    return (
      <Field label={heading} description={description} error={error}>
        <RadioGroup
          options={options.map((option) => ({ value: option.key, label: option.label }))}
          value={selectedKey}
          onValueChange={emit}
        />
      </Field>
    );
  }
  return (
    <Field label={heading} description={description} error={error}>
      <Select
        options={options.map((option) => ({ value: option.key, label: option.label }))}
        value={selectedKey}
        onValueChange={emit}
      />
    </Field>
  );
}
