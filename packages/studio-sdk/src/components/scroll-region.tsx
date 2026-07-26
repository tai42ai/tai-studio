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
 * `useOverflowRegion` is the same measurement for a component that IS its own
 * scrolling box (a `<pre>`, a JSON pane) and therefore cannot be wrapped in a
 * `<div>` without gaining a second scroller. `useProseScrollRegions` applies the
 * rules to the surfaces React never renders — the tables and code blocks inside
 * `dangerouslySetInnerHTML` (rendered README/markdown), which cannot be wrapped
 * in a component and are therefore instrumented imperatively.
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

/** The names for a prose surface that has no heading above it. */
const DEFAULT_PROSE_LABELS = { table: 'README table', pre: 'README code block' } as const;

/** The fallback name per instrumented surface, when no heading precedes it. */
export interface ProseScrollLabels {
  readonly table?: string;
  readonly pre?: string;
}

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

const SCROLL_REGION_CLASS = 'tai-scroll-region';

function overflows(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth;
}

/** The attribute set a scrolling box wears; every value is absent while it fits. */
export interface OverflowRegionAttributes {
  readonly tabIndex?: 0;
  readonly role?: 'region';
  readonly 'aria-label'?: string;
}

/**
 * The conditional region attributes for the element `ref` points at, which must
 * be the scrolling box itself. Measured on mount, on every resize of the box or
 * its children, and whenever `content` changes identity — a replaced child is a
 * NEW element, so the observer has to be re-pointed at it and the measurement
 * re-taken.
 *
 * @param ref - the scrolling element.
 * @param label - its accessible name, applied only while it actually scrolls.
 * @param content - the rendered content, so a replacement re-triggers the measurement.
 */
export function useOverflowRegion(
  ref: RefObject<HTMLElement | null>,
  label: string,
  content?: unknown,
): OverflowRegionAttributes {
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const box = ref.current;
    if (box === null) return;

    const measure = (): void => {
      setScrollable(overflows(box));
    };

    const observer = new ResizeObserver(measure);
    // The box gives resize; its content gives the overflowing width.
    observer.observe(box);
    for (const child of box.children) observer.observe(child);
    measure();

    return () => {
      observer.disconnect();
    };
  }, [ref, content]);

  if (!scrollable) return {};
  return { tabIndex: 0, role: 'region', 'aria-label': label };
}

export function ScrollRegion({ label, children, className, style }: ScrollRegionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const region = useOverflowRegion(containerRef, label, children);

  return (
    <div
      ref={containerRef}
      className={
        className === undefined ? SCROLL_REGION_CLASS : `${SCROLL_REGION_CLASS} ${className}`
      }
      style={style}
      {...region}
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
 * Instruments the scrollable surfaces under `ref` — every `<table>` and every
 * `<pre>` — as scroll regions. React cannot wrap markup it did not create, so
 * this walks the DOM instead. A table is moved into a `div.tai-scroll-region`
 * (once — the pass is idempotent) because the table itself is not the scrolling
 * box; a `<pre>` already IS its own scrolling box, so it is instrumented in
 * place. Either way the scrolling element carries the same conditional
 * `tabindex`/`role`/`aria-label` as `ScrollRegion`.
 *
 * The name is the nearest preceding heading, so a reader landing on the region
 * hears which section it belongs to; `labels` covers a surface with no heading
 * above it.
 *
 * Injected HTML is replaced wholesale when its source changes, so the pass is
 * re-run from a `MutationObserver` on the subtree rather than on mount alone.
 *
 * @param ref - the element whose subtree holds the injected markup.
 * @param labels - the names for surfaces with no preceding heading.
 */
export function useProseScrollRegions(
  ref: RefObject<HTMLElement | null>,
  labels?: ProseScrollLabels,
): void {
  const tableLabel = labels?.table ?? DEFAULT_PROSE_LABELS.table;
  const preLabel = labels?.pre ?? DEFAULT_PROSE_LABELS.pre;

  useEffect(() => {
    const root = ref.current;
    if (root === null) return;

    // Re-observing an element already under a ResizeObserver re-arms its initial
    // notification, which would make each pass trigger the next one forever.
    const observed = new WeakSet<Element>();

    const track = (element: HTMLElement, fallbackLabel: string): void => {
      if (!observed.has(element)) {
        observed.add(element);
        resizeObserver.observe(element);
      }
      applyScrollRegionAttributes(element, precedingHeadingText(element, root) ?? fallbackLabel);
    };

    // A pass over the whole subtree. It reads the observers declared below it —
    // safe because nothing calls it until both exist, and it must be declared
    // here so `root` stays narrowed to a non-null element.
    const instrument = (): void => {
      // Wrapping mutates the subtree; pause the observer so this pass cannot
      // re-trigger itself, and drop the records it generated before resuming.
      mutationObserver.disconnect();
      for (const table of root.querySelectorAll('table')) {
        track(ensureScrollWrapper(table), tableLabel);
      }
      for (const pre of root.querySelectorAll('pre')) {
        track(pre, preLabel);
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
  }, [ref, tableLabel, preLabel]);
}
