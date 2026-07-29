import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from './dialog';
import type { DialogProps } from './dialog';
import { Drawer } from './drawer';
import type { DrawerProps } from './drawer';
import { Tooltip } from './tooltip';
import type { TooltipProps } from './tooltip';

/**
 * Non-distributive on purpose: `T extends U` distributes over a union and
 * collapses to `boolean`, which `false` still satisfies — the gate would pass on
 * exactly the regression it exists to catch.
 */
type IsAssignable<T, U> = [T] extends [U] ? true : false;

/**
 * PUBLISHED-TYPE GATE for the three `asChild` slots, enforced by `pnpm typecheck`
 * (`tsc --noEmit` covers every file under `src`, tests included).
 *
 * Radix clones its props onto the node it is given, so the slot takes exactly one
 * ELEMENT. Typed `ReactNode` it also accepts a string — which THROWS "failed to
 * slot onto its children" — and a fragment, which is worse: it renders the
 * fragment's children as plain elements carrying no `aria-haspopup`,
 * `aria-expanded`, `aria-controls` and no handler, type-checks, and fails
 * nothing. The three slots keep ONE spelling so the prop cannot drift apart.
 */
const stringIsNotADrawerTrigger: IsAssignable<string, DrawerProps['trigger']> = false;
const stringIsNotADialogTrigger: IsAssignable<string, DialogProps['trigger']> = false;
const stringIsNotATooltipChild: IsAssignable<string, TooltipProps['children']> = false;
const elementIsADrawerTrigger: IsAssignable<ReactElement, DrawerProps['trigger']> = true;

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

  it('renders its header, close button and accessible name', () => {
    render(
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
  });

  it('takes the trigger as one element, in the same spelling Dialog and Tooltip use', () => {
    expect([
      stringIsNotADrawerTrigger,
      stringIsNotADialogTrigger,
      stringIsNotATooltipChild,
    ]).toEqual([false, false, false]);
    expect(elementIsADrawerTrigger).toBe(true);
  });

  it('raises on a FRAGMENT in any of the three slots, which the type admits', () => {
    // `<></>` IS a `ReactElement`, so the narrowing above lets it through. React
    // then drops every prop the slot clones onto it, and the opener renders
    // carrying no wiring and no handler — the exact silent failure the type
    // reads as if it prevented.
    const fragmentTrigger = (
      <>
        <button type="button">Menu</button>
      </>
    );

    expect(() =>
      render(
        <Drawer title="Navigation" trigger={fragmentTrigger}>
          <a href="/tools">Tools</a>
        </Drawer>,
      ),
    ).toThrow(/Drawer `trigger` takes a single element, not a fragment/);

    expect(() => render(<Dialog title="Settings" trigger={fragmentTrigger} />)).toThrow(
      /Dialog `trigger` takes a single element, not a fragment/,
    );

    expect(() => render(<Tooltip content="Hint">{fragmentTrigger}</Tooltip>)).toThrow(
      /Tooltip `children` takes a single element, not a fragment/,
    );
  });

  it('accepts a plain element in each slot, so the guard rejects fragments only', () => {
    const trigger = (
      <button type="button" aria-label="Open navigation">
        Menu
      </button>
    );

    expect(() =>
      render(
        <Drawer title="Navigation" trigger={trigger}>
          <a href="/tools">Tools</a>
        </Drawer>,
      ),
    ).not.toThrow();
    expect(() => render(<Dialog title="Settings" trigger={trigger} />)).not.toThrow();
    expect(() => render(<Tooltip content="Hint">{trigger}</Tooltip>)).not.toThrow();
  });

  it('opens uncontrolled from its own trigger, as Dialog does', async () => {
    // The drawer used to REQUIRE `open` + `onOpenChange` while `Dialog` — same
    // Radix machinery, same `trigger` prop — had all three optional, so one of
    // the two could be driven by its trigger alone and the other could not.
    const user = userEvent.setup();
    render(
      <Drawer
        title="Navigation"
        trigger={
          <button type="button" aria-label="Open navigation">
            Menu
          </button>
        }
      >
        <a href="/tools">Tools</a>
      </Drawer>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Navigation');
  });

  it('honours defaultOpen with no controlling state at all', () => {
    render(
      <Drawer title="Navigation" defaultOpen>
        <a href="/tools">Tools</a>
      </Drawer>,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Navigation');
  });
});
