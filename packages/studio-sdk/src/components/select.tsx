/**
 * `Select` — a token-styled wrapper over Radix Select (an accessible listbox with
 * a `combobox` trigger). Options are passed declaratively; the trigger auto-wires
 * to an enclosing `Field`.
 */
import * as RadixSelect from '@radix-ui/react-select';
import type { CSSProperties } from 'react';

import { controlBaseStyle } from './control-styles';
import { useFieldControl } from './field';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/** A labelled cluster of options (e.g. tools grouped by tag). */
export interface SelectGroup {
  readonly label: string;
  readonly options: readonly SelectOption[];
}

export interface SelectProps {
  readonly options: readonly SelectOption[];
  /**
   * Optional labelled groups. When provided the listbox renders these grouped
   * clusters INSTEAD of the flat `options` (pass `options={[]}` alongside). Every
   * existing caller passes `options` only, so the flat path is unchanged.
   */
  readonly groups?: readonly SelectGroup[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly name?: string;
  /** Accessible name for the trigger when it is not wired to an enclosing `Field`. */
  readonly 'aria-label'?: string;
}

const triggerStyle: CSSProperties = {
  ...controlBaseStyle,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-2)',
  cursor: 'pointer',
};

const contentStyle: CSSProperties = {
  background: 'var(--tai-color-surface-raised)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  boxShadow: 'var(--tai-shadow-md)',
  padding: 'var(--tai-space-1)',
  zIndex: 50,
  // Cap to available height and scroll overflow so a long list stays reachable;
  // the Radix var is set only in `position="popper"` mode.
  maxHeight: 'var(--radix-select-content-available-height)',
  overflowY: 'auto',
};

const itemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: 'var(--tai-space-2) var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-sm)',
  color: 'var(--tai-color-text)',
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  cursor: 'pointer',
};

const groupLabelStyle: CSSProperties = {
  padding: 'var(--tai-space-2) var(--tai-space-3) var(--tai-space-1)',
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text-muted)',
};

function OptionItem({ option }: { option: SelectOption }) {
  return (
    <RadixSelect.Item
      className="tai-select-item"
      value={option.value}
      disabled={option.disabled}
      style={itemStyle}
    >
      <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}

export function Select({
  options,
  groups,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  disabled,
  name,
  'aria-label': ariaLabel,
}: SelectProps) {
  const field = useFieldControl();
  return (
    <RadixSelect.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      name={name}
    >
      <RadixSelect.Trigger
        id={field.id}
        aria-label={ariaLabel}
        aria-describedby={field['aria-describedby']}
        aria-invalid={field['aria-invalid']}
        style={triggerStyle}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon aria-hidden="true">▾</RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} style={contentStyle}>
          <RadixSelect.Viewport>
            {groups !== undefined
              ? groups.map((group) => (
                  <RadixSelect.Group key={group.label}>
                    <RadixSelect.Label style={groupLabelStyle}>{group.label}</RadixSelect.Label>
                    {group.options.map((option) => (
                      <OptionItem key={option.value} option={option} />
                    ))}
                  </RadixSelect.Group>
                ))
              : options.map((option) => <OptionItem key={option.value} option={option} />)}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
