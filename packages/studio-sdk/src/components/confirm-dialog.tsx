/**
 * `ConfirmDialog` — a modal that asks the operator to confirm an action and then
 * runs it. It owns the scaffolding every confirm shares: a Cancel button, the
 * confirm button (showing a pending Spinner while the action runs and disabled
 * meanwhile), and a loud `ErrorState` when the action fails. The caller supplies
 * the prompt as `children` and drives the action through `onConfirm` /
 * `isPending` / `error`.
 *
 * Mount it only while the confirmation is active; any close gesture — Cancel,
 * Escape, the overlay — calls `onClose`. The confirm button is destructive
 * (`danger`) by default; pass `confirmVariant` for a non-destructive confirm.
 *
 * The footer is the design system's `tai-dialog-actions` row, so every confirm
 * across Studio lands its buttons in the same place.
 */
import type { ReactNode } from 'react';

import { Dialog } from './dialog';
import { Button, ErrorState, Spinner } from './primitives';
import { errorMessage } from '../errors';

export interface ConfirmDialogProps {
  readonly title: string;
  /** The confirm button's resting label (e.g. `Delete scope`). */
  readonly confirmLabel: string;
  /** The Spinner's accessible label while the action runs (e.g. `Deleting`). */
  readonly pendingLabel: string;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly isPending: boolean;
  /** The failed action's error, rendered loudly; omit/`null` while there is none. */
  readonly error?: Error | null;
  readonly confirmVariant?: 'primary' | 'danger';
  /** The prompt body — what the operator is confirming. */
  readonly children: ReactNode;
}

export function ConfirmDialog({
  title,
  confirmLabel,
  pendingLabel,
  onConfirm,
  onClose,
  isPending,
  error,
  confirmVariant = 'danger',
  children,
}: ConfirmDialogProps): ReactNode {
  return (
    <Dialog
      title={title}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {children}
      {error != null ? <ErrorState message={errorMessage(error)} /> : null}
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant={confirmVariant} disabled={isPending} onClick={onConfirm}>
          {isPending ? <Spinner label={pendingLabel} /> : null}
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
