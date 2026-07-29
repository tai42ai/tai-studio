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
 *
 * Both hooks hand back a CALLBACK REF for the element they measure, rather than
 * reading one the caller holds: a ref object tells a hook nothing about WHEN it
 * is filled, so a hook that read one would never instrument an element that
 * mounts later than the hook (a README that arrives with the second render) and
 * would never notice one being swapped for another.
 */
import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode, Ref, RefCallback } from 'react';

export interface ScrollRegionProps {
  /** The region's accessible name, applied only while it actually scrolls. */
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  /**
   * The one arbitrary attribute this component forwards. The measured attributes
   * — `tabindex`, `role` and `aria-label` — are the component's own and appear
   * and disappear with the overflow, so a general attribute spread would let a
   * caller set them statically and defeat the measurement. A test hook cannot,
   * which is why it is the exception rather than the first of a set.
   */
  readonly 'data-testid'?: string;
  /** A consumer ref for the scrolling `div` itself. */
  readonly ref?: Ref<HTMLDivElement>;
}

/**
 * The names for a prose surface that has no heading above it.
 *
 * They say what the surface IS and nothing about which document it came from,
 * because this hook cannot know: it instruments whatever markup the caller
 * injected. A default that named one document put that document's name on every
 * caller's regions, and a region a reader hears the wrong name for is worse than
 * a plain one. A caller that CAN say which document it is showing passes its own
 * `labels`; a surface with a heading above it takes that heading instead, which
 * is the usual case.
 */
const DEFAULT_PROSE_LABELS = { table: 'Table', pre: 'Code block' } as const;

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

/**
 * The most surfaces one rendered document is given regions for.
 *
 * The prose is publisher-authored and unbounded in length, and every region is
 * an entry in the landmark list a screen-reader user navigates the page by: a
 * README with more surfaces than this turns that list into the very thing the
 * regions exist to spare a reader. Past the cap a table still gets its scrolling
 * wrapper — the wrapper is what keeps it inside the column — but no name and no
 * tab stop, so the landmark list stays a list a person can read.
 */
const MAX_PROSE_REGIONS = 200;

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
 * Attaches `element` to a consumer ref of either form, and returns the detach
 * for it. A callback ref that answers with its own cleanup gets that cleanup
 * called rather than a second call with `null` — the contract React itself
 * follows for a ref it owns.
 */
function attachRef(ref: Ref<HTMLElement> | undefined, element: HTMLElement): () => void {
  if (ref === undefined || ref === null) return () => undefined;
  if (typeof ref !== 'function') {
    ref.current = element;
    return () => {
      ref.current = null;
    };
  }
  const cleanup = ref(element);
  if (typeof cleanup === 'function') return cleanup;
  return () => {
    ref(null);
  };
}

/**
 * ONE `ResizeObserver` and ONE `MutationObserver` for every scrolling box in the
 * document, rather than a pair per mount.
 *
 * `useOverflowRegion` is per-INSTANCE — a timeline renders two `CodeBlock`s per
 * tool call and windows none of them — so an observer per mount grows with the
 * content, and each one is a separate callback the browser schedules and a
 * separate registration it maintains. One observer of each kind costs one of
 * each however many boxes are on screen, and each callback still only measures
 * the boxes whose records it was handed. (`useProseScrollRegions` keeps its own
 * pair: there is one of it per rendered document, not one per surface, and its
 * callbacks drive DOM writes rather than a React state setter.)
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
let sharedResize: ResizeObserver | undefined;

function sharedResizeObserver(): ResizeObserver {
  sharedResize ??= new ResizeObserver((entries) => {
    // A box and its children are observed separately, so one frame can deliver
    // several entries owned by the same handler; measuring once is enough.
    const fired = new Set<ResizeHandler>();
    for (const entry of entries) {
      for (const handler of resizeHandlers.get(entry.target) ?? []) fired.add(handler);
    }
    for (const handler of fired) handler();
  });
  return sharedResize;
}

/**
 * Registers `handler` for `target`'s resizes, observing the element only the
 * first time anyone asks for it: re-observing an element already under a
 * `ResizeObserver` re-arms its initial notification, which spends a forced
 * layout on a measurement nobody asked for.
 */
function holdResizeTarget(target: Element, handler: ResizeHandler): void {
  const handlers = resizeHandlers.get(target);
  if (handlers !== undefined) {
    handlers.add(handler);
    return;
  }
  // Registered before the element is observed, so the initial notification the
  // observation arms reaches the handler that asked for it.
  resizeHandlers.set(target, new Set<ResizeHandler>([handler]));
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

/** What a box wants to hear about: its content replaced, appended or edited. */
const CONTENT_OBSERVER_INIT: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
};

