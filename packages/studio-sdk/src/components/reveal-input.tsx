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
import type { SVGProps } from 'react';

import { Field } from './field';
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
          className="tai-input"
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

// -- Eye marks ---------------------------------------------------------------
// Drawn on the icon set's 24-unit grid in `currentColor` at a 1.6 stroke, and
// sized by `tai-icon`, so they sit level with every other mark in a control.

function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="tai-icon"
      {...props}
    >
      <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="tai-icon"
      {...props}
    >
      <path d="M17.9 17.9A9.9 9.9 0 0 1 12 19.8c-6.2 0-10-7-10-7a18.3 18.3 0 0 1 4.6-5.4" />
      <path d="M9.9 4.4A9.1 9.1 0 0 1 12 4.2c6.2 0 10 7 10 7a18.4 18.4 0 0 1-2.1 3.1" />
      <path d="M14.1 14.1a3.2 3.2 0 1 1-4.4-4.4" />
      <path d="M2.6 2.6 21.4 21.4" />
    </svg>
  );
}
