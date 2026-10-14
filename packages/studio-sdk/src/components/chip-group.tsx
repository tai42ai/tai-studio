/**
 * `ChipGroup` — a tap-to-select grid of pill chips (`.tai-chip`), in two modes.
 *
 * `single` is a `role="radiogroup"` of `role="radio"` chips carrying `aria-checked`:
 * exactly one value is selected, the arrow keys move the selection, and only the
 * selected chip (or the first, when none is) sits in the tab order. `multi` is a
 * group of toggle buttons carrying `aria-pressed`: any number are selected, the
 * arrow keys move focus, and Space/Enter (the native button activation) toggles the
 * focused chip.
 *
 * Roving tabindex and arrow-key movement are owned here — there is no multi-select
 * primitive to borrow — so both modes share one keyboard model: ←/↑ to the previous
 * chip, →/↓ to the next (wrapping), Home/End to the ends, skipping disabled chips.
 * The handler rides each chip (a button, an interactive element) rather than the
 * container, so no static element carries an interaction. Like `RadioGroup`, the
 * group takes its accessible name from an enclosing group `Field`, not a label of
 * its own.
 */
import type { KeyboardEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';

import { useFieldControl } from './field';

/** One selectable chip: its answer `value` and the visible `label`. */
export interface ChipOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type ChipGroupProps =
  | {
      /** Exactly one value selected — a `radiogroup` of radios. */
      readonly mode: 'single';
      readonly options: readonly ChipOption[];
      readonly value: string;
      readonly onValueChange: (value: string) => void;
      readonly disabled?: boolean;
    }
  | {
      /** Any number selected — a group of `aria-pressed` toggle buttons. */
      readonly mode: 'multi';
      readonly options: readonly ChipOption[];
      readonly value: readonly string[];
      readonly onValueChange: (value: readonly string[]) => void;
      readonly disabled?: boolean;
    };

export function ChipGroup(props: ChipGroupProps): ReactNode {
  const { options, disabled = false } = props;
  const field = useFieldControl();
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isSelected = (option: ChipOption): boolean =>
    props.mode === 'single' ? props.value === option.value : props.value.includes(option.value);

  // The chip in the tab order: the (first) selected one, else the first enabled
  // one — so Tab lands on the active choice and the arrows rove from there.
  const [rovingIndex, setRovingIndex] = useState<number>(() => {
    const selected = options.findIndex(isSelected);
    if (selected >= 0) return selected;
    const firstEnabled = options.findIndex((option) => option.disabled !== true);
    return firstEnabled >= 0 ? firstEnabled : 0;
  });

  const enabledIndices = options
    .map((option, index) => (option.disabled === true ? -1 : index))
    .filter((index) => index >= 0);

  const focusChip = (index: number): void => {
    setRovingIndex(index);
    chipRefs.current[index]?.focus();
  };

  const select = (option: ChipOption): void => {
    if (props.mode === 'single') {
      props.onValueChange(option.value);
      return;
    }
    const chosen = new Set(props.value);
    if (chosen.has(option.value)) chosen.delete(option.value);
    else chosen.add(option.value);
    // Keep the OPTIONS' declared order, so the emitted array reads the way the form
    // lists the choices rather than the order the chips were pressed.
    props.onValueChange(options.map((candidate) => candidate.value).filter((v) => chosen.has(v)));
  };

  const onChipKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled || enabledIndices.length === 0) return;
    const position = enabledIndices.indexOf(rovingIndex);
    let nextPosition: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextPosition = (position + 1) % enabledIndices.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextPosition = (position - 1 + enabledIndices.length) % enabledIndices.length;
        break;
      case 'Home':
        nextPosition = 0;
        break;
      case 'End':
        nextPosition = enabledIndices.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextIndex = enabledIndices[nextPosition];
    if (nextIndex === undefined) return;
    const nextOption = options[nextIndex];
    if (nextOption === undefined) return;
    focusChip(nextIndex);
    // A radiogroup selects as it moves; a multi-select group only moves focus and
    // leaves Space/Enter to toggle.
    if (props.mode === 'single') props.onValueChange(nextOption.value);
  };

  return (
    <div
      role={props.mode === 'single' ? 'radiogroup' : 'group'}
      className="tai-row"
      aria-describedby={field['aria-describedby']}
    >
      {options.map((option, index) => {
        const selected = isSelected(option);
        return (
          <button
            key={option.value}
            ref={(element) => {
              chipRefs.current[index] = element;
            }}
            type="button"
            className="tai-chip"
            role={props.mode === 'single' ? 'radio' : undefined}
            aria-checked={props.mode === 'single' ? selected : undefined}
            aria-pressed={props.mode === 'multi' ? selected : undefined}
            // `role="group"` does not support `aria-invalid` (ARIA 1.2), so the
            // chips carry the enclosing errored Field's invalid state.
            aria-invalid={field['aria-invalid']}
            tabIndex={index === rovingIndex ? 0 : -1}
            disabled={disabled || option.disabled === true}
            onClick={() => {
              focusChip(index);
              select(option);
            }}
            onKeyDown={onChipKeyDown}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
