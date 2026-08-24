import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { openTargetProps, type OpenTargetOptions } from './open-target';

/**
 * A minimal entry that spreads the helper onto its container and renders the
 * nested controls a real row/card carries: a name link, an actions button (with
 * an icon inside it), an inline menu item, and a marked preview subtree. Every
 * yield rule is exercised against this one shape.
 */
function Entry({
  onOpen,
  ignoreWithin,
  keyboard,
}: Pick<OpenTargetOptions, 'ignoreWithin' | 'keyboard'> & {
  readonly onOpen: (() => void) | undefined;
}): ReactNode {
  return (
    <div data-testid="entry" {...openTargetProps({ onOpen, ignoreWithin, keyboard })}>
      <span data-testid="body">body text</span>
      <a
        href="#dest"
        onClick={(e) => {
          e.preventDefault();
        }}
      >
        name link
      </a>
      <button type="button" aria-label="actions">
        <svg data-testid="icon" width="8" height="8" aria-hidden="true" />
      </button>
      <div role="menu">
        <div role="menuitem" tabIndex={0}>
          menu choice
        </div>
      </div>
      <div data-preview="">
        <span data-testid="preview-text">preview text</span>
      </div>
    </div>
  );
}

describe('openTargetProps', () => {
  it('opens on a click that lands on the entry body', async () => {
    const onOpen = vi.fn();
    render(<Entry onOpen={onOpen} />);
    await userEvent.click(screen.getByTestId('body'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('marks the entry with a pointer cursor when enabled', () => {
    render(<Entry onOpen={vi.fn()} />);
    expect(screen.getByTestId('entry')).toHaveStyle({ cursor: 'pointer' });
  });

  it('yields to a nested link', async () => {
    const onOpen = vi.fn();
    render(<Entry onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('link', { name: 'name link' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('yields to a nested button', async () => {
    const onOpen = vi.fn();
    render(<Entry onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'actions' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('yields when the click target is an icon inside a nested button', async () => {
    const onOpen = vi.fn();
    render(<Entry onOpen={onOpen} />);
    await userEvent.click(screen.getByTestId('icon'));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('yields to an inline menuitem', async () => {
    const onOpen = vi.fn();
    render(<Entry onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'menu choice' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('yields to a caller ignoreWithin subtree', async () => {
    const onOpen = vi.fn();
    render(<Entry onOpen={onOpen} ignoreWithin="[data-preview]" />);
    await userEvent.click(screen.getByTestId('preview-text'));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('still opens on a body click when ignoreWithin is set', async () => {
    const onOpen = vi.fn();
    render(<Entry onOpen={onOpen} ignoreWithin="[data-preview]" />);
    await userEvent.click(screen.getByTestId('body'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not open on a text-selection drag (a non-collapsed selection)', async () => {
    const onOpen = vi.fn();
    render(<Entry onOpen={onOpen} />);
    const selection = { isCollapsed: false } as unknown as Selection;
    const spy = vi.spyOn(window, 'getSelection').mockReturnValue(selection);
    try {
      await userEvent.click(screen.getByTestId('body'));
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('wires no handler, cursor, or tab stop when onOpen is undefined', () => {
    render(<Entry onOpen={undefined} keyboard />);
    const entry = screen.getByTestId('entry');
    expect(entry).not.toHaveStyle({ cursor: 'pointer' });
    expect(entry).not.toHaveAttribute('tabindex');
  });

  describe('keyboard mode', () => {
    it('is not a focus stop by default', () => {
      render(<Entry onOpen={vi.fn()} />);
      expect(screen.getByTestId('entry')).not.toHaveAttribute('tabindex');
    });

    it('makes the entry a focus stop and opens on Enter', async () => {
      const onOpen = vi.fn();
      render(<Entry onOpen={onOpen} keyboard />);
      const entry = screen.getByTestId('entry');
      expect(entry).toHaveAttribute('tabindex', '0');
      entry.focus();
      await userEvent.keyboard('{Enter}');
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('opens on Space', async () => {
      const onOpen = vi.fn();
      render(<Entry onOpen={onOpen} keyboard />);
      screen.getByTestId('entry').focus();
      await userEvent.keyboard(' ');
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('ignores other keys', async () => {
      const onOpen = vi.fn();
      render(<Entry onOpen={onOpen} keyboard />);
      screen.getByTestId('entry').focus();
      await userEvent.keyboard('{ArrowDown}a');
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('yields Enter that originates on a nested interactive element', async () => {
      const onOpen = vi.fn();
      render(<Entry onOpen={onOpen} keyboard />);
      screen.getByRole('link', { name: 'name link' }).focus();
      await userEvent.keyboard('{Enter}');
      expect(onOpen).not.toHaveBeenCalled();
    });
  });
});
