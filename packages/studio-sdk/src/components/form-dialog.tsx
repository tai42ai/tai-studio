/**
 * `FormDialog` — a modal whose body is a real `<form>`, so the browser's implicit
 * submission gives Enter-in-a-field → submit for free. It composes {@link Dialog}
 * and owns the whole submit lifecycle: a form-associated default submit button
 * (`type="submit"`, the form's implicit-submission target), a built-in busy state
 * that disables the button and shows a Spinner while the action runs, and a
 * close-on-success-ONLY async contract.
 *
 * The contract: `onSubmit` runs the caller's action and may return a promise. The
 * dialog closes (via `onClose`) only when that promise RESOLVES; a rejection —
 * or a synchronous throw — keeps the dialog open and surfaces the failure loudly
 * through the design system's `ErrorState`. The error is never swallowed and the
 * dialog never auto-closes over a failure, so the operator sees what went wrong
 * and can retry against the still-filled fields.
 *
 * Mount it only while the form is active; any close gesture — Cancel, Escape, the
 * overlay — calls `onClose`, exactly as {@link ConfirmDialog} does, so the caller
 * owns mount/unmount. `submitDisabled` blocks submission both by click and by
 * Enter: a disabled default button is not an implicit-submission target, so an
 * incomplete form cannot be submitted from the keyboard either.
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
  /**
   * Blocks submission — by click AND by Enter — while the form is incomplete. A
   * disabled default button is not an implicit-submission target, so the keyboard
   * path is closed off along with the pointer one.
   */
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
  // Latches on the first close gesture so `onClose` fires at most once per
  // lifecycle across Cancel, Escape, the overlay, and a successful submit. A
  // close landing mid-submit must not let the later resolution close a second
  // time — the caller unmounts on that first call, and the contract is one
  // `onClose` per dialog.
  const closedRef = useRef(false);
  // Tracks whether this instance is still mounted so the post-await setters
  // never touch state on a component the caller has already torn down after a
  // mid-submit close.
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
    // Single-page app: the form never navigates, so the default GET is always
    // prevented and the action runs in-process instead.
    event.preventDefault();
    // A disabled default button already blocks click and Enter; this guard also
    // covers a programmatic `requestSubmit` and a second Enter while the first
    // submit is still in flight, so the action fires at most once per run.
    if (isPending || submitDisabled) return;
    setSubmitError(null);
    setIsPending(true);
    // `Promise.resolve().then(onSubmit)` funnels a synchronous throw into the
    // rejection path too, so a sync failure surfaces the same way an async one
    // does — the dialog stays open and the error is shown, never swallowed.
    Promise.resolve()
      .then(() => onSubmit())
      .then(
        () => {
          // A close gesture that landed mid-submit already settled the
          // lifecycle; the resolution must neither close again nor set state on
          // a closed (and possibly unmounted) dialog.
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
