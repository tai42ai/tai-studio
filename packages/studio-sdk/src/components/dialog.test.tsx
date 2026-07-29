import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from './primitives';
import { Dialog } from './dialog';

describe('Dialog', () => {
  it('opens from its trigger and exposes an accessible modal labelled by its title', async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        title="Confirm delete"
        description="This cannot be undone"
        trigger={<Button>Open</Button>}
      >
        <p>body</p>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName('Confirm delete');
    expect(screen.getByText('This cannot be undone')).toBeInTheDocument();
    // Modality comes from the focus trap and the inert background, NOT from an
    // `aria-modal` attribute — the panel ships none, and the docblock says so.
    // Pinned so the two can never drift apart again.
    expect(dialog).not.toHaveAttribute('aria-modal');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="Confirm delete" description="This cannot be undone" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dresses the panel and the title in the design-system surface classes', () => {
    render(
      <Dialog title="Confirm delete" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('tai-dialog');
    expect(screen.getByText('Confirm delete')).toHaveClass('tai-dialog-title');
  });

  it('describes itself only when it has a description, never by a dangling id', () => {
    const { rerender } = render(
      <Dialog title="Confirm delete" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');

    rerender(
      <Dialog title="Confirm delete" description="This cannot be undone" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const described = screen.getByRole('dialog');
    expect(described).toHaveAccessibleDescription('This cannot be undone');
  });

  it('returns focus to the opener of a trigger-less, controlled dialog', async () => {
    const user = userEvent.setup();
    function ControlledHost() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Delete
          </Button>
          <Dialog title="Confirm delete" open={open} onOpenChange={setOpen}>
            <p>body</p>
          </Dialog>
        </>
      );
    }
    render(<ControlledHost />);
    const opener = screen.getByRole('button', { name: 'Delete' });

    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Radix returns focus to its own Trigger and cancels the focus scope's
    // restore while doing it; with no Trigger that would strand the reader on
    // <body>, so the opener is remembered on the way in instead.
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('leaves focus return to Radix when a trigger IS rendered', async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="Confirm delete" trigger={<Button>Open</Button>}>
        <p>body</p>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });

    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('paints the scrim from the overlay class, never an inline color', () => {
    render(
      <Dialog title="Confirm delete" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const overlay = document.querySelector<HTMLElement>('.tai-overlay');
    expect(overlay).not.toBeNull();
    // The scrim resolves from --tai-color-scrim inside the class, never inline.
    expect(overlay?.style.background).toBe('');
    expect(overlay?.style.backgroundColor).toBe('');
  });

  it('renders its content and keeps its accessible name', () => {
    render(
      <Dialog title="Confirm delete" description="This cannot be undone" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Confirm delete');
    expect(dialog).toHaveClass('tai-dialog');
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(document.querySelector('.tai-overlay')).not.toBeNull();
  });
});
