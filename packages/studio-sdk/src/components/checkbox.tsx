/**
 * `Checkbox` — a design-system wrapper over Radix Checkbox (role `checkbox`). An
 * optional inline `label` renders a linked `<label>` so clicking the text toggles
 * the box (buttons are labelable). When the box carries no visible label (a
 * selection column in a table), pass `aria-label` so it still has an accessible
 * name. Inside a `Field` the box picks up the field id + a11y wiring instead.
 *
 * Appearance is the `tai-checkbox` class: Radix stamps `data-state` on the root,
 * and the stylesheet paints the checked and indeterminate grounds from it, so the
 * mark shows for a controlled AND an uncontrolled box alike. The two filled
 * states share that ground, so the MARK is what tells them apart: `CheckIcon` for
 * checked, `MinusIcon` for indeterminate, both decorative behind the control's
 * own name.
 */
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { useId } from 'react';

import { useFieldControl } from './field';
import { CheckIcon, MinusIcon } from './icons';

export interface CheckboxProps {
  /**
   * `'indeterminate'` is the MIXED state a parent box wears while only some of
   * the children it governs are checked. Radix reports it as
   * `aria-checked="mixed"`; clicking it resolves to checked, which is why the
   * change callback stays boolean.
   */
  readonly checked?: boolean | 'indeterminate';
  readonly defaultChecked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly label?: string;
  /**
   * Accessible name for a checkbox with no visible `label` (e.g. a table cell).
   * An enclosing `Field` wins where both are given — it names the box from
   * visible text, and `aria-label` would override that native label and leave
   * the visible text out of the accessible name (WCAG 2.5.3).
   */
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
      // The caller's name is the FALLBACK. A box named by an inline `label` or
      // by an enclosing `Field` is named from visible text, and `aria-label`
      // outranks a native `<label for>` — emitting both would discard that text.
      aria-label={field.id === undefined && label === undefined ? ariaLabel : undefined}
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
      {/* The indicator only ever holds the mark, so it is a bare flex box. The
          checked and indeterminate grounds are the same accent fill, so a shared
          mark would make the two states indistinguishable. */}
      <RadixCheckbox.Indicator aria-hidden="true" style={{ display: 'flex' }}>
        {checked === 'indeterminate' ? <MinusIcon /> : <CheckIcon />}
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
