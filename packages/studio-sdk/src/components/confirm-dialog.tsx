/**
 * `ConfirmDialog` — a modal that asks the operator to confirm an action and then
 * runs it. It owns the scaffolding every confirm shares: a Cancel button, the
 * confirm button (showing a pending Spinner while the action runs and disabled
 * meanwhile), and a loud `ErrorState` when the action fails. The caller supplies
 * the prompt as `children` and drives the action through `onConfirm` /
 * `isPending` / `error`. When the failure is an OFF (disabled-feature) state
 * rather than a real error, the caller passes `disabledNote` — a muted note that
 * takes the error slot and blocks the confirm button, so an unconfigured store
 * never shows a loud red alert or a retry loop.
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
  /**
   * The failed action's error, rendered loudly; omit/`null` while there is none.
   *
   * A thrown `Error` or the message on its own — `Field`'s `error` is a plain
   * string, and the two props sit side by side on a form, so this one accepts
   * that spelling too rather than making one surface's `error` unassignable to
   * the other's.
   */
  readonly error?: Error | string | null;
  /**
   * A muted node shown in the error slot INSTEAD of the loud `ErrorState`, for the
   * OFF (disabled-feature) case: the action's store is not configured, so the
   * failure is a state, not an error. When set it takes the error slot AND disables
   * the confirm button — the action can only refuse, so there is nothing to retry.
   */
  readonly disabledNote?: ReactNode;
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
  disabledNote,
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
      {disabledNote ?? (error != null ? <ErrorState message={errorMessage(error)} /> : null)}
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          disabled={isPending || disabledNote != null}
          onClick={onConfirm}
        >
          {isPending ? <Spinner label={pendingLabel} /> : null}
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
