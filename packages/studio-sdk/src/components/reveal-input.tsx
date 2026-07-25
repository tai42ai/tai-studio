/**
 * `RevealInput` — a controlled text input whose value is MASKED by default with a
 * reveal-on-click eye toggle. The masking is native (`type="password"` when
 * hidden, `type="text"` when revealed) so editing never corrupts the value; it is
 * purely visual — the real value always lives in the input's `value`. When
 * `onChange` is omitted or `readOnly` is set the field is read-only but still
 * revealable. The value is never logged.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';

import { Button } from './primitives';
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

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 'var(--tai-space-2)',
};

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
    <div style={rowStyle}>
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
      <Button
        type="button"
        variant="secondary"
        aria-label={toggleLabel}
        data-testid={`${idPrefix}-toggle`}
        disabled={disabled}
        onClick={() => {
          setRevealed((prev) => !prev);
        }}
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  );

  return (
    <div data-testid={idPrefix}>
      {label !== undefined ? <Field label={label}>{control}</Field> : control}
    </div>
  );
}

// -- Icons (inline SVG; the SDK ships no icon dependency) --------------------

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
