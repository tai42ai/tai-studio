/**
 * `RadioGroup` — a design-system wrapper over Radix RadioGroup (role `radiogroup`
 * with `radio` items), in two shapes.
 *
 * `list` (the default) renders one row per option: a dot indicator inside a
 * linked `<label>`, so the option text is the radio's accessible name.
 * `segmented` renders each option AS a segment — the Radix item itself is the
 * control, carrying its icon and its label with no dot — which is the shape a
 * compact single-choice control (a light / dark / system switcher) needs.
 *
 * The group takes its accessible name from an enclosing `Field`, from a `label`
 * it renders itself, or from `aria-label`. Roving tabindex and arrow-key movement
 * belong to Radix and follow `orientation`; this component only chooses the
 * layout that matches it.
 */
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { useId } from 'react';
import type { ReactNode } from 'react';

import { useFieldControl, useFieldLabelId } from './field';

export interface RadioOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** Mark rendered alongside the label. Decorative — the label carries the name. */
  readonly icon?: ReactNode;
  /** Render the label for screen readers only; it stays the option's accessible name. */
  readonly visuallyHiddenLabel?: boolean;
}

export interface RadioGroupProps {
  readonly options: readonly RadioOption[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly disabled?: boolean;
  readonly name?: string;
  /** Visible group label, rendered above the options and wired as the group's name. */
  readonly label?: string;
  /** Accessible group name when neither `label` nor an enclosing `Field` supplies one. */
  readonly 'aria-label'?: string;
  /** Arrow-key axis and layout. Defaults to `vertical`. */
  readonly orientation?: 'horizontal' | 'vertical';
  /** `list` is a stack of labelled radios; `segmented` is a compact segment strip. */
  readonly variant?: 'list' | 'segmented';
}

/** The option's name text, hidden from sight but not from assistive tech on request. */
function OptionLabel({ option }: { readonly option: RadioOption }): ReactNode {
  return (
    <span className={option.visuallyHiddenLabel === true ? 'tai-visually-hidden' : undefined}>
      {option.label}
    </span>
  );
}

export function RadioGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  name,
  label,
  'aria-label': ariaLabel,
  orientation = 'vertical',
  variant = 'list',
}: RadioGroupProps) {
  const field = useFieldControl();
  const fieldLabelId = useFieldLabelId();
  const baseId = useId();
  const ownLabelId = `${baseId}-label`;
  // An enclosing Field names the group first; a `label` this component renders
  // is the standalone fallback. Neither means the group is named by `aria-label`.
  const labelledBy = fieldLabelId ?? (label === undefined ? undefined : ownLabelId);

  const rootClassName =
    variant === 'segmented'
      ? 'tai-segmented'
      : orientation === 'horizontal'
        ? 'tai-row'
        : 'tai-stack tai-stack-2';

  const group = (
    <RadixRadioGroup.Root
      className={rootClassName}
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
      aria-describedby={field['aria-describedby']}
      aria-invalid={field['aria-invalid']}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      name={name}
      orientation={orientation}
    >
      {options.map((option) => {
        if (variant === 'segmented') {
          return (
            <RadixRadioGroup.Item
              key={option.value}
              className="tai-segment"
              value={option.value}
              disabled={option.disabled}
            >
              {option.icon}
              <OptionLabel option={option} />
            </RadixRadioGroup.Item>
          );
        }
        const itemId = `${baseId}-${option.value}`;
        return (
          <label key={option.value} htmlFor={itemId} className="tai-choice">
            <RadixRadioGroup.Item
              id={itemId}
              className="tai-radio"
              value={option.value}
              disabled={option.disabled}
            >
              <RadixRadioGroup.Indicator className="tai-radio-indicator" />
            </RadixRadioGroup.Item>
            {option.icon}
            <OptionLabel option={option} />
          </label>
        );
      })}
    </RadixRadioGroup.Root>
  );

  if (label === undefined) return group;
  return (
    <div className="tai-stack tai-stack-2">
      <span id={ownLabelId} className="tai-field-label">
        {label}
      </span>
      {group}
    </div>
  );
}
