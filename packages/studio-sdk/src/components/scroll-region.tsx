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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/**
 * Headings AND the surfaces they name, in one selector: a single query returns
 * both interleaved in document order, which is what lets one walk name every
 * surface (see `labelledProseSurfaces`).
 */
const PROSE_SURFACE_SELECTOR = `${HEADING_SELECTOR}, table, pre`;

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

/**
 * ONE `ResizeObserver` for every scrolling box in the document, rather than one
 * per mount.
 *
 * `useOverflowRegion` is per-INSTANCE — a timeline renders two `CodeBlock`s per
 * tool call and windows none of them — so an observer per mount grows with the
 * content, and each one is a separate callback the browser schedules and a
 * separate registration it maintains. A single observer costs one of each
 * however many boxes are on screen, and the callback still only measures the
 * boxes whose entries it was handed. (`useProseScrollRegions` keeps its own
 * observer: there is one of it per rendered document, not one per surface, and
 * its callback drives DOM writes rather than a React state setter.)
 *
 * Created on first use, because the module is imported in environments that have
 * no `ResizeObserver` at all until a test installs one.
 */
type ResizeHandler = () => void;

/**
 * The handlers waiting on each observed element. A SET, not a single handler:
 * one element can be both a box and another box's child — a `<pre>` inside a
 * `ScrollRegion` is exactly that — and both owners must still hear its resize.
 */
const resizeHandlers = new WeakMap<Element, Set<ResizeHandler>>();
let sharedObserver: ResizeObserver | undefined;

function sharedResizeObserver(): ResizeObserver {
  sharedObserver ??= new ResizeObserver((entries) => {
    // A box and its children are observed separately, so one frame can deliver
    // several entries owned by the same handler; measuring once is enough.
    const fired = new Set<ResizeHandler>();
    for (const entry of entries) {
      for (const handler of resizeHandlers.get(entry.target) ?? []) fired.add(handler);
    }
    for (const handler of fired) handler();
  });
  return sharedObserver;
}

function holdResizeTarget(target: Element, handler: ResizeHandler): void {
  let handlers = resizeHandlers.get(target);
  if (handlers === undefined) {
    handlers = new Set<ResizeHandler>();
    resizeHandlers.set(target, handlers);
  }
  handlers.add(handler);
  sharedResizeObserver().observe(target);
}

