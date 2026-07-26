/**
 * `ScrollRegion` — a horizontally scrollable container that becomes a keyboard
 * target ONLY while it actually overflows.
 *
 * A pane that scrolls must be reachable without a pointer (WCAG 2.1.1), which
 * needs `tabIndex`, `role="region"` and a name. Applying those unconditionally
 * would litter every screen with phantom landmarks and dead tab stops for tables
 * that happen to fit, so the attributes are driven by a live measurement:
 * `scrollWidth > clientWidth`, re-taken whenever the container or its content
 * resizes and whenever the content is replaced.
 *
 * `useProseTableRegions` applies the same rules to tables React never renders —
 * those inside `dangerouslySetInnerHTML` (rendered README/markdown), which
 * cannot be wrapped in a component and are therefore instrumented imperatively.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

export interface ScrollRegionProps {
  /** The region's accessible name, applied only while it actually scrolls. */
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** The default name for a prose table that has no heading above it. */
const DEFAULT_PROSE_TABLE_LABEL = 'README table';

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

const SCROLL_REGION_CLASS = 'tai-scroll-region';

function overflows(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth;
}

export function ScrollRegion({ label, children, className, style }: ScrollRegionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  // `children` is a dependency because a replaced child is a NEW element: the
  // observer must be re-pointed at it and the measurement re-taken. Re-running
  // is cheap — the measurement settles on the same value and React drops the
  // no-op state update.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const measure = (): void => {
      setScrollable(overflows(container));
    };

    const observer = new ResizeObserver(measure);
    // The container gives resize; its content gives the overflowing width.
    observer.observe(container);
    for (const child of container.children) observer.observe(child);
    measure();

    return () => {
      observer.disconnect();
    };
  }, [children]);

  return (
    <div
      ref={containerRef}
      className={
        className === undefined ? SCROLL_REGION_CLASS : `${SCROLL_REGION_CLASS} ${className}`
      }
      style={style}
      tabIndex={scrollable ? 0 : undefined}
      role={scrollable ? 'region' : undefined}
      aria-label={scrollable ? label : undefined}
    >
      {children}
    </div>
  );
}

/**
 * The wrapper a prose table sits inside, creating it on first pass. Idempotent:
 * a table already inside a `.tai-scroll-region` keeps the wrapper it has.
 */
function ensureScrollWrapper(table: HTMLTableElement): HTMLElement {
  const parent = table.parentElement;
  if (parent?.classList.contains(SCROLL_REGION_CLASS) === true) return parent;
  const wrapper = table.ownerDocument.createElement('div');
  wrapper.className = SCROLL_REGION_CLASS;
  table.replaceWith(wrapper);
  wrapper.append(table);
  return wrapper;
}

/**
 * The text of the nearest heading PRECEDING `from` in document order, searched
 * outwards through earlier siblings and then up through ancestors, stopping at
 * `root`. Returns `undefined` when the subtree has no heading before the table.
 */
function precedingHeadingText(from: Element, root: Element): string | undefined {
  let current: Element | null = from;
  while (current !== null && current !== root) {
    let sibling = current.previousElementSibling;
    while (sibling !== null) {
      const nested = [...sibling.querySelectorAll(HEADING_SELECTOR)];
      const nearest = sibling.matches(HEADING_SELECTOR) ? sibling : nested.at(-1);
      const text = nearest?.textContent.trim() ?? '';
      if (text !== '') return text;
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return undefined;
}

/** Applies the same conditional attribute set `ScrollRegion` renders. */
function applyScrollRegionAttributes(wrapper: HTMLElement, label: string): void {
  if (overflows(wrapper)) {
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', label);
    return;
  }
  wrapper.removeAttribute('tabindex');
  wrapper.removeAttribute('role');
  wrapper.removeAttribute('aria-label');
}

/**
 * Instruments every `<table>` under `ref` as a scroll region. React cannot wrap
 * markup it did not create, so this walks the DOM instead: each table is moved
 * into a `div.tai-scroll-region` (once — the pass is idempotent) which then
 * carries the same conditional `tabindex`/`role`/`aria-label` as `ScrollRegion`.
 *
 * The name is the nearest preceding heading, so a reader landing on the region
 * hears which section's table it is; `options.fallbackLabel` covers a table with
 * no heading above it.
 *
 * Injected HTML is replaced wholesale when its source changes, so the pass is
 * re-run from a `MutationObserver` on the subtree rather than on mount alone.
 *
 * @param ref - the element whose subtree holds the injected markup.
 * @param options.fallbackLabel - the name for a table with no preceding heading.
 */
export function useProseTableRegions(
  ref: RefObject<HTMLElement | null>,
  options?: { readonly fallbackLabel?: string },
): void {
  const fallbackLabel = options?.fallbackLabel ?? DEFAULT_PROSE_TABLE_LABEL;

  useEffect(() => {
    const root = ref.current;
    if (root === null) return;

    // Re-observing an element already under a ResizeObserver re-arms its initial
    // notification, which would make each pass trigger the next one forever.
    const observed = new WeakSet<Element>();

    // A pass over the whole subtree. It reads the observers declared below it —
    // safe because nothing calls it until both exist, and it must be declared
    // here so `root` stays narrowed to a non-null element.
    const instrument = (): void => {
      // Wrapping mutates the subtree; pause the observer so this pass cannot
      // re-trigger itself, and drop the records it generated before resuming.
      mutationObserver.disconnect();
      for (const table of root.querySelectorAll('table')) {
        const wrapper = ensureScrollWrapper(table);
        if (!observed.has(wrapper)) {
          observed.add(wrapper);
          resizeObserver.observe(wrapper);
        }
        applyScrollRegionAttributes(wrapper, precedingHeadingText(wrapper, root) ?? fallbackLabel);
      }
      mutationObserver.takeRecords();
      mutationObserver.observe(root, { childList: true, subtree: true });
    };

    const resizeObserver = new ResizeObserver(instrument);
    const mutationObserver = new MutationObserver(instrument);

    instrument();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref, fallbackLabel]);
}
