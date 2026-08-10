import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

/** The required props, so each test states only what it is exercising. */
function renderConfirm(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      title="Delete scope"
      confirmLabel="Delete scope"
      pendingLabel="Deleting"
      onConfirm={onConfirm}
      onClose={onClose}
      isPending={false}
      {...overrides}
    >
      <p>This removes every binding in the scope.</p>
    </ConfirmDialog>,
  );
  return { onConfirm, onClose };
}

describe('ConfirmDialog', () => {
  it('is a modal named by its title, showing the prompt and both actions', () => {
    renderConfirm();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Delete scope');
    expect(
      within(dialog).getByText('This removes every binding in the scope.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete scope' })).toBeInTheDocument();
  });

  it('runs the action when the confirm button is pressed', async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderConfirm();
    await user.click(screen.getByRole('button', { name: 'Delete scope' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without running the action when Cancel is pressed', async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderConfirm();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes on Escape — Radix owns the dismiss, the dialog does not add a second one', async () => {
    const user = userEvent.setup();
    const { onClose } = renderConfirm();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the pending spinner and disables the confirm while the action runs', () => {
    renderConfirm({ isPending: true });
    expect(screen.getByRole('button', { name: /Delete scope/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Deleting' })).toBeInTheDocument();
  });

  it('renders a failed action loudly', () => {
    renderConfirm({ error: new Error('scope is referenced by 3 agents') });
    expect(screen.getByRole('alert')).toHaveTextContent('scope is referenced by 3 agents');
  });

  it('renders a bare message string as loudly as a thrown Error', () => {
    // `Field`'s `error` is a plain string and the two props sit side by side on
    // a form, so this one takes that spelling too. A narrower type would leave
    // one surface's `error` unassignable to the other's for no reason a caller
    // could see.
    renderConfirm({ error: 'scope is referenced by 3 agents' });
    expect(screen.getByRole('alert')).toHaveTextContent('scope is referenced by 3 agents');
  });

  it('shows a muted disabledNote in place of the loud error and blocks the confirm', () => {
    // The OFF (disabled-feature) case: the note takes the error slot, no red alert
    // renders even when an error is also present, and the confirm cannot re-fire.
    renderConfirm({
      error: new Error('marketplace not configured'),
      disabledNote: <p data-testid="off-note">Marketplace is not configured.</p>,
    });
    expect(screen.getByTestId('off-note')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete scope' })).toBeDisabled();
  });

  it('lands its actions in the shared dialog-actions row', () => {
    renderConfirm();
    const actions = document.querySelector('.tai-dialog-actions');
    expect(actions).not.toBeNull();
    expect(within(actions as HTMLElement).getAllByRole('button')).toHaveLength(2);
  });

  it('renders the destructive confirm differently from the non-destructive one', () => {
    renderConfirm();
    const destructive = screen.getByRole('button', { name: 'Delete scope' }).outerHTML;
    cleanup();
    renderConfirm({ confirmVariant: 'primary' });
    const primary = screen.getByRole('button', { name: 'Delete scope' }).outerHTML;
    // `danger` is the default, so the two variants must not render identically.
    expect(primary).not.toBe(destructive);
  });

  it('renders its prompt and keeps its accessible name', () => {
    renderConfirm();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete scope');
    expect(screen.getByText('This removes every binding in the scope.')).toBeInTheDocument();
  });
});
