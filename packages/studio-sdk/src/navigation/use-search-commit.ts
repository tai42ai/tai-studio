import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { useAppNavigate } from './context';
import type { RouteSearch, RouteToken } from './types';

/**
 * The inputs a page hands {@link useSearchCommit}: the route token the commit
 * targets, the container whose delegated Enter/blur commits, the search input's
 * accessible name (the delegation keys the input on it), the committed value now in
 * the URL, the live draft, the page's composer of the full search object from the
 * next query (`undefined` when the box is empty), and the loud message thrown if the
 * container ref never attaches.
 */
export interface SearchCommitParams<T extends RouteToken> {
  readonly token: T;
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly searchLabel: string;
  readonly committedValue: string;
  readonly draft: string;
  readonly buildSearch: (query: string | undefined) => RouteSearch<T>;
  readonly containerMissingError: string;
}

/**
 * The shared commit behavior for a filter box that writes its text into a route-token
 * search param. The SDK search input is controlled (value/onChange only), so the URL
 * commit is delegated on the CONTAINER: Enter or an edited blur of the search box
 * writes the URL. The listeners bind once — the latest draft and committed value are
 * read from a ref, never re-bound per keystroke.
 *
 * A commit REPLACES the current history entry rather than pushing: a filter change
 * refines the current view, not a place Back should step back through one
 * keystroke-commit at a time. A cleared box commits `undefined` so the URL and box
 * cannot drift. A redundant commit (the draft already the committed value, trimmed
 * both sides, so a padded deep-link never self-commits without a real edit) writes
 * nothing.
 */
export function useSearchCommit<T extends RouteToken>({
  token,
  containerRef,
  searchLabel,
  committedValue,
  draft,
  buildSearch,
  containerMissingError,
}: SearchCommitParams<T>): void {
  const navigate = useAppNavigate();

  // The latest draft + committed value, so the delegated listeners bind once instead
  // of per keystroke.
  const commitState = useRef({ draft, committedValue });
  commitState.current = { draft, committedValue };

  const commit = useCallback(
    (value: string): void => {
      // A redundant commit (the draft already the committed value) must not push a
      // history entry.
      if (value.trim() === commitState.current.committedValue.trim()) return;
      const next = value.trim();
      navigate(token, buildSearch(next === '' ? undefined : next), { replace: true });
    },
    [navigate, token, buildSearch],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) throw new Error(containerMissingError);
    const isSearchInput = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement && target.getAttribute('aria-label') === searchLabel;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || !isSearchInput(event.target)) return;
      commit(commitState.current.draft);
    };
    const onFocusOut = (event: FocusEvent): void => {
      if (isSearchInput(event.target)) commit(commitState.current.draft);
    };
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, [commit, containerRef, containerMissingError, searchLabel]);
}