type ContentHandler = () => void;

/**
 * The handlers waiting on each observed box, and the boxes the shared observer
 * currently holds. Keyed by `Node` because a `characterData` record names the
 * TEXT node that changed, and the walk to the box that owns it goes through
 * whatever nodes lie between.
 */
const contentHandlers = new WeakMap<Node, Set<ContentHandler>>();
const contentTargets = new Set<Element>();
let sharedContent: MutationObserver | undefined;
/** Registrations the shared observer still holds for released boxes. */
let staleContentTargets = 0;

function deliverContentRecords(records: readonly MutationRecord[]): void {
  const fired = new Set<ContentHandler>();
  for (const record of records) {
    // A `childList` record names the changed parent and a `characterData` record
    // the text node itself, either of them at any depth under a box. Every box
    // on the ancestor chain therefore owns the change, exactly as a separate
    // observer on each of them would have seen it — a `<pre>` inside a
    // `ScrollRegion` measures both.
    for (let node: Node | null = record.target; node !== null; node = node.parentNode) {
      for (const handler of contentHandlers.get(node) ?? []) fired.add(handler);
    }
  }
  for (const handler of fired) handler();
}

function sharedContentObserver(): MutationObserver {
  sharedContent ??= new MutationObserver(deliverContentRecords);
  return sharedContent;
}

function holdContentTarget(target: Element, handler: ContentHandler): void {
  let handlers = contentHandlers.get(target);
  if (handlers === undefined) {
    handlers = new Set<ContentHandler>();
    contentHandlers.set(target, handlers);
    contentTargets.add(target);
    sharedContentObserver().observe(target, CONTENT_OBSERVER_INIT);
  }
  handlers.add(handler);
}

/**
 * Stops watching `target`'s content for `handler`.
 *
 * `MutationObserver` has no `unobserve`: the only way to drop one registration
 * is to disconnect the observer and re-observe everything else, which would cost
 * one registration per surviving box every time a box unmounts. A released box
 * is therefore dropped from the handler map at once — its records find no
 * handler and are ignored — and the observer is rebuilt only once the dead
 * registrations outnumber the live ones, which keeps the total registration work
 * proportional to the number of mounts. Records already queued survive the
 * rebuild: they are taken off the observer and delivered by hand.
 */
function releaseContentTarget(target: Element, handler: ContentHandler): void {
  const handlers = contentHandlers.get(target);
  if (handlers === undefined) return;
  handlers.delete(handler);
  if (handlers.size > 0) return;
  contentHandlers.delete(target);
  contentTargets.delete(target);
  staleContentTargets += 1;
  if (staleContentTargets <= contentTargets.size) return;

  const observer = sharedContentObserver();
  const queued = observer.takeRecords();
  observer.disconnect();
  staleContentTargets = 0;
  for (const live of contentTargets) observer.observe(live, CONTENT_OBSERVER_INIT);
  if (queued.length > 0) deliverContentRecords(queued);
}

/** The attribute set a scrolling box wears; every value is absent while it fits. */
export interface OverflowRegionAttributes {
  /** Attach to the scrolling element; it is what the measurement follows. */
  readonly ref: RefCallback<HTMLElement>;
  readonly tabIndex?: 0;
  readonly role?: 'region';
  readonly 'aria-label'?: string;
}

/**
 * The conditional region attributes for a scrolling box, alongside the ref that
 * names it. The ref must go on the scrolling box ITSELF — a `<pre>`, a JSON
 * pane, or the `div` `ScrollRegion` renders. Use the hook when wrapping the
 * content in a `ScrollRegion` would give the surface a second scroller.
 *
 * The box is measured as it is attached, whenever it or any child resizes, and
 * whenever its content changes — replaced, appended, or edited in place. A
 * replaced child is a NEW element, so the registration is re-pointed at the
 * current children before each measurement, adding and dropping only the ones
 * that actually changed; both sides of that are registrations on the shared
 * observers, not observers of this mount's own. The only DOM change a
 * measurement can cause is the region ATTRIBUTES this hook returns, and
 * attributes are deliberately left unobserved — that, not an absence of
 * mutation, is what stops the pair from re-triggering each other.
 *
 * @param ref - a consumer ref that wants the same element, or `undefined`.
 * @param label - its accessible name, applied only while it actually scrolls.
 */
