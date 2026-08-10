/**
 * The monitor's shared wall clock.
 *
 * Every timestamp on these screens renders as a RELATIVE label, which is only
 * true at the instant it was computed. React re-renders on data change alone, and
 * a polled list whose rows have not changed is deeply equal — TanStack hands back
 * the same reference and nothing re-renders — so without a clock of its own a
 * pane left open goes on saying "3 minutes ago" for an hour.
 *
 * One interval per pane, ticking a number the rows read, rather than one per row.
 */
import { useEffect, useState } from 'react';

/**
 * How often a relative label is recomputed. The coarsest unit these labels use is
 * the minute, so a sub-minute tick keeps every one of them honest.
 */
export const RELATIVE_TICK_MS = 30_000;

/** `Date.now()`, re-read every `intervalMs` for as long as the caller is mounted. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
