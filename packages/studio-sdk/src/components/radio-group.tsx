/**
 * `RadioGroup` — a token-styled wrapper over Radix RadioGroup (role `radiogroup`
 * with `radio` items). Each option renders a linked label so the text is the
 * radio's accessible name.
 */
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { useId } from 'react';
import type { CSSProperties } from 'react';

import { useFieldControl, useFieldLabelId } from './field';

export interface RadioOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface RadioGroupProps {
  readonly options: readonly RadioOption[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly disabled?: boolean;
  readonly name?: string;
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
};

const optionStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
  cursor: 'pointer',
};

const itemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.15rem',
  height: '1.15rem',
  background: 'var(--tai-color-surface-raised)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: '50%',
  cursor: 'pointer',
  padding: 0,
};

const indicatorStyle: CSSProperties = {
  width: '0.55rem',
  height: '0.55rem',
  borderRadius: '50%',
  background: 'var(--tai-color-primary)',
  display: 'block',
};

export function RadioGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  name,
}: RadioGroupProps) {
  const field = useFieldControl();
  const labelId = useFieldLabelId();
  const baseId = useId();
  return (
    <RadixRadioGroup.Root
      aria-labelledby={labelId}
      aria-describedby={field['aria-describedby']}
      aria-invalid={field['aria-invalid']}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      name={name}
      style={rootStyle}
    >
      {options.map((option) => {
        const itemId = `${baseId}-${option.value}`;
        return (
          <label key={option.value} htmlFor={itemId} style={optionStyle}>
            <RadixRadioGroup.Item
              id={itemId}
              value={option.value}
              disabled={option.disabled}
              style={itemStyle}
            >
              <RadixRadioGroup.Indicator style={indicatorStyle} />
            </RadixRadioGroup.Item>
            <span>{option.label}</span>
          </label>
        );
      })}
    </RadixRadioGroup.Root>
  );
}
