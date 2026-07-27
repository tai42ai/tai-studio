/**
 * `Select` — a design-system wrapper over Radix Select (an accessible listbox with
 * a `combobox` trigger). Options are passed declaratively — either a flat
 * `options` run or labelled `groups`, never both — and the trigger auto-wires to
 * an enclosing `Field`.
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

/** Everything the two listbox shapes have in common. */
interface SelectSharedProps {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly name?: string;
  /** Accessible name for the trigger when it is not wired to an enclosing `Field`. */
  readonly 'aria-label'?: string;
}

/** The FLAT listbox: one ungrouped run of options. */
export interface SelectProps extends SelectSharedProps {
  readonly options: readonly SelectOption[];
}

/** The GROUPED listbox: labelled clusters, each carrying its own options. */
export interface SelectGroupsProps extends SelectSharedProps {
  readonly groups: readonly SelectGroup[];
}

/**
 * What `Select` ACCEPTS: exactly one of the two shapes, never both. Only one
 * list can be rendered, so accepting `options` alongside `groups` means
 * discarding every entry of the other without a word.
 *
 * The exclusion lives HERE and not on the two interfaces because both are
 * published plugin API and must stay extendable: `groups?: undefined` written
 * onto `SelectProps` makes `interface MyPicker extends SelectProps { groups:
 * readonly SelectGroup[] }` a TS2430, and a union cannot be `extends`-ed at all
 * (TS2312).
 */
type SelectArgs =
  | (SelectProps & { readonly groups?: undefined })
  | (SelectGroupsProps & { readonly options?: undefined });

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

export function Select(props: SelectArgs) {
  const {
    value,
    defaultValue,
    onValueChange,
    placeholder = 'Select…',
    disabled,
    name,
    'aria-label': ariaLabel,
  } = props;
  const field = useFieldControl();
  // Untyped JavaScript is the only caller that reaches this. Rendering one list
  // and dropping the other would lose every entry in the discarded one silently,
  // and an empty listbox reads as "there is nothing to choose".
  if ((props.options === undefined) === (props.groups === undefined)) {
    throw new Error(
      'Select renders exactly one of `options` or `groups`; it was given both, or neither.',
    );
  }
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
          <RadixSelect.Viewport className="tai-select-viewport">
            {props.groups !== undefined
              ? props.groups.map((group) => (
                  <RadixSelect.Group key={group.label}>
                    <RadixSelect.Label className="tai-select-group-label tai-label">
                      {group.label}
                    </RadixSelect.Label>
                    {group.options.map((option) => (
                      <OptionItem key={option.value} option={option} />
                    ))}
                  </RadixSelect.Group>
                ))
              : props.options.map((option) => <OptionItem key={option.value} option={option} />)}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
