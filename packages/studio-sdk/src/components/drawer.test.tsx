import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Drawer } from './drawer';

/** A controlled host with an opener, so focus return has somewhere to go. */
function DrawerHost({ side }: { side?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title="Navigation"
      side={side}
      trigger={
        <button type="button" aria-label="Open navigation">
          Menu
        </button>
      }
    >
      <a href="/tools">Tools</a>
    </Drawer>
  );
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('Drawer', () => {
  it('renders nothing while closed, and no trigger unless one is supplied', () => {
    render(
      <Drawer open={false} onOpenChange={vi.fn()} title="Navigation">
        <a href="/tools">Tools</a>
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lets its trigger open it and marks the trigger as the drawer control', async () => {
    const user = userEvent.setup();
    render(<DrawerHost />);

    const opener = screen.getByRole('button', { name: 'Open navigation' });
    expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
    expect(opener).toHaveAttribute('aria-expanded', 'false');

    await user.click(opener);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    expect(opener.getAttribute('aria-controls')).toBe(screen.getByRole('dialog').id);
  });

  it('opens as a modal dialog named by its title, anchored left by default', async () => {
    const user = userEvent.setup();
    render(<DrawerHost />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    const drawer = screen.getByRole('dialog');
    expect(drawer).toHaveAccessibleName('Navigation');
    expect(drawer).toHaveClass('tai-drawer');
    expect(drawer).toHaveAttribute('data-side', 'left');
    expect(within(drawer).getByRole('link', { name: 'Tools' })).toBeInTheDocument();
  });

  it('anchors right when asked', async () => {
    const user = userEvent.setup();
    render(<DrawerHost side="right" />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('dialog')).toHaveAttribute('data-side', 'right');
  });

  it('closes from its labelled close control', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange} title="Navigation">
        <a href="/tools">Tools</a>
      </Drawer>,
    );

    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveClass('tai-icon-btn');
    await user.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange} title="Navigation">
        <a href="/tools">Tools</a>
      </Drawer>,
    );

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('returns focus to the opener after it closes', async () => {
    const user = userEvent.setup();
    render(<DrawerHost />);
    const opener = screen.getByRole('button', { name: 'Open navigation' });

    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Radix restores focus after the layer unmounts, one tick later.
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('returns focus to the opener even with no trigger to restore to', async () => {
    const user = userEvent.setup();
    function TriggerlessHost() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Open navigation
          </button>
          <Drawer open={open} onOpenChange={setOpen} title="Navigation">
            <a href="/tools">Tools</a>
          </Drawer>
        </>
      );
    }
    render(<TriggerlessHost />);
    const opener = screen.getByRole('button', { name: 'Open navigation' });

    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Radix returns focus to its own Trigger; with none rendered it would leave
    // the reader on <body>, so the opener is remembered on the way in instead.
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('renders its header, content and accessible name under both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      document.documentElement.setAttribute('data-theme', theme);
      const { unmount } = render(
        <Drawer open onOpenChange={vi.fn()} title="Navigation">
          <a href="/tools">Tools</a>
        </Drawer>,
      );

      const drawer = screen.getByRole('dialog');
      expect(drawer).toHaveAccessibleName('Navigation');
      expect(drawer.querySelector('.tai-drawer-header')).not.toBeNull();
      expect(within(drawer).getByRole('heading', { name: 'Navigation' })).toHaveClass(
        'tai-section-title',
      );
      expect(within(drawer).getByRole('button', { name: 'Close' })).toBeInTheDocument();
      unmount();
    }
  });
});
