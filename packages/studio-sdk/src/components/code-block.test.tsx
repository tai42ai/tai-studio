import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CodeBlock } from './code-block';
import { deferred, setElementOverflow } from '../testing';

/** The `<pre>` — the scrolling box itself — failing loudly if it is missing. */
function codeBox(container: HTMLElement): HTMLElement {
  const pre = container.querySelector<HTMLElement>('pre');
  if (pre === null) throw new Error('no <pre> rendered');
  return pre;
}

/** Lets the clipboard write settle so the copied state has been applied. */
async function settleClipboard(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function mockClipboard() {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('CodeBlock', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders code inside a <pre> preserving the text', () => {
    const { container } = render(<CodeBlock code={'line 1\nline 2'} />);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre).toHaveTextContent('line 1');
    expect(pre).toHaveTextContent('line 2');
  });

  it('renders a payload containing <script> as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(<CodeBlock code={payload} />);
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('shows an optional language caption on the shared label style', () => {
    render(<CodeBlock code="{}" language="json" />);
    expect(screen.getByText('json')).toHaveClass('tai-label');
  });

  it('omits the caption entirely when no language is given', () => {
    const { container } = render(<CodeBlock code="{}" />);
    expect(container.querySelector('.tai-label')).toBeNull();
  });

  it('names the block and makes it reachable ONLY while it overflows', async () => {
    const { container, rerender } = render(<CodeBlock code="{}" language="json" />);
    const pre = codeBox(container);
    expect(pre).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    // The text is edited IN PLACE — React keeps the same <pre> and the same
    // <code>, so nothing is added or removed and no observed box changes size.
    // The measurement still has to be re-taken.
    setElementOverflow(pre, true);
    rerender(<CodeBlock code={'{ "a": 1 }'.repeat(40)} language="json" />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'json' })).toBe(pre);
    });
    expect(pre).toHaveAttribute('tabindex', '0');
  });

  it('renders on the terminal ground with no inline palette', () => {
    const { container } = render(<CodeBlock code="{}" language="json" />);
    const pre = container.querySelector('pre');
    expect(pre).toHaveClass('tai-code-block');
    expect(pre?.getAttribute('style')).toBeNull();
  });

  it('offers an icon copy button that copies the payload and flips to a tick', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    render(<CodeBlock code={'line 1\nline 2'} />);

    const button = screen.getByRole('button', { name: 'Copy code' });
    // Icon-only: it carries an SVG, never a Unicode glyph.
    expect(button).toHaveClass('tai-icon-btn');
    expect(button.querySelector('svg')).not.toBeNull();

    await user.click(button);

    expect(writeText).toHaveBeenCalledWith('line 1\nline 2');
    // The button's accessible name IS the state it is showing (WCAG 2.5.3).
    await screen.findByRole('button', { name: 'Copied' });
  });

  it('announces the copy through one polite region', async () => {
    const user = userEvent.setup();
    mockClipboard();
    const { container } = render(<CodeBlock code="{}" />);

    const regions = container.querySelectorAll('[aria-live]');
    expect(regions).toHaveLength(1);
    const [live] = regions;
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live?.textContent).toBe('');

    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    await settleClipboard();

    expect(live?.textContent).toBe('Copied to clipboard');
  });

  it('keeps the copy button OUT of the scrolling <pre> so a long line cannot carry it off', () => {
    const { container } = render(<CodeBlock code={'x'.repeat(400)} />);
    const pre = codeBox(container);
    const button = screen.getByRole('button', { name: 'Copy code' });
    expect(pre.contains(button)).toBe(false);
    // The <pre> itself carries no inline style; positioning lives on its frame.
    expect(pre.getAttribute('style')).toBeNull();
  });

  it('returns to the idle icon once the copied window closes', async () => {
    // Only the timer clock is faked; promises still settle on the real microtask
    // queue, which is what carries the clipboard write.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mockClipboard();
    render(<CodeBlock code="{}" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await settleClipboard();
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
  });

  it('shows a loud, actionable alert when the clipboard write is refused', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error('clipboard denied by permissions policy'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CodeBlock code={'secret payload'} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await settleClipboard();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('clipboard denied by permissions policy');
    expect(alert).toHaveTextContent('Select the code and copy it.');
    // The button never gets stuck reading "Copied" on a copy that failed.
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
  });

  it('says so when the browser offers no clipboard at all', async () => {
    // Any non-secure context: `navigator.clipboard` does not exist, and reading
    // through it would throw a TypeError straight out of the click handler.
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<CodeBlock code="{}" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await settleClipboard();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This browser will not write to the clipboard here.',
    );
  });

  it('clears a previous failure once a later copy succeeds', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CodeBlock code="{}" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await settleClipboard();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await settleClipboard();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('starts no reset timer when the clipboard write resolves after unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const write = deferred<undefined>();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => write.promise);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { unmount } = render(<CodeBlock code="{}" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('{}');

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    write.resolve(undefined);
    await act(async () => {
      await Promise.resolve();
    });

    // The unmount cleanup has already run, so the resolution must not touch state.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its pending reset timer on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    mockClipboard();
    const { unmount } = render(<CodeBlock code="{}" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await settleClipboard();

    clearTimeoutSpy.mockClear();
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
