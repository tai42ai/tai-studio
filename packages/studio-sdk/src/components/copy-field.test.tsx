import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deferred } from '../testing';
import { CopyField } from './copy-field';

function firstOf<T extends Element>(nodes: NodeListOf<T>): T {
  const [node] = nodes;
  if (node === undefined) throw new Error('expected a matching element');
  return node;
}

/** Lets the clipboard write settle so the copied state has been applied. */
async function settleClipboard(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function mockClipboard() {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe('CopyField', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the value and an optional caption', () => {
    render(<CopyField value="tai42_key_123" caption="Copy this key now." />);
    expect(screen.getByText('tai42_key_123')).toBeInTheDocument();
    expect(screen.getByText('Copy this key now.')).toBeInTheDocument();
  });

  it('copies the value to the clipboard and flips to the copied state', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    render(<CopyField value="tai42_key_123" />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('tai42_key_123');
    expect(await screen.findByText('Copied')).toBeVisible();
  });

  it('renders a value containing <script> as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(<CopyField value={payload} />);
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('is a tai-btn carrying the copy icon, never a Unicode glyph', () => {
    render(<CopyField value="tai42_key_123" />);

    const button = screen.getByRole('button', { name: 'Copy' });
    expect(button).toHaveClass('tai-btn', 'tai-btn-secondary');
    expect(button.querySelectorAll('svg')).toHaveLength(2);
    expect(screen.getByText('tai42_key_123')).toHaveClass('tai-code');
  });

  it('reserves the width of both states so the flip cannot reflow the row', async () => {
    const user = userEvent.setup();
    mockClipboard();
    render(<CopyField value="tai42_key_123" />);

    // Both states are mounted at all times; only one of them is shown.
    const idle = screen.getByText('Copy');
    const done = screen.getByText('Copied');
    expect(idle).toBeVisible();
    expect(done).not.toBeVisible();
    expect(idle).toHaveAttribute('aria-hidden', 'false');
    expect(done).toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await settleClipboard();

    expect(idle).not.toBeVisible();
    expect(done).toBeVisible();
    expect(idle).toHaveAttribute('aria-hidden', 'true');
    expect(done).toHaveAttribute('aria-hidden', 'false');
  });

  it('announces the copy exactly once and keeps the button name stable', async () => {
    const user = userEvent.setup();
    mockClipboard();
    const { container } = render(<CopyField value="tai42_key_123" />);

    const regions = container.querySelectorAll('[aria-live]');
    expect(regions).toHaveLength(1);
    const live = firstOf(regions);
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live.textContent).toBe('');

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await settleClipboard();

    expect(live.textContent).toBe('Copied to clipboard');
    // The name never changes, so the flip is not announced a second time.
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('returns to the idle state once the copied window closes', async () => {
    // Only the timer clock is faked; promises still settle on the real
    // microtask queue, which is what carries the clipboard write.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mockClipboard();
    const { container } = render(<CopyField value="tai42_key_123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await settleClipboard();
    expect(screen.getByText('Copied')).toBeVisible();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('Copied')).not.toBeVisible();
    expect(screen.getByText('Copy')).toBeVisible();
    expect(firstOf(container.querySelectorAll('[aria-live]')).textContent).toBe('');
  });

  it('shows a loud, actionable alert when the clipboard write is refused', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error('clipboard denied by permissions policy'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CopyField value="tai42_key_123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await settleClipboard();

    // The secret is shown once: a failure the reader cannot see leaves them
    // believing they hold a key they never copied.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('clipboard denied by permissions policy');
    expect(alert).toHaveTextContent('Select the value above and copy it.');
    // Never the secret itself.
    expect(alert).not.toHaveTextContent('tai42_key_123');
    expect(screen.getByText('Copied')).not.toBeVisible();
  });

  it('says so when the browser offers no clipboard at all', async () => {
    // Any non-secure context: `navigator.clipboard` does not exist, and reading
    // through it used to throw a TypeError straight out of the click handler.
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<CopyField value="tai42_key_123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
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
    render(<CopyField value="tai42_key_123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await settleClipboard();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await settleClipboard();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Copied')).toBeVisible();
  });

  it('starts no reset timer when the clipboard write resolves after unmount', async () => {
    // Only the timer clock is faked; the clipboard promise still settles on the
    // real microtask queue.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const write = deferred<undefined>();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => write.promise);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { unmount } = render(<CopyField value="tai42_key_123" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('tai42_key_123');

    // The caller's dialog closes on the same click, so the write is still in
    // flight when the component goes away.
    unmount();
    expect(vi.getTimerCount()).toBe(0);

    write.resolve(undefined);
    await act(async () => {
      await Promise.resolve();
    });

    // The unmount cleanup has already run, so a timer started now is one nothing
    // is left to clear — the resolution must not touch state at all.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its pending reset timer on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    mockClipboard();
    const { unmount } = render(<CopyField value="tai42_key_123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await settleClipboard();

    clearTimeoutSpy.mockClear();
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

it('renders its content and keeps the button accessible name', () => {
  render(<CopyField value="tai42_key_123" label="API key" caption="Copy it now." />);

  expect(screen.getByText('API key')).toHaveClass('tai-field-label');
  expect(screen.getByText('tai42_key_123')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy' })).toHaveClass('tai-btn-secondary');
});
