/**
 * The SPA route-change focus convention: a FORWARD navigation (a PUSH that changes
 * the pathname) moves focus to the new page's `<h1>`; the landing route's replace,
 * Back/Forward, and same-pathname search-only PUSHes do not. On a forward navigation
 * it also closes the mobile drawer (via `onForwardNav`) so a drawer nav-click lands on
 * the heading, not the hamburger.
 */
import { useEffect, useRef } from 'react';
import { useRouter, useRouterState } from '@tanstack/react-router';

export function useRouteChangeFocus(onForwardNav: () => void): void {
  // Only a PUSH that CHANGES the pathname arms the focus move. A same-pathname
  // search-only PUSH (a feature screen setting its own `?tool=`/`?tags=`) must NOT
  // arm it — the pathname-keyed consumer below never runs for a same-path change,
  // so a flag set here would STRAND until the next real pathname change wrongly
  // consumed it. The last-focused pathname is tracked in a ref, compared and updated
  // in this same callback.
  //
  // As a second guard, EVERY non-PUSH action explicitly DISARMS any pending flag AND
  // resyncs the ref to the landed pathname. That covers BACK/FORWARD/REPLACE and,
  // critically, GO — the browser history's multi-step traversal, which `notify()`
  // fires with `location` already set to the destination. History traversal and
  // replace-navigation never move focus, and never leave a flag or a stale ref behind.
  const router = useRouter();
  const pendingFocus = useRef(false);
  const lastFocusPathname = useRef(router.history.location.pathname);
  useEffect(() => {
    return router.history.subscribe(({ action, location }) => {
      if (action.type !== 'PUSH') {
        pendingFocus.current = false;
        lastFocusPathname.current = location.pathname;
        return;
      }
      const changedPathname = location.pathname !== lastFocusPathname.current;
      lastFocusPathname.current = location.pathname;
      // A same-pathname PUSH leaves focus to the feature screen; only a cross-pathname
      // PUSH moves it to the destination heading.
      if (changedPathname) pendingFocus.current = true;
      onForwardNav();
    });
  }, [router, onForwardNav]);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    // The focus move runs on the next frame, after the route has committed and after
    // a closing drawer has returned focus to its opener, so a drawer nav-click lands
    // on the heading, not the hamburger.
    const frame = requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      const heading = main?.querySelector('h1') ?? null;
      const target = heading ?? main;
      if (target === null) return;
      if (heading !== null && !heading.hasAttribute('tabindex')) {
        heading.setAttribute('tabindex', '-1');
      }
      target.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pathname]);
}
