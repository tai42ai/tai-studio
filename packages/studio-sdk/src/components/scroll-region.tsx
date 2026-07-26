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
  readonly 'data-testid'?: string;
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

/**
 * Whether the element should carry the region attributes right now.
 *
 * A region that stops overflowing keeps its tab stop for as long as it holds
 * focus: taking `tabindex` off the focused element drops the reader onto the
 * document body, and a window resize is not their doing. Only an element that
 * already has the stop can be the active element, so this can hold a stop open
 * but never invent one.
 */
function needsRegion(element: HTMLElement): boolean {
  return overflows(element) || element.ownerDocument.activeElement === element;
}

/** The attribute set a scrolling box wears; every value is absent while it fits. */
export interface OverflowRegionAttributes {
  readonly tabIndex?: 0;
  readonly role?: 'region';
  readonly 'aria-label'?: string;
}

/**
 * The conditional region attributes for the element `ref` points at, which must
 * be the scrolling box ITSELF — a `<pre>`, a JSON pane, or the `div`
 * `ScrollRegion` renders. Use it when wrapping the content in a `ScrollRegion`
 * would give the surface a second scroller.
 *
 * The box is measured on mount, whenever it or any child resizes, and whenever
 * its content changes — replaced, appended, or edited in place. A replaced child
 * is a NEW element, so the resize observer is re-pointed at the current children
 * before each measurement. Both observers live for the lifetime of the mount.
 * The only DOM change a measurement can cause is the region ATTRIBUTES this hook
 * returns, and attributes are deliberately left unobserved — that, not an absence
 * of mutation, is what stops the pair from re-triggering each other.
 *
 * @param ref - the scrolling element.
 * @param label - its accessible name, applied only while it actually scrolls.
 */
export function useOverflowRegion(
  ref: RefObject<HTMLElement | null>,
  label: string,
): OverflowRegionAttributes {
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const box = ref.current;
    if (box === null) return;

    const resizeObserver = new ResizeObserver(() => {
      setScrollable(needsRegion(box));
    });

    // The box gives resize; its children give the overflowing width.
    const observeAll = (): void => {
      resizeObserver.disconnect();
      resizeObserver.observe(box);
      for (const child of box.children) resizeObserver.observe(child);
      setScrollable(needsRegion(box));
    };

    // The whole subtree, text included: content is as often EDITED IN PLACE — a
    // longer code string, a different JSON body — as it is replaced, and React
    // reuses the element when it does, so watching the direct child list alone
    // would freeze the measurement at whatever the first content needed.
    // ATTRIBUTES are deliberately absent: the region attributes are what a
    // measurement writes, and observing them would make each pass trigger the next.
    const contentObserver = new MutationObserver(observeAll);
    contentObserver.observe(box, { childList: true, subtree: true, characterData: true });
    observeAll();

    // A stop held open only because the box had focus outlives its reason the
    // moment the reader leaves, so re-measure then and let it go.
    const releaseHeldStop = (): void => {
      setScrollable(needsRegion(box));
    };
    box.addEventListener('blur', releaseHeldStop);

    return () => {
      resizeObserver.disconnect();
      contentObserver.disconnect();
      box.removeEventListener('blur', releaseHeldStop);
    };
  }, [ref]);

  if (!scrollable) return {};
  return { tabIndex: 0, role: 'region', 'aria-label': label };
}

export function ScrollRegion({
  label,
  children,
  className,
  style,
  'data-testid': testId,
}: ScrollRegionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const region = useOverflowRegion(containerRef, label);

  return (
    <div
      ref={containerRef}
      className={
        className === undefined ? SCROLL_REGION_CLASS : `${SCROLL_REGION_CLASS} ${className}`
      }
      style={style}
      data-testid={testId}
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
  if (needsRegion(wrapper)) {
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

    // The box gives resize; its children give the overflowing width. A table that
    // grows wider inside a parent-constrained wrapper resizes nothing else, so
    // watching the wrapper alone would freeze the mount-time measurement.
    const track = (element: HTMLElement, fallbackLabel: string): void => {
      for (const target of [element, ...element.children]) {
        if (observed.has(target)) continue;
        observed.add(target);
        resizeObserver.observe(target);
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

    // A stop held open only because the region had focus outlives its reason the
    // moment the reader leaves. `focusout` bubbles, so one listener on the root
    // covers every instrumented surface under it, however often they are
    // replaced; the attribute pair is exactly what this hook writes, so it is
    // also what identifies a region among the prose's other focusable content.
    const releaseHeldStop = (event: FocusEvent): void => {
      const left = event.target;
      if (!(left instanceof HTMLElement)) return;
      if (left.getAttribute('role') === 'region' && left.hasAttribute('tabindex')) instrument();
    };
    root.addEventListener('focusout', releaseHeldStop);

    instrument();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      root.removeEventListener('focusout', releaseHeldStop);
    };
  }, [ref, tableLabel, preLabel]);
}
