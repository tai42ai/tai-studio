/**
 * A stable per-key callback factory. A container (object, array, record) renders
 * one child per key and folds that child's edits back into the container value.
 * Written inline, each child's `onChange` is a fresh closure every render, which
 * defeats {@link FieldNode}'s `memo`: an untouched sibling re-renders whenever any
 * field changes. This returns the SAME function identity for a given key across
 * renders — so a memoized child keyed on that identity is skipped when a sibling
 * changes — while each call reads the latest folding logic through a ref, so the
 * callback never closes over a stale container value.
 *
 * The cache is bounded by `liveKeys`, the container's current key set: every
 * render evicts each cached handler whose key is not live, so a mounted form that
 * adds and drops entries holds at most one handler per live key (the record
 * field keys by a monotonic row id, so without eviction it would leak one dead
 * handler per id ever created). Eviction runs during render on the ref-held Map —
 * no effect, no extra render — and never touches a live key's handler, so
 * identity stays stable for every key that survives the render.
 */
import { useRef } from 'react';

export function useKeyedCallbacks<K, A>(
  fold: (key: K, arg: A) => void,
  liveKeys: Iterable<K>,
): (key: K) => (arg: A) => void {
  const foldRef = useRef(fold);
  foldRef.current = fold;
  // The cache lives in a ref, lazily initialised, so its identity is HARD-stable
  // for the component's whole life: a `useMemo(() => new Map(), [])` cache is only
  // a hint React may discard, which would drop every cached handler and re-render
  // every sibling — the regression the memo is here to prevent.
  const cacheRef = useRef<Map<K, (arg: A) => void> | undefined>(undefined);
  const cache = (cacheRef.current ??= new Map<K, (arg: A) => void>());
  const live = new Set<K>(liveKeys);
  for (const key of cache.keys()) {
    if (!live.has(key)) cache.delete(key);
  }
  return (key: K) => {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const handler = (arg: A): void => {
      foldRef.current(key, arg);
    };
    cache.set(key, handler);
    return handler;
  };
}
