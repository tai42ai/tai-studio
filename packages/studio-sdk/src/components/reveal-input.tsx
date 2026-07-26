/**
 * `RevealInput` — a controlled text input whose value is MASKED by default with a
 * reveal-on-click eye toggle. The masking is native (`type="password"` when
 * hidden, `type="text"` when revealed) so editing never corrupts the value; it is
 * purely visual — the real value always lives in the input's `value`. When
 * `onChange` is omitted or `readOnly` is set the field is read-only but still
 * revealable. The value is never logged.
 *
 * The field is a `tai-input` and the toggle a `tai-icon-btn` whose accessible name
 * ("Show value" / "Hide value") states the action; the eye mark itself is
 * decorative.
 */
import { useState } from 'react';

import { Field } from './field';
import { EyeIcon, EyeOffIcon } from './icons';
import { TextInput } from './inputs';

export interface RevealInputProps {
  readonly value: string;
  readonly onChange?: (value: string) => void;
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
  readonly idPrefix?: string;
  readonly label?: string;
  readonly placeholder?: string;
  /** Accessible name for the inner input when no visual `label` is rendered. */
  readonly 'aria-label'?: string;
}

export function RevealInput({
  value,
  onChange,
  readOnly,
  disabled,
  idPrefix = 'reveal-input',
  label,
  placeholder,
  'aria-label': ariaLabel,
}: RevealInputProps) {
  const [revealed, setRevealed] = useState(false);
  const isReadOnly = readOnly === true || onChange === undefined;
  const toggleLabel = revealed ? 'Hide value' : 'Show value';

  const control = (
    <div className="tai-row">
      {/* The field takes the row; the toggle keeps its square icon-button size. */}
      <div style={{ flex: 1 }}>
        <TextInput
          type={revealed ? 'text' : 'password'}
          aria-label={ariaLabel}
          value={value}
          onChange={
            isReadOnly
              ? undefined
              : (event) => {
                  onChange(event.target.value);
                }
          }
          readOnly={isReadOnly}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button
        type="button"
        className="tai-icon-btn"
        aria-label={toggleLabel}
        data-testid={`${idPrefix}-toggle`}
        disabled={disabled}
        onClick={() => {
          setRevealed((prev) => !prev);
        }}
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );

  return (
    <div data-testid={idPrefix}>
      {label !== undefined ? <Field label={label}>{control}</Field> : control}
    </div>
  );
}
