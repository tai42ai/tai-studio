/**
 * FOCUS MANAGEMENT (WCAG 2.4.3) for the monitor: the two list→detail drills, and
 * the controls that remove themselves when used.
 *
 * Selecting a row can hide the pane that held the just-activated link (the route
 * picker is replaced outright; the thread list collapses below 1024), so focus
 * must be moved deliberately or it drops to `<body>`. The previous selection is
 * seeded on MOUNT, so an initial deep link never steals focus — focus follows a
 * CLIENT-SIDE change only.
 *
 * Both detail panes render their heading in every state (loading included), so
 * the heading is always mounted by the time this effect runs and no deferred
 * "focus it when it appears" step is needed.
 *
 * The origin row is matched by comparing accessible NAMES rather than by an
 * attribute selector: a thread id carries arbitrary characters (quotes, brackets)
 * that would break a selector string built from it.
 *
 * That row is not guaranteed to be there on the way back — the route may have
 * been deleted while the detail pane was open, or the listing query may have been
 * collected during a long read and re-mounted into its loading skeleton. Focus
 * then lands on the LIST ITSELF (its container is `tabIndex={-1}` for exactly
 * this), never on `<body>`: 2.4.3 asks for a deliberate next place, and the list
 * the reader came back to is that place.
 */
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';

export interface SelectionFocus {
  /**
   * Ref for the wrapper holding the list rows: the return-focus search root, and
   * the fallback target when the origin row is gone. Its element must accept
   * focus (`tabIndex={-1}`).
   */
  readonly listRef: RefObject<HTMLDivElement | null>;
  /** Ref for the detail pane's heading — where focus lands on a selection. */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

/**
 * @param selected the current selection, or `undefined` for none.
 * @param originLabel the `aria-label` the list row for a given selection carries.
 *   Must be a stable reference (a module-level function): the effect depends on it.
 */
export function useSelectionFocus(
  selected: string | undefined,
  originLabel: (value: string) => string,
): SelectionFocus {
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevSelected = useRef<string | undefined>(selected);

  useEffect(() => {
    if (selected === prevSelected.current) return;
    const previous = prevSelected.current;
    prevSelected.current = selected;
    if (selected !== undefined) {
      headingRef.current?.focus();
      return;
    }
    if (previous === undefined) return;
    // Cleared (Back): return focus to the list row the selection came from.
    const wanted = originLabel(previous);
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[aria-label]') ?? [];
    for (const row of rows) {
      if (row.getAttribute('aria-label') === wanted) {
        row.focus();
        return;
      }
    }
    // The row is not there any more: the list is the deliberate fallback.
    listRef.current?.focus();
  }, [selected, originLabel]);

  return { listRef, headingRef };
}

/** The two ends of a self-removing control's focus handoff. */
export interface FocusHandoff {
  /** Call from the control's own handler, before its result lands. */
  readonly hold: () => void;
  /** Call once that result is on screen: focus is placed, or deliberately left. */
  readonly settle: () => void;
}

/**
 * Focus for a control that DOES NOT SURVIVE being used — the two paging buttons
 * (gone once their last page is in) and the two that resume a paused read (gone
 * with the notice that carried them).
 *
 * Every one of them takes focus to activate it and then removes it: a `disabled`
 * button is blurred by the browser the instant it is disabled, and an unmounted
 * one takes its focus with it. Either way the reader is left on `<body>` with
 * hundreds of new rows and a moved scroll position — the 2.4.3 drop this module
 * exists to prevent, in a second shape.
 *
 * `settle` puts focus back on the control when it is still there, and on
 * `fallback` — the pane's own heading — when it is not, so the reader lands at the
 * top of the pane whose content just changed. A reader who moved focus somewhere
 * else while the read was in flight keeps it: only focus sitting on `<body>`, which
 * the removal is what put there, is taken back.
 *
 * @param control the control itself, or a ref that is empty once it is gone.
 * @param fallback where focus goes when the control did not survive.
 */
export function useFocusHandoff(
  control: RefObject<HTMLElement | null>,
  fallback: RefObject<HTMLElement | null>,
): FocusHandoff {
  const armed = useRef(false);

  const hold = useCallback(() => {
    armed.current = true;
  }, []);

  const settle = useCallback(() => {
    if (!armed.current) return;
    armed.current = false;
    const active = document.activeElement;
    // Anywhere but `<body>` is a place the reader chose; it is not ours to move.
    if (active !== null && active !== document.body) return;
    (control.current ?? fallback.current)?.focus();
  }, [control, fallback]);

  // Stable, so an effect may depend on the handoff without re-running per render.
  return useMemo(() => ({ hold, settle }), [hold, settle]);
}
