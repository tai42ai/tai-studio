/**
 * The explorer's persisted page size, per view surface. Mirrors `useViewMode`: an
 * invalid or absent stored value degrades to the default, and a storage failure
 * degrades to in-memory only — never a thrown boot.
 */
import { useCallback, useState } from 'react';

/** The page-size choices, and the default. */
export const PAGE_SIZES = [12, 24, 48, 96] as const;
const DEFAULT_PAGE_SIZE = 24;

const PAGE_SIZE_STORAGE_PREFIX = 'tai-studio.page-size.';

function readStoredPageSize(surface: string): number {
  try {
    const raw = globalThis.localStorage.getItem(PAGE_SIZE_STORAGE_PREFIX + surface);
    const parsed = raw === null ? Number.NaN : Number(raw);
    if ((PAGE_SIZES as readonly number[]).includes(parsed)) return parsed;
  } catch {
    // No storage (private mode / non-browser) — fall back to the default.
  }
  return DEFAULT_PAGE_SIZE;
}

export function usePageSize(surface: string): readonly [number, (size: number) => void] {
  const [size, setSizeState] = useState<number>(() => readStoredPageSize(surface));
  const setSize = useCallback(
    (next: number) => {
      setSizeState(next);
      try {
        globalThis.localStorage.setItem(PAGE_SIZE_STORAGE_PREFIX + surface, String(next));
      } catch {
        // Storage unavailable — the choice still applies for this session.
      }
    },
    [surface],
  );
  return [size, setSize];
}
