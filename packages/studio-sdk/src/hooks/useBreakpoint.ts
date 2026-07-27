/**
 * `useBreakpoint` — the JS half of the responsive layer, reporting which of the
 * four viewport bands is current and keeping the boundaries in lockstep with the
 * `max-width` media queries in `components.css`. Layout that CSS can express
 * stays in CSS; this hook is for the decisions CSS cannot make, where a surface
 * must render DIFFERENT markup per band rather than restyle the same markup —
 * mounting one pane of a master/detail split instead of two, say, rather than
 * hiding the second.
 *
 * The queries are `max-width` on purpose: when nothing matches, the band
 * resolves to `full`. That is also the answer in a DOM without `matchMedia`
 * (jsdom), where a desktop default is the only safe assumption — a phone
 * default would silently change what every feature's tests render.
 */
import { useMemo, useSyncExternalStore } from 'react';

export type Breakpoint = 'phone' | 'compact' | 'medium' | 'full';

export interface BreakpointState {
  readonly band: Breakpoint;
  /** True below 640 — the `phone` band, where a surface has one column to work in. */
  readonly isPhone: boolean;
  /** True below 1024 — too narrow for two panes side by side. */
  readonly isSinglePane: boolean;
}

const PHONE_QUERY = '(max-width: 639px)';
const COMPACT_QUERY = '(max-width: 1023px)';
const MEDIUM_QUERY = '(max-width: 1279px)';

const BAND_QUERIES = [PHONE_QUERY, COMPACT_QUERY, MEDIUM_QUERY] as const;

/**
 * `matchMedia` is feature-detected rather than guarded by a swallowed
 * exception, so a real failure inside the media-query layer still throws.
 */
function hasMatchMedia(): boolean {
  return typeof globalThis.matchMedia === 'function';
}

function readBand(): Breakpoint {
  if (!hasMatchMedia()) return 'full';
  if (globalThis.matchMedia(PHONE_QUERY).matches) return 'phone';
  if (globalThis.matchMedia(COMPACT_QUERY).matches) return 'compact';
  if (globalThis.matchMedia(MEDIUM_QUERY).matches) return 'medium';
  return 'full';
}

/**
 * Subscribes to the three band boundaries. A `MediaQueryList` notifies only when
 * its match state flips, so a resize inside a band never reaches React.
 */
function subscribe(onBandChange: () => void): () => void {
  if (!hasMatchMedia()) {
    return () => {
      // No `matchMedia`: the band is fixed at `full` and can never change.
    };
  }
  const lists = BAND_QUERIES.map((query) => globalThis.matchMedia(query));
  for (const list of lists) list.addEventListener('change', onBandChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onBandChange);
  };
}

export function useBreakpoint(): BreakpointState {
  // The snapshot is a plain string, so React re-renders only when the BAND
  // changes even though several boundaries can notify for one resize.
  const band = useSyncExternalStore(subscribe, readBand, readBand);
  return useMemo<BreakpointState>(
    () => ({
      band,
      isPhone: band === 'phone',
      isSinglePane: band === 'phone' || band === 'compact',
    }),
    [band],
  );
}
