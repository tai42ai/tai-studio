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
import {
  needsRegion,
  refreshRegions,
  clearScrollRegionAttributes,
  SCROLL_REGION_CLASS,
  type TrackedSurface,
} from './overflow-measure';
import {
  holdResizeTarget,
  releaseResizeTarget,
  holdContentTarget,
  releaseContentTarget,
} from './observer-registry';
import {
  DEFAULT_PROSE_LABELS,
  MAX_PROSE_REGIONS,
  labelledProseSurfaces,
  ensureScrollWrapper,
  uniquelyNamed,
} from './prose-regions';

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

/** The fallback name per instrumented surface, when no heading precedes it. */
export interface ProseScrollLabels {
  readonly table?: string;
  readonly pre?: string;
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
