/**
 * The enum field renderer. A short enum (up to {@link RADIO_MAX_OPTIONS}
 * options) renders as a radio group; a longer one renders as a select. Options
 * are keyed by index so a non-string enum value round-trips through the string
 * control.
 */
import type { ReactNode } from 'react';

import { ChipGroup } from '../components/chip-group';
import { Field } from '../components/field';
import { RadioGroup } from '../components/radio-group';
import { Select } from '../components/select';
import type { FieldModel } from './field-model';

// The documented radio-vs-select threshold, shared across channels: a choice of this many
// options or fewer draws as a radio group, a longer one as a select.
const RADIO_MAX_OPTIONS = 5;

export function EnumField({
  heading,
  description,
  error,
  model,
  value,
  onChange,
  choiceLabel,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  model: Extract<FieldModel, { kind: 'enum' }>;
  value: unknown;
  onChange: (value: unknown) => void;
  /** The select's placeholder when the field draws as a select; absent shows `Select…`. */
  choiceLabel?: string;
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

  // `control: chips` draws the choice as a chip grid in place of the radio/select,
  // at any option count.
  if (model.control === 'chips') {
    return (
      <Field label={heading} description={description} error={error} group>
        <ChipGroup
          mode="single"
          options={options.map((option) => ({ value: option.key, label: option.label }))}
          value={selectedKey}
          onValueChange={emit}
        />
      </Field>
    );
  }

  if (options.length <= RADIO_MAX_OPTIONS) {
    return (
      <Field label={heading} description={description} error={error} group>
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
        placeholder={choiceLabel}
      />
    </Field>
  );
}
