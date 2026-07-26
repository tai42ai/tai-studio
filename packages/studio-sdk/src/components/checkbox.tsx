/**
 * `Checkbox` — a design-system wrapper over Radix Checkbox (role `checkbox`). An
 * optional inline `label` renders a linked `<label>` so clicking the text toggles
 * the box (buttons are labelable). When the box carries no visible label (a
 * selection column in a table), pass `aria-label` so it still has an accessible
 * name. Inside a `Field` the box picks up the field id + a11y wiring instead.
 *
 * Appearance is the `tai-checkbox` class: Radix stamps `data-state` on the root,
 * and the stylesheet paints the checked and indeterminate grounds from it, so the
 * tick shows for a controlled AND an uncontrolled box alike. The tick itself is
 * the design system's `CheckIcon`, decorative behind the control's own name.
 */
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { useId } from 'react';

import { useFieldControl } from './field';
import { CheckIcon } from './icons';

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
      className="tai-checkbox"
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
    >
      {/* The indicator only ever holds the mark, so it is a bare flex box. */}
      <RadixCheckbox.Indicator aria-hidden="true" style={{ display: 'flex' }}>
        <CheckIcon />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );

  if (label === undefined) return box;
  return (
    <label htmlFor={id} className="tai-choice">
      {box}
      <span>{label}</span>
    </label>
  );
}
