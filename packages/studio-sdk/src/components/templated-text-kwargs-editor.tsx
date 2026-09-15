/**
 * The render-parameters UI for `TemplatedTextField`: the add/remove editor
 * (`KwargsEditor`) for editable values, and the read-only listing
 * (`ReadOnlyKwargs`) shown beside a read-only stored id.
 */
import { type ReactNode, useState } from 'react';

import { CloseIcon } from './icons';
import { TextInput } from './inputs';
import { Button } from './primitives';
import type { KwargRow } from './templated-text-kwargs';

/** The add/remove kwargs editor, revealed on demand and open when kwargs already exist. */
export function KwargsEditor({
  label,
  rows,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly rows: readonly KwargRow[];
  readonly disabled: boolean;
  readonly onChange: (rows: KwargRow[]) => void;
}): ReactNode {
  const [open, setOpen] = useState(rows.length > 0);
  const groupLabel = `${label} render parameters`;

  if (!open) {
    // Wrapped so the ghost button keeps its content width and stays left-aligned
    // in the field's column, marking it as this field's own disclosure rather than
    // a full-width control floating between two fields.
    return (
      <div>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            onChange([...rows, { key: '', value: '' }]);
          }}
        >
          Add render parameters
        </Button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={groupLabel}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
    >
      <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
        Render parameters
      </span>
      {rows.map((row, index) => (
        <div
          key={index}
          style={{ display: 'flex', gap: 'var(--tai-space-2)', alignItems: 'center' }}
        >
          <TextInput
            aria-label={`${groupLabel} key ${String(index + 1)}`}
            placeholder="name"
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
            aria-label={`${groupLabel} value ${String(index + 1)}`}
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
            variant="ghost"
            aria-label={`Remove ${groupLabel} ${String(index + 1)}`}
            disabled={disabled}
            onClick={() => {
              onChange(rows.filter((_, position) => position !== index));
            }}
          >
            <CloseIcon aria-hidden="true" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            onChange([...rows, { key: '', value: '' }]);
          }}
        >
          Add parameter
        </Button>
      </div>
    </div>
  );
}

/**
 * The render parameters of a read-only stored value, as read-only text — the
 * values in normal weight, NOT the muted disabled inputs a reader could mistake
 * for empty placeholders. Renders nothing when there are no kwargs.
 */
export function ReadOnlyKwargs({
  label,
  rows,
}: {
  readonly label: string;
  readonly rows: readonly KwargRow[];
}): ReactNode {
  if (rows.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={`${label} render parameters`}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}
    >
      <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
        Render parameters
      </span>
      {rows.map((row) => (
        <div key={row.key} style={{ fontFamily: 'var(--tai-font-mono)', wordBreak: 'break-all' }}>
          <code>{row.key}</code>
          <span style={{ color: 'var(--tai-color-text-muted)' }}>: </span>
          <code>{row.value}</code>
        </div>
      ))}
    </div>
  );
}