export function useOverflowRegion(
  ref: Ref<HTMLElement> | undefined,
  label: string,
): OverflowRegionAttributes {
  const [scrollable, setScrollable] = useState(false);

  // Attached and released with the element, so a box that mounts later than the
  // hook, or is swapped for another, is instrumented exactly once either way.
  const measuredRef = useCallback(
    (box: HTMLElement): (() => void) => {
      const detachConsumer = attachRef(ref, box);

      const measure = (): void => {
        setScrollable(needsRegion(box));
      };

      // The box gives resize; its children give the overflowing width. The
      // shared observer is released target by target rather than disconnected,
      // because every other scrolling box on the page is registered on the same
      // one — and only the targets that actually came or went are touched, so an
      // edit in place re-registers nothing and costs one measurement.
      let observed: Element[] = [];
      const observeAll = (): void => {
        const current = [box, ...box.children];
        const kept = new Set<Element>(current);
        for (const target of observed) {
          if (!kept.has(target)) releaseResizeTarget(target, measure);
        }
        for (const target of current) holdResizeTarget(target, measure);
        observed = current;
        measure();
      };

      // The whole subtree, text included: content is as often EDITED IN PLACE —
      // a longer code string, a different JSON body — as it is replaced, and
      // React reuses the element when it does, so watching the direct child list
      // alone would freeze the measurement at whatever the first content needed.
      // ATTRIBUTES are deliberately absent: the region attributes are what a
      // measurement writes, and observing them would make each pass trigger the
      // next.
      holdContentTarget(box, observeAll);
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
        releaseContentTarget(box, observeAll);
        box.removeEventListener('blur', releaseHeldStop);
        detachConsumer();
      };
    },
    [ref],
  );

  if (!scrollable) return { ref: measuredRef };
  return { ref: measuredRef, tabIndex: 0, role: 'region', 'aria-label': label };
}

