import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

  it('adds the fullscreen class while keeping the surface class and the overlay', () => {
    render(
      <Dialog title="Editor" fullscreen defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    // The fullscreen variant composes with the surface class rather than
    // replacing it, so the panel still draws its background, ink and z-index.
    expect(dialog).toHaveClass('tai-dialog', 'tai-dialog-fullscreen');
    // The overlay behaviour is untouched by the variant.
    expect(document.querySelector('.tai-overlay')).not.toBeNull();
  });

  it('keeps the centred surface class and no fullscreen class by default', () => {
    render(
      <Dialog title="Editor" defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('tai-dialog');
    expect(dialog).not.toHaveClass('tai-dialog-fullscreen');
  });

  it('merges contentClassName onto the content after the surface classes', () => {
    render(
      <Dialog title="Editor" contentClassName="plugin-scope" fullscreen defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    // The passthrough is additive: the caller's scoping root joins the surface
    // and variant classes without displacing either.
    expect(dialog).toHaveClass('tai-dialog', 'tai-dialog-fullscreen', 'plugin-scope');
  });

  it('drops the visible title and the stack wrapper in chromeless mode', () => {
    render(
      <Dialog title="jq editor" chromeless defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    // The accessible name still comes from the title — it is only visually hidden.
    expect(dialog).toHaveAccessibleName('jq editor');
    const heading = screen.getByText('jq editor');
    expect(heading).toHaveClass('tai-visually-hidden');
    expect(heading).not.toHaveClass('tai-dialog-title');
    // No forced tai-stack children wrapper: the body is a direct child of content.
    expect(dialog.querySelector('.tai-stack')).toBeNull();
    expect(screen.getByText('body').parentElement).toBe(dialog);
  });

  it('describes a chromeless dialog from a visually-hidden description when given', () => {
    render(
      <Dialog title="jq editor" description="Transform the payload" chromeless defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleDescription('Transform the payload');
    expect(screen.getByText('Transform the payload')).toHaveClass('tai-visually-hidden');
  });

  it('omits aria-describedby for a chromeless dialog with no description', () => {
    render(
      <Dialog title="jq editor" chromeless defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    // The dangling-IDREF opt-out still holds when the wrapper is gone.
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('keeps the visible title and stack wrapper when chromeless is off', () => {
    render(
      <Dialog title="Confirm delete" chromeless={false} defaultOpen>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByText('Confirm delete')).toHaveClass('tai-dialog-title');
    expect(screen.getByRole('dialog').querySelector('.tai-stack')).not.toBeNull();
  });

  it('still closes on an outside press when dismissable is the default', async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="Confirm delete" defaultOpen dismissable>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const overlay = document.querySelector<HTMLElement>('.tai-overlay');
    if (overlay === null) throw new Error('overlay not rendered');
    // A press on the scrim outside the panel dismisses the ordinary modal.
    await user.click(overlay);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('blocks Escape when dismissable is false, leaving the panel open', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog title="Reveal" defaultOpen dismissable={false} onOpenChange={onOpenChange}>
        <p>secret</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    // The Escape gesture is swallowed: the panel stays and no close is requested.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('blocks an outside pointer press when dismissable is false', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog title="Reveal" defaultOpen dismissable={false} onOpenChange={onOpenChange}>
        <p>secret</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const overlay = document.querySelector<HTMLElement>('.tai-overlay');
    if (overlay === null) throw new Error('overlay not rendered');
    // A press on the scrim outside the panel does not dismiss it.
    await user.click(overlay);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('still closes from an explicit action when dismissable is false', async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog title="Reveal" open={open} dismissable={false} onOpenChange={setOpen}>
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Done
          </Button>
        </Dialog>
      );
    }
    render(<Host />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    // The explicit action is the only door, and it still works.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