/** Stops observing `target` for `handler`, and entirely once nobody wants it. */
function releaseResizeTarget(target: Element, handler: ResizeHandler): void {
  const handlers = resizeHandlers.get(target);
  if (handlers === undefined) return;
  handlers.delete(handler);
  if (handlers.size > 0) return;
  resizeHandlers.delete(target);
  sharedResizeObserver().unobserve(target);
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
 * is a NEW element, so the registration is re-pointed at the current children
 * before each measurement; the resize side of that is a registration on the
 * shared observer, not an observer of this mount's own. The content observer
 * lives for the lifetime of the mount. The only DOM change a measurement can
 * cause is the region ATTRIBUTES this hook returns, and attributes are
 * deliberately left unobserved — that, not an absence of mutation, is what stops
 * the pair from re-triggering each other.
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

    const measure = (): void => {
      setScrollable(needsRegion(box));
    };

    // The box gives resize; its children give the overflowing width. The shared
    // observer is released target by target rather than disconnected, because
    // every other scrolling box on the page is registered on the same one.
    let observed: Element[] = [];
    const observeAll = (): void => {
      for (const target of observed) releaseResizeTarget(target, measure);
      observed = [box, ...box.children];
      for (const target of observed) holdResizeTarget(target, measure);
      measure();
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
      measure();
    };
    box.addEventListener('blur', releaseHeldStop);

    return () => {
      for (const target of observed) releaseResizeTarget(target, measure);
      observed = [];
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

/** A heading that can name the surfaces below it, and the text it would give. */
interface ProseHeading {
  readonly element: Element;
  readonly text: string;
}

/** A scrollable prose surface, with the heading text that names it. */
interface LabelledProseSurface {
  readonly element: HTMLElement;
  readonly heading: string | undefined;
}

/**
 * The text of the last heading in `headings` that does not ENCLOSE `surface`.
 *
 * A heading wrapping the surface does precede it in document order, but it is
 * not a section the surface sits UNDER, so it is stepped over in favour of the
 * heading before it — which is the answer an outward walk from the surface
 * reaches. In well-formed prose no heading contains a table or a code block, so
 * this returns the last heading on the first look.
 */
function namingHeadingText(
  headings: readonly ProseHeading[],
  surface: Element,
): string | undefined {
  for (let index = headings.length - 1; index >= 0; index -= 1) {
    const heading = headings[index];
    if (heading !== undefined && !heading.element.contains(surface)) return heading.text;
  }
  return undefined;
}

/**
 * Every scrollable prose surface under `root` — each `<table>` and each `<pre>`
 * — paired with the text of the nearest heading PRECEDING it, or `undefined`
 * when no heading does.
 *
 * One query returns the headings and the surfaces interleaved in document order,
 * so a single walk over that list names all of them: the heading a surface
 * belongs to is the last one seen before reaching it. Naming each surface by
 * searching backwards from it instead would re-read the same prose once per
 * surface, at a cost that grows with the product of the two.
 *
 * Blank headings never enter the list, so a decorative empty heading names
 * nothing and the section above it is used instead. A heading INSIDE a surface
 * (a `<pre>` or a table cell holding one) comes AFTER that surface in document
 * order and so can never name it, though it does name later surfaces — exactly
 * as being the last heading before them implies.
 *
 * Read in full before the pass wraps anything, and safely so: a name depends
 * only on what PRECEDES its surface, and `ensureScrollWrapper` puts the wrapper
 * in the table's own place, moving nothing else and leaving every heading where
 * it was — so a name stays true whether its table is wrapped yet or not.
 */
function labelledProseSurfaces(root: Element): LabelledProseSurface[] {
  const headings: ProseHeading[] = [];
  const surfaces: LabelledProseSurface[] = [];

  for (const node of root.querySelectorAll<HTMLElement>(PROSE_SURFACE_SELECTOR)) {
    if (node.matches(HEADING_SELECTOR)) {
      const text = node.textContent.trim();
      if (text !== '') headings.push({ element: node, text });
      continue;
    }
    surfaces.push({ element: node, heading: namingHeadingText(headings, node) });
  }
  return surfaces;
}

/** An instrumented prose surface, with the name it wears while it scrolls. */
interface TrackedSurface {
  readonly surface: HTMLElement;
  readonly label: string;
}

/** Applies the same conditional attribute set `ScrollRegion` renders. */
function applyScrollRegionAttributes(
  wrapper: HTMLElement,
  label: string,
  scrolling: boolean,
): void {
  if (scrolling) {
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
 * Re-applies the region attributes to `tracked`, reading ALL of them before
 * writing any.
 *
 * `needsRegion` reads `scrollWidth`, which forces layout if anything has been
 * written since the last one — so measuring and writing surface by surface makes
 * the browser re-lay-out the prose once per surface, every time. Two phases cost
 * one layout for the whole batch however many surfaces it holds.
 */
function refreshRegions(tracked: readonly TrackedSurface[]): void {
  const scrolling = tracked.map((entry) => needsRegion(entry.surface));
  for (const [index, entry] of tracked.entries()) {
    applyScrollRegionAttributes(entry.surface, entry.label, scrolling[index] === true);
  }
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
 * The name is the nearest heading preceding the surface — read for all of them
 * in one document-order pass — so a reader landing on the region hears which
 * section it belongs to; `labels` covers a surface with no heading above it.
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

  // `useLayoutEffect`, not `useEffect`: this hook RESTRUCTURES the DOM, and a
  // passive effect runs after paint. `.tai-prose table` is `width: 100%` with no
  // overflow of its own — the scroller exists only on the wrapper this builds —
  // so a passive first pass paints one frame at 320/360 px with the table
  // overflowing the document, then jolts sideways. Measured from a layout-effect
  // probe: AT FIRST PAINT wrappers=0, table parent `.tai-prose`. There is no SSR
  // path in this SPA for the layout phase to break.
  useLayoutEffect(() => {
    const root = ref.current;
    if (root === null) return;

    // Every observed element, mapped to the surface whose width it reports and
    // that surface's current name. This is what lets a resize re-measure just
    // the surfaces that moved: an observer callback carries the elements that
    // resized, and each of them answers here with the region it belongs to.
    // Membership doubles as the re-observation guard — re-observing an element
    // already under a ResizeObserver re-arms its initial notification, which
    // would make each pass trigger the next one forever.
    const surfaceOf = new WeakMap<Element, TrackedSurface>();

    // The box gives resize; its children give the overflowing width. A table that
    // grows wider inside a parent-constrained wrapper resizes nothing else, so
    // watching the wrapper alone would freeze the mount-time measurement.
    const track = (element: HTMLElement, label: string): void => {
      for (const target of [element, ...element.children]) {
        const observed = surfaceOf.has(target);
        // Rewritten even when already observed: a re-run may have found a new
        // heading above the surface, and the name has to follow it.
        surfaceOf.set(target, { surface: element, label });
        if (!observed) resizeObserver.observe(target);
      }
    };

    // A pass over the whole subtree. It reads the observers declared below it —
    // safe because nothing calls it until both exist, and it must be declared
    // here so `root` stays narrowed to a non-null element.
    const instrument = (): void => {
      // Wrapping mutates the subtree; pause the observer so this pass cannot
      // re-trigger itself, and drop the records it generated before resuming.
      mutationObserver.disconnect();
      // Every name comes from one document-order read of the prose, taken before
      // the first wrapper goes in. The list is a static snapshot and the
      // surfaces in it stay the same elements: wrapping moves a table one level
      // down, into a `div` standing exactly where the table stood, so neither
      // the remaining entries nor the names already computed for them change.
      const tracked: TrackedSurface[] = [];
      for (const { element, heading } of labelledProseSurfaces(root)) {
        const table = element instanceof HTMLTableElement;
        const surface = table ? ensureScrollWrapper(element) : element;
        const label = heading ?? (table ? tableLabel : preLabel);
        track(surface, label);
        tracked.push({ surface, label });
      }
      // Wrapping is done for every surface before the first measurement, so the
      // whole pass costs one layout rather than one per surface.
      refreshRegions(tracked);
      mutationObserver.takeRecords();
      mutationObserver.observe(root, { childList: true, subtree: true });
    };

    // Only the surfaces that actually resized are re-measured. Re-running the
    // whole instrumentation pass from here re-queried the entire prose subtree
    // on every resize frame, and a document with many surfaces spends that cost
    // once per frame for the whole time a pane is being dragged.
    const resizeObserver = new ResizeObserver((entries) => {
      // A surface and its children are observed separately, so one frame can
      // deliver several entries naming the same region; measuring it once is
      // enough.
      const affected = new Map<HTMLElement, TrackedSurface>();
      for (const entry of entries) {
        const tracked = surfaceOf.get(entry.target);
        if (tracked !== undefined) affected.set(tracked.surface, tracked);
      }
      refreshRegions([...affected.values()]);
    });
    const mutationObserver = new MutationObserver(instrument);

    // A stop held open only because the region had focus outlives its reason the
    // moment the reader leaves. `focusout` bubbles, so one listener on the root
    // covers every instrumented surface under it, however often they are
    // replaced; the attribute pair is exactly what this hook writes, so it is
    // also what identifies a region among the prose's other focusable content.
    const releaseHeldStop = (event: FocusEvent): void => {
      const left = event.target;
      if (!(left instanceof HTMLElement)) return;
      if (left.getAttribute('role') !== 'region' || !left.hasAttribute('tabindex')) return;
      // The stop being released belongs to exactly one region, so re-measure
      // that one rather than re-walking the prose. A region this hook did not
      // instrument is not ours to release.
      const tracked = surfaceOf.get(left);
      if (tracked !== undefined) refreshRegions([tracked]);
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
