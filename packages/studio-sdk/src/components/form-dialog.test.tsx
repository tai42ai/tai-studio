import { StrictMode, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FormDialog } from './form-dialog';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

/** A promise whose settlement the test drives, for the in-flight/failure paths. */
function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Drains every queued microtask. A macrotask turn runs only after the whole
 * microtask queue empties, so awaiting it settles the internal submit chain in
 * full — including the promise-adoption tick before its resolve/reject branch —
 * giving a stable point to assert against a late second `onClose`.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The required props, so each test states only what it is exercising. */
function renderFormDialog(overrides: Partial<Parameters<typeof FormDialog>[0]> = {}) {
  const onSubmit = vi.fn<() => void | Promise<void>>();
  const onClose = vi.fn();
  render(
    <FormDialog
      title="Create scope"
      submitLabel="Create scope"
      pendingLabel="Creating"
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    >
      <input aria-label="Name" name="name" />
    </FormDialog>,
  );
  return { onSubmit, onClose };
}

afterEach(() => {
  cleanup();
});

describe('FormDialog', () => {
  it('is a modal named by its title, with a real form and both actions', () => {
    renderFormDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Create scope');
    expect(dialog.querySelector('form')).not.toBeNull();
    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: 'Create scope' });
    expect(submit).toHaveAttribute('type', 'submit');
  });

  it('submits on Enter in a field (HTML implicit submission), then closes on success', async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderFormDialog();
    await user.type(screen.getByLabelText('Name'), 'archive{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('submits when the default button is clicked', async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderFormDialog();
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('closes exactly once on a successful submit under StrictMode double-invoke', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<() => void | Promise<void>>().mockResolvedValue();
    const onClose = vi.fn();
    render(
      <StrictMode>
        <FormDialog
          title="Create scope"
          submitLabel="Create scope"
          pendingLabel="Creating"
          onSubmit={onSubmit}
          onClose={onClose}
        >
          <input aria-label="Name" name="name" />
        </FormDialog>
      </StrictMode>,
    );
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('does not submit on Enter when the default submit is disabled', async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderFormDialog({ submitDisabled: true });
    expect(screen.getByRole('button', { name: 'Create scope' })).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'archive{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the pending spinner and disables the submit while the action runs', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const onSubmit = vi.fn(() => gate.promise);
    const { onClose } = renderFormDialog({ onSubmit });
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create scope/ })).toBeDisabled(),
    );
    expect(screen.getByRole('status', { name: 'Creating' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    gate.resolve();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('does not fire the action twice while a submit is in flight', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const onSubmit = vi.fn(() => gate.promise);
    renderFormDialog({ onSubmit });
    const field = screen.getByLabelText('Name');
    await user.type(field, '{Enter}');
    await user.type(field, '{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('stays open and surfaces the error when the action rejects — never closing on failure', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const { onClose } = renderFormDialog({ onSubmit: () => gate.promise });
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    gate.reject(new Error('scope name already in use'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('scope name already in use'),
    );
    expect(onClose).not.toHaveBeenCalled();
    // The button leaves its busy state so the operator can retry.
    expect(screen.getByRole('button', { name: 'Create scope' })).not.toBeDisabled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('surfaces a synchronous throw the same way, keeping the dialog open', async () => {
    const user = userEvent.setup();
    const { onClose } = renderFormDialog({
      onSubmit: () => {
        throw new Error('name is required');
      },
    });
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('name is required'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears a prior error when the form is resubmitted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce();
    const onClose = vi.fn();
    render(
      <FormDialog
        title="Create scope"
        submitLabel="Create scope"
        pendingLabel="Creating"
        onSubmit={onSubmit}
        onClose={onClose}
      >
        <input aria-label="Name" name="name" />
      </FormDialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes without running the action when Cancel is pressed', async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderFormDialog();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('fires onClose only once when Cancel lands mid-submit and the action later resolves', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const onSubmit = vi.fn(() => gate.promise);
    const { onClose } = renderFormDialog({ onSubmit });
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    // A close gesture lands while the submit is still in flight.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // The in-flight action then resolves; drain the resolution chain in full,
    // then assert its success branch did not close a second time.
    gate.resolve();
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close again or set state after the caller unmounts on a mid-submit close', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const onSubmit = vi.fn(() => gate.promise);
    const onClose = vi.fn();
    const { unmount } = render(
      <FormDialog
        title="Create scope"
        submitLabel="Create scope"
        pendingLabel="Creating"
        onSubmit={onSubmit}
        onClose={onClose}
      >
        <input aria-label="Name" name="name" />
      </FormDialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    // Escape closes mid-submit; the caller owns mount/unmount and tears the
    // dialog down on that close.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    // The action resolves against an unmounted component: after the resolution
    // chain fully drains there is no second close and no state-after-close work.
    gate.resolve();
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close or set state when the caller unmounts mid-submit without a close gesture', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const onSubmit = vi.fn(() => gate.promise);
    const onClose = vi.fn();
    // A parent owns whether the dialog is rendered. Flipping `show` to false
    // unmounts FormDialog with no Cancel/Escape/overlay gesture, so `closedRef`
    // never latches and only `mountedRef` flips — isolating the mounted guard.
    function Parent({ show }: { show: boolean }): ReactNode {
      return show ? (
        <FormDialog
          title="Create scope"
          submitLabel="Create scope"
          pendingLabel="Creating"
          onSubmit={onSubmit}
          onClose={onClose}
        >
          <input aria-label="Name" name="name" />
        </FormDialog>
      ) : null;
    }
    const { rerender } = render(<Parent show />);
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // The caller stops rendering the dialog while the action is still in flight.
    rerender(<Parent show={false} />);
    // The action resolves against an unmounted component: the `mountedRef` guard
    // makes the success branch bail before it closes, so no `onClose` fires.
    gate.resolve();
    await settle();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape — Radix owns the dismiss, the dialog does not add a second one', async () => {
    const user = userEvent.setup();
    const { onClose } = renderFormDialog();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lands its actions in the shared dialog-actions row', () => {
    renderFormDialog();
    const actions = document.querySelector('.tai-dialog-actions');
    expect(actions).not.toBeNull();
    expect(within(actions as HTMLElement).getAllByRole('button')).toHaveLength(2);
  });

  it('renders the destructive submit differently from the primary one', () => {
    renderFormDialog();
    const primary = screen.getByRole('button', { name: 'Create scope' }).outerHTML;
    cleanup();
    renderFormDialog({ submitVariant: 'danger' });
    const danger = screen.getByRole('button', { name: 'Create scope' }).outerHTML;
    expect(danger).not.toBe(primary);
  });
});
