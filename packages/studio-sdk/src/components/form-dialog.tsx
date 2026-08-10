/**
 * `FormDialog` — a modal whose body is a real `<form>`, so implicit submission
 * gives Enter-in-a-field → submit. Composes {@link Dialog} and owns the submit
 * lifecycle: a `type="submit"` default button, a busy state that disables it and
 * shows a Spinner while the action runs, and a close-on-success-ONLY async contract.
 *
 * The contract: `onSubmit` may return a promise; the dialog closes (via `onClose`)
 * only when it RESOLVES. A rejection or synchronous throw keeps the dialog open and
 * renders the failure through `ErrorState`, so the operator can retry the filled fields.
 *
 * The caller owns mount/unmount: mount only while active, and any close gesture
 * (Cancel, Escape, overlay) calls `onClose`. `submitDisabled` blocks submission by
 * click AND by Enter — a disabled default button is not an implicit-submission target.
 */
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';

import { Dialog } from './dialog';
import { Button, ErrorState, Spinner } from './primitives';
import { errorMessage } from '../errors';

export interface FormDialogProps {
  readonly title: string;
  readonly description?: string;
  /** The submit button's resting label (e.g. `Create scope`). */
  readonly submitLabel: string;
  /** The Spinner's accessible label while the action runs (e.g. `Creating`). */
  readonly pendingLabel: string;
  /**
   * The action the form performs. A returned promise is awaited: the dialog
   * closes only when it RESOLVES; a rejection (or a synchronous throw) keeps the
   * dialog open and renders the failure loudly. A `void` return closes the
   * dialog synchronously.
   */
  readonly onSubmit: () => void | Promise<void>;
  /**
   * Called on a close gesture (Cancel, Escape, overlay) and on a successful
   * submit — at most once per dialog lifecycle. A close landing mid-submit wins:
   * the later resolution does not fire a second `onClose`.
   */
  readonly onClose: () => void;
  /** Blocks submission by click and by Enter while incomplete (a disabled default button is not an implicit-submission target). */
  readonly submitDisabled?: boolean;
  readonly submitVariant?: 'primary' | 'danger';
  /** The Cancel button's label. */
  readonly cancelLabel?: string;
  /** The form body — the caller's fields. */
  readonly children: ReactNode;
}

export function FormDialog({
  title,
  description,
  submitLabel,
  pendingLabel,
  onSubmit,
  onClose,
  submitDisabled = false,
  submitVariant = 'primary',
  cancelLabel = 'Cancel',
  children,
}: FormDialogProps): ReactNode {
  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  // Latches on the first close gesture so `onClose` fires at most once per lifecycle;
  // a close mid-submit wins, and the later resolution must not close again.
  const closedRef = useRef(false);
  // Guards post-await setters from touching state after a mid-submit close unmounts.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function close(): void {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    // SPA: the form never navigates, so the default GET is prevented.
    event.preventDefault();
    // Also covers a programmatic `requestSubmit` and a second Enter mid-flight, so the
    // action fires at most once per run.
    if (isPending || submitDisabled) return;
    setSubmitError(null);
    setIsPending(true);
    // `Promise.resolve().then(onSubmit)` routes a synchronous throw into the rejection
    // path too, so a sync failure surfaces like an async one.
    Promise.resolve()
      .then(() => onSubmit())
      .then(
        () => {
          // A mid-submit close already settled the lifecycle; don't close or set state again.
          if (closedRef.current || !mountedRef.current) return;
          setIsPending(false);
          close();
        },
        (reason: unknown) => {
          if (closedRef.current || !mountedRef.current) return;
          setIsPending(false);
          setSubmitError(reason);
        },
      );
  }

  return (
    <Dialog
      title={title}
      description={description}
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <form onSubmit={handleSubmit}>
        {children}
        {submitError != null ? <ErrorState message={errorMessage(submitError)} /> : null}
        <div className="tai-dialog-actions">
          <Button type="button" onClick={close}>
            {cancelLabel}
          </Button>
          <Button type="submit" variant={submitVariant} disabled={isPending || submitDisabled}>
            {isPending ? <Spinner label={pendingLabel} /> : null}
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
