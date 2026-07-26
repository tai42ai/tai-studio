/**
 * `Select` — a design-system wrapper over Radix Select (an accessible listbox with
 * a `combobox` trigger). Options are passed declaratively; the trigger auto-wires
 * to an enclosing `Field`.
 *
 * Every surface is a class — `tai-select-trigger` for the control, and
 * `tai-select-content` / `tai-select-item` for the popup, which is where the
 * shared keyboard-highlight rule lives. The disclosure mark is the design
 * system's `ChevronDownIcon`, decorative behind the trigger's own name.
 */
import * as RadixSelect from '@radix-ui/react-select';

import { SELECT_TRIGGER_CLASS } from './control-styles';
import { useFieldControl } from './field';
import { CheckIcon, ChevronDownIcon } from './icons';

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

function OptionItem({ option }: { option: SelectOption }) {
  return (
    <RadixSelect.Item className="tai-select-item" value={option.value} disabled={option.disabled}>
      <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
      {/* The highlight follows the reader through the list, so it cannot also
          stand for the chosen value. The check is what marks that, and Radix
          renders it for the selected option only. It is decorative: Radix already
          puts `aria-selected` on the item. */}
      <RadixSelect.ItemIndicator className="tai-select-item-indicator">
        <CheckIcon />
      </RadixSelect.ItemIndicator>
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
        className={SELECT_TRIGGER_CLASS}
        aria-label={ariaLabel}
        aria-describedby={field['aria-describedby']}
        aria-invalid={field['aria-invalid']}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon aria-hidden="true">
          <ChevronDownIcon />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="tai-select-content" position="popper" sideOffset={4}>
          <RadixSelect.Viewport>
            {groups !== undefined
              ? groups.map((group) => (
                  <RadixSelect.Group key={group.label}>
                    <RadixSelect.Label className="tai-select-group-label tai-label">
                      {group.label}
                    </RadixSelect.Label>
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
