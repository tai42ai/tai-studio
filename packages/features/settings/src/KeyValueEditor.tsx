/**
 * An add/remove key/value editor whose rows round-trip through `rowsToObject`. An
 * optional one-line `description` sits under the label and describes every row
 * input and the add button.
 */
import { Button, TextInput } from '@tai42/studio-sdk';
import { type CSSProperties, type ReactNode, useId } from 'react';

import type { PolicyRow } from './policy-data';

const fieldLabelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text)',
  display: 'block',
  marginBottom: 'var(--tai-space-1)',
};

const hintStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-1)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
  marginBottom: 'var(--tai-space-2)',
};

export function KeyValueEditor({
  label,
  description,
  rows,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly description?: string;
  readonly rows: readonly PolicyRow[];
  readonly disabled: boolean;
  readonly onChange: (rows: PolicyRow[]) => void;
}): ReactNode {
  const descriptionId = useId();
  const describedBy = description === undefined ? undefined : descriptionId;
  return (
    <div>
      <span style={fieldLabelStyle}>{label}</span>
      {description === undefined ? null : (
        <p id={descriptionId} className="tai-field-hint" style={hintStyle}>
          {description}
        </p>
      )}
      {rows.map((row, index) => (
        <div key={index} style={rowStyle}>
          <TextInput
            aria-label={`${label} key ${String(index + 1)}`}
            aria-describedby={describedBy}
            placeholder="key"
            value={row.key}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, key: event.target.value };
              onChange(next);
            }}
          />
          <TextInput
            aria-label={`${label} value ${String(index + 1)}`}
            aria-describedby={describedBy}
            placeholder="value"
            value={row.value}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, value: event.target.value };
              onChange(next);
            }}
          />
          <Button
            type="button"
            aria-label={`Remove ${label} row ${String(index + 1)}`}
            disabled={disabled}
            onClick={() => {
              onChange(rows.filter((_, i) => i !== index));
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        disabled={disabled}
        aria-describedby={describedBy}
        onClick={() => {
          onChange([...rows, { key: '', value: '' }]);
        }}
      >
        {`Add ${label} row`}
      </Button>
    </div>
  );
}
