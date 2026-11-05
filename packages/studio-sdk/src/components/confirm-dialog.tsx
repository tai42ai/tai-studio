/**
 * `ConfirmDialog` — a modal that asks the operator to confirm an action and then
 * runs it. It owns the scaffolding every confirm shares: a Cancel button, the
 * confirm button (showing a pending Spinner while the action runs and disabled
 * meanwhile), and the action's failure read as a `WriteFailure` (a refusal because an
 * MCP server holds no tool listing on the answering worker shows as that refusal, any
 * other failure in the loud `ErrorState`). The caller supplies
 * the prompt as `children` and drives the action through `onConfirm` /
 * `isPending` / `failure`. When the failure is an OFF (disabled-feature) state
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
import { Button, Spinner } from './primitives';
import { WriteFailure } from './write-failure';

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
   * A muted node shown in the error slot INSTEAD of the failure, for the
   * OFF (disabled-feature) case: the action's store is not configured, so the
   * failure is a state, not an error. When set it takes the error slot AND disables
   * the confirm button — the action can only refuse, so there is nothing to retry.
   */
  readonly disabledNote?: ReactNode;
  /** Hold the confirm button disabled while the caller knows the action cannot pass. */
  readonly confirmDisabled?: boolean;
  readonly confirmVariant?: 'primary' | 'danger';
  /** The cancel button's label; defaults to `Cancel`. Set it when the negative
   * choice reads better as a specific verb (e.g. `Keep existing`). */
  readonly cancelLabel?: string;
  /** The prompt body — what the operator is confirming. */
  readonly children: ReactNode;
  /**
   * The action's failure, for a confirm whose action can fail in this dialog: `error` is the
   * rejection, shown through `WriteFailure`, or `null` while there is none, and any rejected value
   * is accepted as it was thrown (a message string shows as it is), so the client's refusal codes
   * stay readable; `scope` is what the failure's report names as its scope.
   */
  readonly failure?: { readonly error: unknown; readonly scope: string };
}

export function ConfirmDialog({
  title,
  confirmLabel,
  pendingLabel,
  onConfirm,
  onClose,
  isPending,
  disabledNote,
  confirmDisabled = false,
  confirmVariant = 'danger',
  cancelLabel = 'Cancel',
  children,
  failure,
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
      {disabledNote ??
        (failure?.error != null ? (
          <WriteFailure error={failure.error} scope={failure.scope} />
        ) : null)}
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          disabled={isPending || disabledNote != null || confirmDisabled}
          onClick={onConfirm}
        >
          {isPending ? <Spinner label={pendingLabel} /> : null}
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
