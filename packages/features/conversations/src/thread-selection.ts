/**
 * The thread-list selection store: the set of thread ids the reader has ticked,
 * for the bulk reset that fans a per-thread delete over them.
 *
 * The selection is always a subset of the rows CURRENTLY LOADED on screen. A
 * thread that has paged out, or been filtered away, is not a row the reader can
 * see or act on, so it never counts toward the selection or the fan-out: every
 * reader-facing value here is derived against `loadedIds`, and a ticked id that
 * is no longer loaded simply stops being effective (it returns if the row comes
 * back). "Select all" is therefore all the loaded rows, never an unbounded
 * server-side set.
 */
import { useCallback, useMemo, useState } from 'react';

export interface ThreadSelection {
  /** The ticked ids that are also currently loaded — what the fan-out acts on. */
  readonly selectedIds: readonly string[];
  readonly count: number;
  readonly isSelected: (threadId: string) => boolean;
  /** Every loaded row is ticked (and there is at least one). */
  readonly allSelected: boolean;
  /** Some — but not all — loaded rows are ticked (the header's mixed state). */
  readonly someSelected: boolean;
  readonly toggle: (threadId: string) => void;
  /** Tick every loaded row, or clear them all when they are already all ticked. */
  readonly toggleAll: () => void;
  /** Drop ids from the selection — the threads a reset forgot are gone. */
  readonly deselect: (threadIds: readonly string[]) => void;
}

export function useThreadSelection(loadedIds: readonly string[]): ThreadSelection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set<string>());

  const selectedIds = useMemo(() => loadedIds.filter((id) => picked.has(id)), [loadedIds, picked]);
  const count = selectedIds.length;
  const allSelected = loadedIds.length > 0 && count === loadedIds.length;
  const someSelected = count > 0 && !allSelected;

  const isSelected = useCallback((threadId: string) => picked.has(threadId), [picked]);

  const toggle = useCallback((threadId: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setPicked((current) => {
      const everyLoadedPicked = loadedIds.length > 0 && loadedIds.every((id) => current.has(id));
      const next = new Set(current);
      for (const id of loadedIds) {
        if (everyLoadedPicked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [loadedIds]);

  const deselect = useCallback((threadIds: readonly string[]) => {
    setPicked((current) => {
      const next = new Set(current);
      for (const id of threadIds) next.delete(id);
      return next;
    });
  }, []);

  return {
    selectedIds,
    count,
    isSelected,
    allSelected,
    someSelected,
    toggle,
    toggleAll,
    deselect,
  };
}