export function ScrollRegion({
  label,
  children,
  className,
  style,
  'data-testid': testId,
  ref,
}: ScrollRegionProps) {
  const region = useOverflowRegion(ref, label);

  return (
    <div
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
      // textContent is nullable under strict DOM typings; the local eslint
      // profile assumes non-null, so the necessary guard trips its rule.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const text = (node.textContent ?? '').trim();
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

/** A prose surface's scrolling box and the name it would take on its own. */
interface ProseSurfaceBox {
  readonly surface: HTMLElement;
  readonly name: string;
}

/**
 * The same surfaces, each given a name no other one in the list carries.
 *
 * A name is only as useful as it is distinguishing, and one heading names every
 * surface under it: two wide tables in one section, or two code blocks under no
 * heading at all, would otherwise be two landmarks a reader hears identically
 * and cannot choose between. A name more than one surface claims is therefore
 * numbered, in document order, and a name only one surface claims is left alone.
 */
function uniquelyNamed(boxes: readonly ProseSurfaceBox[]): TrackedSurface[] {
  const claims = new Map<string, number>();
  for (const { name } of boxes) claims.set(name, (claims.get(name) ?? 0) + 1);

  const taken = new Map<string, number>();
  return boxes.map(({ surface, name }) => {
    if (claims.get(name) === 1) return { surface, label: name };
    const ordinal = (taken.get(name) ?? 0) + 1;
    taken.set(name, ordinal);
    return { surface, label: `${name} (${String(ordinal)})` };
  });
}

/** Strips the region attributes from a surface that is not a region now. */
function clearScrollRegionAttributes(wrapper: HTMLElement): void {
  wrapper.removeAttribute('tabindex');
  wrapper.removeAttribute('role');
  wrapper.removeAttribute('aria-label');
}

/** Applies the same conditional attribute set `ScrollRegion` renders. */
function applyScrollRegionAttributes(
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
function refreshRegions(tracked: readonly TrackedSurface[]): void {
  const scrolling = tracked.map((entry) => needsRegion(entry.surface));
  for (const [index, entry] of tracked.entries()) {
    applyScrollRegionAttributes(entry.surface, entry.label, scrolling[index] === true);
  }
}

/**
 * Instruments the scrollable surfaces under the element the returned ref is
 * attached to — every `<table>` and every `<pre>` — as scroll regions. React
 * cannot wrap markup it did not create, so this walks the DOM instead. A table
 * is moved into a `div.tai-scroll-region` (once — the pass is idempotent)
 * because the table itself is not the scrolling box; a `<pre>` already IS its
 * own scrolling box, so it is instrumented in place. Either way the scrolling
 * element carries the same conditional `tabindex`/`role`/`aria-label` as
 * `ScrollRegion`.
 *
 * The name is the nearest heading preceding the surface — read for all of them
 * in one document-order pass — so a reader landing on the region hears which
 * section it belongs to; `labels` covers a surface with no heading above it, and
 * a name shared by several surfaces is numbered so no two regions answer to the
 * same one.
 *
 * The pass runs from the ref callback rather than an effect, which puts it in
 * the commit phase, BEFORE the browser paints: `.tai-prose table` is
 * `width: 100%` with no overflow of its own — the scroller exists only on the
 * wrapper this builds — so a pass that ran after paint would show one frame at
 * 320/360 px with the table overflowing the document, then jolt sideways. A
 * passive-effect probe measured exactly that: at first paint wrappers=0 and the
 * table's parent was `.tai-prose`.
 *
 * Injected HTML is replaced wholesale when its source changes, so the pass is
 * re-run from a `MutationObserver` on the subtree rather than on attachment
 * alone.
 *
 * @param labels - the names for surfaces with no preceding heading.
 * @returns the ref for the element whose subtree holds the injected markup.
 */
export function useProseScrollRegions(labels?: ProseScrollLabels): RefCallback<HTMLElement> {
  const tableLabel = labels?.table ?? DEFAULT_PROSE_LABELS.table;
  const preLabel = labels?.pre ?? DEFAULT_PROSE_LABELS.pre;

  return useCallback(
    (root: HTMLElement): (() => void) => {
      // Every observed element, mapped to the surface whose width it reports and
      // that surface's current name. This is what lets a resize re-measure just
      // the surfaces that moved: an observer callback carries the elements that
      // resized, and each of them answers here with the region it belongs to.
      const surfaceOf = new WeakMap<Element, TrackedSurface>();
      // What the observer holds and what wears region attributes right now. A
      // re-instrumentation replaces the surfaces wholesale, and the elements it
      // drops are detached ones: kept observed they would be registrations on
      // dead nodes, kept named they would be landmarks nobody can reach.
      let observed = new Set<Element>();
      let instrumented = new Set<HTMLElement>();

      // The box gives resize; its children give the overflowing width. A table
      // that grows wider inside a parent-constrained wrapper resizes nothing
      // else, so watching the wrapper alone would freeze the mount-time
      // measurement. Membership of `observed` doubles as the re-observation
      // guard: re-observing an element already under a ResizeObserver re-arms
      // its initial notification, which would make each pass trigger the next
      // one forever.
      const track = (entry: TrackedSurface, next: Set<Element>): void => {
        for (const target of [entry.surface, ...entry.surface.children]) {
          // Rewritten even when already observed: a re-run may have found a new
          // heading above the surface, and the name has to follow it.
          surfaceOf.set(target, entry);
          next.add(target);
          if (!observed.has(target)) resizeObserver.observe(target);
        }
      };

      // A pass over the whole subtree. It reads the observers declared below it,
      // which is safe because nothing calls it until both exist.
      const instrument = (): void => {
        // Wrapping mutates the subtree; pause the observer so this pass cannot
        // re-trigger itself, and drop the records it generated before resuming.
        mutationObserver.disconnect();
        // Every name comes from one document-order read of the prose, taken
        // before the first wrapper goes in. The list is a static snapshot and
        // the surfaces in it stay the same elements: wrapping moves a table one
        // level down, into a `div` standing exactly where the table stood, so
        // neither the remaining entries nor the names already computed for them
        // change. Every table is wrapped, cap or no cap — the wrapper is what
        // keeps a `width: 100%` table inside the column.
        const boxes = labelledProseSurfaces(root).map(({ element, heading }) => {
          const table = element instanceof HTMLTableElement;
          return {
            surface: table ? ensureScrollWrapper(element) : element,
            name: heading ?? (table ? tableLabel : preLabel),
          };
        });
        const tracked = uniquelyNamed(boxes.slice(0, MAX_PROSE_REGIONS));

        const next = new Set<Element>();
        for (const entry of tracked) track(entry, next);
        for (const target of observed) {
          if (!next.has(target)) resizeObserver.unobserve(target);
        }
        observed = next;

        const dropped = instrumented;
        instrumented = new Set(tracked.map((entry) => entry.surface));
        // Wrapping is done for every surface before the first measurement, so
        // the whole pass costs one layout rather than one per surface.
        refreshRegions(tracked);
        for (const surface of dropped) {
          if (!instrumented.has(surface) && root.contains(surface)) {
            clearScrollRegionAttributes(surface);
          }
        }
        mutationObserver.takeRecords();
        mutationObserver.observe(root, { childList: true, subtree: true });
      };

      // Only the surfaces that actually resized are re-measured. Re-running the
      // whole instrumentation pass from here re-queried the entire prose subtree
      // on every resize frame, and a document with many surfaces spends that
      // cost once per frame for the whole time a pane is being dragged.
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

      // A stop held open only because the region had focus outlives its reason
      // the moment the reader leaves. `focusout` bubbles, so one listener on the
      // root covers every instrumented surface under it, however often they are
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
    },
    [tableLabel, preLabel],
  );
}
