/**
 * The two frames an install form renders in: a dialog (the confirm shell) or a panel
 * in place (its own `<form>` with Cancel and the submit button), so a step can embed
 * the form without a dialog inside a dialog. The failure of the last call renders
 * inside the frame and the frame stays open.
 */
import type { ReactNode, SyntheticEvent } from 'react';

import { ConfirmDialog } from '../components/confirm-dialog';
import { Button, ErrorState, Spinner } from '../components/primitives';
import { errorMessage } from '../errors';
import { FeatureDisabled, featureDisabledMessage, isFeatureDisabled } from '../feature-disabled';

export type InstallLayout = 'panel' | 'dialog';

/**
 * The muted note for a store-off refusal (an OFF feature is a state, not an error),
 * or `undefined` for any other value.
 */
export function storeOffNote(error: unknown): ReactNode {
  if (!isFeatureDisabled(error)) return undefined;
  return <FeatureDisabled feature="Marketplace installs" message={featureDisabledMessage(error)} />;
}

/** A failed call's surface: the store-off note, else the server message as an alert. */
export function InstallFailure({ error }: { readonly error: unknown }): ReactNode {
  return storeOffNote(error) ?? <ErrorState message={errorMessage(error)} />;
}

export interface InstallShellProps {
  readonly layout: InstallLayout;
  readonly title: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly isPending: boolean;
  /** The loud failure; `null` while there is none. */
  readonly error: unknown;
  /** A muted note that takes the failure slot and blocks the submit. */
  readonly disabledNote?: ReactNode;
  readonly submitDisabled?: boolean;
  readonly onSubmit: () => void;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

export function InstallShell({
  layout,
  title,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  disabledNote,
  submitDisabled = false,
  onSubmit,
  onDismiss,
  children,
}: InstallShellProps): ReactNode {
  const errorText = error === null || error === undefined ? null : errorMessage(error);
  if (layout === 'dialog') {
    return (
      <ConfirmDialog
        title={title}
        confirmLabel={submitLabel}
        pendingLabel={pendingLabel}
        confirmVariant="primary"
        isPending={isPending}
        error={errorText}
        disabledNote={disabledNote}
        confirmDisabled={submitDisabled}
        onConfirm={onSubmit}
        onClose={onDismiss}
      >
        {children}
      </ConfirmDialog>
    );
  }
  const blocked =
    isPending || submitDisabled || (disabledNote !== undefined && disabledNote !== null);
  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!blocked) onSubmit();
  };
  return (
    <form aria-label={title} className="tai-stack tai-stack-3" onSubmit={handleSubmit}>
      {children}
      {disabledNote ?? (errorText !== null ? <ErrorState message={errorText} /> : null)}
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onDismiss}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={blocked}>
          {isPending ? <Spinner label={pendingLabel} /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
