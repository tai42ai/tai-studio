/**
 * Focus return for trigger-less modals, driven through the REAL `Dialog`,
 * `Drawer` and `ConfirmDialog`.
 *
 * These have to go through the components rather than the hook: Radix composes
 * its own `onCloseAutoFocus` (`preventDefault(); triggerRef.current?.focus()`)
 * AFTER the one this module supplies and skips it only when ours prevented
 * default. That composition is the whole hazard — a hook called in isolation
 * cannot observe it, and would pass while the real modal stranded the reader on
 * `<body>`. The one exception is the OPEN handler's stand-down, which is a
 * question about what the hook reads and is driven at the hook directly.
 */
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';
import { Dialog } from './dialog';
import { Drawer } from './drawer';
import { useModalFocusReturn } from './modal-focus';
import { Button } from './primitives';

/**
 * A row in a list, with a Delete button that opens a trigger-less confirm. The
 * confirmed action removes the row (`removes`) or leaves its button disabled,
 * which is exactly what strands the focus return with nothing to return to.
 */
function ListHost({ removes }: { removes: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div>
      <ul data-testid="list">
        {removes && done ? null : (
          <li data-testid="row">
            <Button
              disabled={done}
              onClick={() => {
                setConfirming(true);
              }}
            >
              Delete scope
            </Button>
          </li>
        )}
      </ul>
      {confirming ? (
        <ConfirmDialog
          title="Delete scope"
          confirmLabel="Delete"
          pendingLabel="Deleting"
          isPending={false}
          onConfirm={() => {
            setDone(true);
            setConfirming(false);
          }}
          onClose={() => {
            setConfirming(false);
          }}
        >
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/** Everything focus could have landed on, for a failure message worth reading. */
function activeDescription(): string {
  const active = document.activeElement;
  if (active === null) return 'null';
  const testId = active.getAttribute('data-testid');
  return testId === null ? active.tagName : `${active.tagName}[data-testid=${testId}]`;
}

describe('modal focus return without a trigger', () => {
  it('lands on the list a removed opener sat in, never on <body>', async () => {
    const user = userEvent.setup();
    render(<ListHost removes />);

    await user.click(screen.getByRole('button', { name: 'Delete scope' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row')).not.toBeInTheDocument();

    const list = screen.getByTestId('list');
    await waitFor(() => {
      expect(activeDescription()).toBe('UL[data-testid=list]');
    });
    expect(document.activeElement).toBe(list);
    expect(document.activeElement).not.toBe(document.body);
    // The list was never focusable on its own; it is lent a tabindex for as
    // long as it holds the focus.
    expect(list).toHaveAttribute('tabindex', '-1');
  });

  it('hands the borrowed tabindex back when the fallback loses focus', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ListHost removes />
        <Button>Elsewhere</Button>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete scope' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const list = screen.getByTestId('list');
    await waitFor(() => {
      expect(list).toHaveAttribute('tabindex', '-1');
    });

    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(list).not.toHaveAttribute('tabindex');
  });

  it('lands on the nearest connected ancestor when the opener is left disabled', async () => {
    const user = userEvent.setup();
    render(<ListHost removes={false} />);

    await user.click(screen.getByRole('button', { name: 'Delete scope' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete scope' })).toBeDisabled();

    // The disabled opener is still in the document but cannot hold focus, so the
    // row it sits in takes it instead.
    await waitFor(() => {
      expect(activeDescription()).toBe('LI[data-testid=row]');
    });
    expect(document.activeElement).not.toBe(document.body);
  });

  it('returns focus to an opener that can still take it, touching nothing else', async () => {
    const user = userEvent.setup();
    function DrawerHost() {
      const [open, setOpen] = useState(false);
      return (
        <div data-testid="shell">
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Menu
          </Button>
          <Drawer open={open} onOpenChange={setOpen} title="Navigation">
            <a href="/tools">Tools</a>
          </Drawer>
        </div>
      );
    }
    render(<DrawerHost />);
    const opener = screen.getByRole('button', { name: 'Menu' });

    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
    // No fallback was needed, so nothing was lent a tabindex.
    expect(screen.getByTestId('shell')).not.toHaveAttribute('tabindex');
    expect(opener).not.toHaveAttribute('tabindex');
  });

  it('stands down entirely when a trigger IS rendered, leaving Radix its restore', async () => {
    const user = userEvent.setup();
    function TriggerHost() {
      const [busy, setBusy] = useState(false);
      return (
        <div data-testid="shell">
          <Dialog title="Confirm delete" trigger={<Button disabled={busy}>Open</Button>}>
            <Button
              onClick={() => {
                setBusy(true);
              }}
            >
              Disable the trigger
            </Button>
          </Dialog>
        </div>
      );
    }
    render(<TriggerHost />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Disable the trigger' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Radix owns the restore here and aims it at its own Trigger; the Trigger is
    // disabled, so it lands nowhere. This module must not step in — if it did,
    // focus would be on the shell and the shell would be wearing a tabindex.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
    });
    const shell = screen.getByTestId('shell');
    expect(shell).not.toHaveAttribute('tabindex');
    expect(document.activeElement).not.toBe(shell);
  });

  it('records nothing on the way in when a trigger IS rendered', () => {
    // The recording exists only for the close handler, which stands down with a
    // trigger present — so with one it was written on every open and never read,
    // holding the opener and its whole ancestor chain alive behind it. Both
    // handlers now stand down together, which is what the module's own docblock
    // says the pair does. Driven at the hook rather than through a rendered
    // dialog, because Radix and user-event read `activeElement` constantly and a
    // spy over a whole open sequence would measure them instead.
    const withTrigger = renderHook(() => useModalFocusReturn(true));
    const activeElement = vi.spyOn(document, 'activeElement', 'get');
    withTrigger.result.current.onOpenAutoFocus(new Event('focus'));
    expect(activeElement).not.toHaveBeenCalled();

    // The control: with NO trigger the same handler does read it, so the check
    // above is measuring the stand-down and not a spy that never had a chance.
    const withoutTrigger = renderHook(() => useModalFocusReturn(false));
    withoutTrigger.result.current.onOpenAutoFocus(new Event('focus'));
    expect(activeElement).toHaveBeenCalled();
    activeElement.mockRestore();
  });

  it('still returns focus to a live trigger, so it never prevents Radix default', async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="Confirm delete" trigger={<Button>Open</Button>}>
        <p>body</p>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Open' });

    await user.click(trigger);
    await user.keyboard('{Escape}');
    // Radix's restore is the handler that focuses the Trigger, and it runs only
    // while this module leaves the event's default intact.
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
});

/**
 * A page that opens a trigger-less modal from code — a deep link, a timer, a
 * keyboard shortcut handled on the document — so nothing is focused when it
 * opens, and that puts focus on a region of its own once the modal closes.
 * The region's focus is scheduled the way a page reclaims focus after a close:
 * on a 0 ms timer from `onOpenChange(false)`.
 */
function PageHost({ modal }: { modal: 'dialog' | 'drawer' }) {
  const [open, setOpen] = useState(true);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTimeout(() => {
        document.getElementById('region')?.focus();
      }, 0);
    }
  };
  return (
    <div>
      <section id="region" data-testid="region" tabIndex={-1} aria-label="Region">
        <p>content</p>
      </section>
      {modal === 'dialog' ? (
        <Dialog title="Details" open={open} onOpenChange={onOpenChange}>
          <Button>Inside</Button>
        </Dialog>
      ) : (
        <Drawer title="Details" open={open} onOpenChange={onOpenChange}>
          <Button>Inside</Button>
        </Drawer>
      )}
    </div>
  );
}

describe('modal focus return when nothing was focused on open', () => {
  beforeEach(() => {
    // Every case starts from a page where nothing holds focus.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.documentElement.removeAttribute('tabindex');
  });

  it.each(['dialog', 'drawer'] as const)(
    'leaves focus where the page put it after a %s closes',
    async (modal) => {
      const user = userEvent.setup();
      expect(document.activeElement).toBe(document.body);
      render(<PageHost modal={modal} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      const region = screen.getByTestId('region');
      await waitFor(() => {
        expect(activeDescription()).toBe('SECTION[data-testid=region]');
      });
      // Let every close-time timer run, then check focus stayed on the region.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(document.activeElement).toBe(region);
      expect(document.documentElement).not.toHaveAttribute('tabindex');
    },
  );

  it('leaves focus where the page put it when the document element held focus on open', async () => {
    const user = userEvent.setup();
    const html = document.documentElement;
    html.setAttribute('tabindex', '-1');
    html.focus();
    expect(document.activeElement).toBe(html);
    try {
      render(<PageHost modal="dialog" />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      const region = screen.getByTestId('region');
      await waitFor(() => {
        expect(activeDescription()).toBe('SECTION[data-testid=region]');
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(document.activeElement).toBe(region);
    } finally {
      html.removeAttribute('tabindex');
    }
  });

  it('leaves focus on <body> when nothing was focused and the page places none', async () => {
    const user = userEvent.setup();
    function BareHost() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog title="Details" open={open} onOpenChange={setOpen}>
          <Button>Inside</Button>
        </Dialog>
      );
    }
    render(<BareHost />);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.activeElement).toBe(document.body);
    expect(document.documentElement).not.toHaveAttribute('tabindex');
  });
});
