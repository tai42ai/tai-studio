/**
 * A two-click inline confirm for a destructive clear. First click reveals a
 * Cancel/Confirm prompt in place (no heavy modal — this lives inside a dialog);
 * confirming fires `onConfirm` and collapses back.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@tai42/studio-sdk';

const inlineConfirmStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
  marginTop: 'var(--tai-space-2)',
};

export function InlineConfirm({
  triggerLabel,
  prompt,
  confirmLabel,
  cancelLabel,
  disabled,
  onConfirm,
}: {
  readonly triggerLabel: string;
  readonly prompt: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly disabled: boolean;
  readonly onConfirm: () => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        variant="danger"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>
    );
  }
  return (
    <div style={inlineConfirmStyle} role="group" aria-label={triggerLabel}>
      <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
        {prompt}
      </span>
      <Button
        type="button"
        aria-label={cancelLabel}
        disabled={disabled}
        onClick={() => {
          setOpen(false);
        }}
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        variant="danger"
        aria-label={confirmLabel}
        disabled={disabled}
        onClick={() => {
          onConfirm();
          setOpen(false);
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}
