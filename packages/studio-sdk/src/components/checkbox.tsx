/**
 * `Checkbox` — a token-styled wrapper over Radix Checkbox (role `checkbox`). An
 * optional inline `label` renders a linked `<label>` so clicking the text toggles
 * the box (buttons are labelable). When the box carries no visible label (a
 * selection column in a table), pass `aria-label` so it still has an accessible
 * name. Inside a `Field` the box picks up the field id + a11y wiring instead.
 */
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { useId } from 'react';
import type { CSSProperties } from 'react';

import { useFieldControl } from './field';

export interface CheckboxProps {
  readonly checked?: boolean;
  readonly defaultChecked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly label?: string;
  /** Accessible name for a checkbox with no visible `label` (e.g. a table cell). */
  readonly 'aria-label'?: string;
  readonly name?: string;
  readonly value?: string;
}

const rootStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.15rem',
  height: '1.15rem',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-sm)',
  cursor: 'pointer',
  padding: 0,
  color: 'var(--tai-color-primary-text)',
};

const labelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
  cursor: 'pointer',
};

export function Checkbox({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  label,
  'aria-label': ariaLabel,
  name,
  value,
}: CheckboxProps) {
  const field = useFieldControl();
  const generatedId = useId();
  const id = field.id ?? generatedId;

  const box = (
    <RadixCheckbox.Root
      id={id}
      aria-label={ariaLabel}
      aria-describedby={field['aria-describedby']}
      aria-invalid={field['aria-invalid']}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={(next) => {
        onCheckedChange?.(next === true);
      }}
      disabled={disabled}
      name={name}
      value={value}
      style={{
        ...rootStyle,
        background: checked ? 'var(--tai-color-primary)' : 'var(--tai-color-surface-raised)',
      }}
    >
      <RadixCheckbox.Indicator aria-hidden="true">✓</RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );

  if (label === undefined) return box;
  return (
    <label htmlFor={id} style={labelStyle}>
      {box}
      <span>{label}</span>
    </label>
  );
}
