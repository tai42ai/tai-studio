/**
 * The bounded per-key handler cache: for a given live key the same function
 * identity survives re-renders (so a memoized child is skipped when a sibling
 * changes), a key that leaves the live set is evicted (so the cache stays bounded
 * by the container's current key set), and every fire reads the latest fold.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useKeyedCallbacks } from './keyed-callbacks';

interface Props {
  readonly fold: (key: string, arg: unknown) => void;
  readonly liveKeys: readonly string[];
}

const noop = (): void => {
  // A fold that ignores its edit: these cases assert handler identity, not effect.
};

describe('useKeyedCallbacks', () => {
  it('returns the same handler for a live key across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ fold, liveKeys }: Props) => useKeyedCallbacks(fold, liveKeys),
      { initialProps: { fold: noop, liveKeys: ['a', 'b'] } },
    );

    const firstA = result.current('a');
    const firstB = result.current('b');

    rerender({ fold: noop, liveKeys: ['a', 'b'] });

    expect(result.current('a')).toBe(firstA);
    expect(result.current('b')).toBe(firstB);
  });

  it('evicts a key that leaves liveKeys and mints a fresh handler when it returns', () => {
    const { result, rerender } = renderHook(
      ({ fold, liveKeys }: Props) => useKeyedCallbacks(fold, liveKeys),
      { initialProps: { fold: noop, liveKeys: ['a', 'b'] } },
    );

    const firstA = result.current('a');
    const firstB = result.current('b');

    // 'a' drops out of the live set: its handler is evicted this render.
    rerender({ fold: noop, liveKeys: ['b'] });
    // 'a' comes back: a live key throughout, 'b' keeps its identity.
    rerender({ fold: noop, liveKeys: ['a', 'b'] });

    expect(result.current('a')).not.toBe(firstA);
    expect(result.current('b')).toBe(firstB);
  });

  it('fires the latest fold, not the one captured when the handler was minted', () => {
    const calls: string[] = [];
    const { result, rerender } = renderHook(
      ({ fold, liveKeys }: Props) => useKeyedCallbacks(fold, liveKeys),
      {
        initialProps: {
          fold: (key: string, arg: unknown) => calls.push(`v1:${key}:${String(arg)}`),
          liveKeys: ['a'],
        },
      },
    );

    const handler = result.current('a');
    rerender({
      fold: (key: string, arg: unknown) => calls.push(`v2:${key}:${String(arg)}`),
      liveKeys: ['a'],
    });

    handler('x');

    expect(result.current('a')).toBe(handler);
    expect(calls).toEqual(['v2:a:x']);
  });
});
