/**
 * Detail-heading focus management for the templates master/detail (WCAG 2.4.3).
 * Single-pane, selecting a row hides the list pane that held the just-activated
 * link, so focus is moved to the detail heading deliberately (and returned to the
 * list row on Back) rather than dropping to `<body>`.
 */
import { useCallback, useEffect, useRef } from 'react';

export function useTemplateDetailFocus(selected: string | undefined) {
  // Seed the previous selection on MOUNT so an initial `?template=` deep-link never
  // steals focus (focus follows a client-side change only).
  const listRef = useRef<HTMLDivElement>(null);
  const prevSelected = useRef<string | undefined>(selected);
  const headingNode = useRef<HTMLHeadingElement | null>(null);
  // True while a client-side selection waits for its detail heading to mount.
  const pendingFocus = useRef(false);

  // Callback ref threaded onto the detail's <h2>. When the heading mounts after a
  // client-side selection it pulls focus; on a deep-link mount `pendingFocus` is false,
  // so focus is never stolen. Cleared to null on unmount (Back), so it never goes stale.
  const setDetailHeading = useCallback((node: HTMLHeadingElement | null) => {
    headingNode.current = node;
    if (node !== null && pendingFocus.current) {
      pendingFocus.current = false;
      node.focus();
    }
  }, []);

  useEffect(() => {
    if (selected === prevSelected.current) return;
    const previous = prevSelected.current;
    prevSelected.current = selected;
    if (selected !== undefined) {
      // Moved INTO a selection → focus the detail heading. It is either already mounted
      // (focus it now) or still loading (focus it when its callback ref fires).
      if (headingNode.current !== null) {
        headingNode.current.focus();
      } else {
        pendingFocus.current = true;
      }
    } else if (previous !== undefined) {
      // Cleared (Back) → return focus to the list row it came from, matched inside the
      // list pane by the link's own accessible name.
      pendingFocus.current = false;
      listRef.current
        ?.querySelector<HTMLElement>(`[aria-label="Open template ${previous}"]`)
        ?.focus();
    }
  }, [selected]);

  return { listRef, setDetailHeading };
}
