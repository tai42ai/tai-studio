import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deferred } from '../testing';
import { COPIED_RESET_MS, useClipboardCopy, type ClipboardCopyMessages } from './useClipboardCopy';

/** Per-control wording; asserted verbatim so the two branches never blur. */
const messages: ClipboardCopyMessages = {
  noClipboard: 'No clipboard here.',
  writeFailed: (reason) =>
    `Write failed: ${reason instanceof Error ? reason.message : String(reason)}.`,
};

function mockClipboard() {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('useClipboardCopy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the copied window and reverts to resting after COPIED_RESET_MS', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const writeText = mockClipboard();
    const { result } = renderHook(() => useClipboardCopy(messages));

    // Resting: nothing confirmed, nothing announced.
    expect(result.current.copied).toBe(false);
    expect(result.current.announcement).toBe('');

    await act(async () => {
      await result.current.copy(() => 'value');
    });

    expect(writeText).toHaveBeenCalledWith('value');
    expect(result.current.copied).toBe(true);
    // The polite announcement is gated on the confirmed window.
    expect(result.current.announcement).toBe('Copied to clipboard');

    act(() => {
      vi.advanceTimersByTime(COPIED_RESET_MS);
    });

    expect(result.current.copied).toBe(false);
    expect(result.current.announcement).toBe('');
  });

  it('reports the noClipboard wording when the browser offers no clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const { result } = renderHook(() => useClipboardCopy(messages));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.copy(() => 'value');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe(messages.noClipboard);
    expect(result.current.copied).toBe(false);
  });

  it('surfaces the writeFailed wording, loudly, when the write is refused', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { result } = renderHook(() => useClipboardCopy(messages));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.copy(() => 'value');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('Write failed: denied.');
    expect(result.current.copied).toBe(false);
  });

  it('routes a throwing produce() thunk through the same failure path as a refused write', async () => {
    const writeText = mockClipboard();
    const { result } = renderHook(() => useClipboardCopy(messages));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.copy(() => {
        throw new Error('cannot serialize');
      });
    });

    // The thunk threw before any write — surfaced as the failure wording, never
    // rethrown out of copy() and never silently swallowed.
    expect(ok).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Write failed: cannot serialize.');
    expect(result.current.copied).toBe(false);
  });

  it('clears a prior failure at the START of a new attempt, before the retry settles', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { result } = renderHook(() => useClipboardCopy(messages));

    // A first attempt is refused and surfaces its alert.
    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => {
      await result.current.copy(() => 'value');
    });
    expect(result.current.error).toBe('Write failed: denied.');

    // A second attempt whose write is still in flight must clear the stale alert
    // immediately, without waiting for the retry to land.
    const write = deferred<undefined>();
    writeText.mockReturnValueOnce(write.promise);
    act(() => {
      void result.current.copy(() => 'value');
    });
    expect(result.current.error).toBeUndefined();

    // And the in-flight retry still resolves to the confirmed window.
    await act(async () => {
      write.resolve(undefined);
      await Promise.resolve();
    });
    expect(result.current.copied).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('touches no state when the write resolves after unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const write = deferred<undefined>();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => write.promise);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { result, unmount } = renderHook(() => useClipboardCopy(messages));

    let copyPromise: Promise<boolean> | undefined;
    act(() => {
      copyPromise = result.current.copy(() => 'value');
    });
    expect(writeText).toHaveBeenCalledWith('value');

    // The caller's dialog closes on the same click, so the write is still in flight
    // when the hook goes away.
    unmount();
    expect(vi.getTimerCount()).toBe(0);

    write.resolve(undefined);
    await act(async () => {
      await copyPromise;
    });

    // The unmount cleanup has already run; the resolution must start no reset timer.
    expect(vi.getTimerCount()).toBe(0);
  });
});
