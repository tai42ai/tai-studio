/**
 * The multi-select field renderer (scope E): an array of a fixed set of strings drawn
 * as a checkbox group, one checkbox per option, emitting a `string[]`. Classification
 * lands an array here only when its items carry a known option set (an `enum`, or a
 * per-send option list), so there is always a definite set of boxes to draw; an array of
 * free strings stays the add/remove `array` field.
 */
import type { ReactNode } from 'react';

import { Checkbox } from '../components/checkbox';
import { Field } from '../components/field';
import type { FieldModel } from './field-model';

export function MultiSelectField({
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
  model: Extract<FieldModel, { kind: 'multiselect' }>;
  value: unknown;
  onChange: (value: unknown) => void;
}): ReactNode {
  const selected = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
  // Toggle keeps the selection in the OPTIONS' declared order, so the emitted array reads
  // the way the form lists the choices rather than the order the boxes were clicked.
  const toggle = (optionValue: string, checked: boolean): void => {
    const next = checked ? [...selected, optionValue] : selected.filter((v) => v !== optionValue);
    const ordered = model.options
      .map((option) => String(option.value))
      .filter((candidate) => next.includes(candidate));
    onChange(ordered);
  };
  return (
    <Field label={heading} description={description} error={error} group>
      {model.options.map((option, index) => {
        const optionValue = String(option.value);
        return (
          <Checkbox
            key={index}
            label={option.label}
            checked={selected.includes(optionValue)}
            onCheckedChange={(checked) => {
              toggle(optionValue, checked);
            }}
          />
        );
      })}
    </Field>
  );
}
