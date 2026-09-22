/**
 * The overflow measurement and the region-attribute contract: whether a box
 * scrolls right now, and the conditional `tabindex`/`role`/`aria-label` a
 * scrolling box wears. The leaf the React surface and the prose walk both build
 * on; it imports neither of them, which is what breaks the write/measure cycle.
 */

export const SCROLL_REGION_CLASS = 'tai-scroll-region';

/**
 * The axis a scroll region is measured on. A prose table or a code line scrolls
 * SIDEWAYS (`horizontal`, the default); a bounded, capped-height list scrolls
 * DOWN (`vertical`). Both wear the same conditional region attributes — only the
 * dimension read to decide whether they overflow differs.
 */
export type OverflowAxis = 'horizontal' | 'vertical';

export function overflows(element: HTMLElement, axis: OverflowAxis = 'horizontal'): boolean {
  return axis === 'vertical'
    ? element.scrollHeight > element.clientHeight
    : element.scrollWidth > element.clientWidth;
}

/**
 * Whether the element should carry the region attributes right now, measured on
 * `axis`.
 *
 * A region that stops overflowing keeps its tab stop for as long as it holds
 * focus: taking `tabindex` off the focused element drops the reader onto the
 * document body, and a window resize is not their doing. Only an element that
 * already has the stop can be the active element, so this can hold a stop open
 * but never invent one.
 */
export function needsRegion(element: HTMLElement, axis: OverflowAxis = 'horizontal'): boolean {
  return overflows(element, axis) || element.ownerDocument.activeElement === element;
}

/** A tracked scrollable surface, with the name it wears while it scrolls. */
export interface TrackedSurface {
  readonly surface: HTMLElement;
  readonly label: string;
}

/** Strips the region attributes from a surface that is not a region now. */
export function clearScrollRegionAttributes(wrapper: HTMLElement): void {
  wrapper.removeAttribute('tabindex');
  wrapper.removeAttribute('role');
  wrapper.removeAttribute('aria-label');
}

/** Applies the same conditional attribute set `ScrollRegion` renders. */
export function applyScrollRegionAttributes(
  wrapper: HTMLElement,
  label: string,
  scrolling: boolean,
): void {
  if (!scrolling) {
    clearScrollRegionAttributes(wrapper);
    return;
  }
  wrapper.setAttribute('tabindex', '0');
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', label);
}

/**
 * Re-applies the region attributes to `tracked`, reading ALL of them before
 * writing any.
 *
 * `needsRegion` reads `scrollWidth`, which forces layout if anything has been
 * written since the last one — so measuring and writing surface by surface makes
 * the browser re-lay-out the prose once per surface, every time. Two phases cost
 * one layout for the whole batch however many surfaces it holds.
 */
export function refreshRegions(tracked: readonly TrackedSurface[]): void {
  const scrolling = tracked.map((entry) => needsRegion(entry.surface));
  for (const [index, entry] of tracked.entries()) {
    applyScrollRegionAttributes(entry.surface, entry.label, scrolling[index] === true);
  }
}
