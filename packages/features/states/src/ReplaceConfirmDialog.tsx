/**
 * The name-clash Replace confirm shared by the state and state-template upload doors.
 * Owns the in-dialog busy/error state so a failed replace renders in place rather than
 * closing; the caller supplies the title, confirm label and prompt body.
 */
import { ConfirmDialog } from '@tai42/studio-sdk';
import { type ReactNode, useState } from 'react';

export interface ReplaceConfirmDialogProps {
  readonly title: string;
  readonly confirmLabel: string;
  /** The write the failure's report names as its scope. */
  readonly errorScope: string;
  readonly pendingLabel?: string;
  readonly onClose: () => void;
  readonly onReplace: () => Promise<void>;
  readonly children: ReactNode;
}

export function ReplaceConfirmDialog({
  title,
  confirmLabel,
  errorScope,
  pendingLabel = 'Replacing',
  onClose,
  onReplace,
  children,
}: ReplaceConfirmDialogProps): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <ConfirmDialog
      title={title}
      confirmLabel={confirmLabel}
      pendingLabel={pendingLabel}
      cancelLabel="Keep existing"
      confirmVariant="danger"
      isPending={busy}
      failure={{ error, scope: errorScope }}
      onConfirm={() => {
        setBusy(true);
        setError(null);
        onReplace().catch((err: unknown) => {
          setError(err);
          setBusy(false);
        });
      }}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {children}
    </ConfirmDialog>
  );
}
