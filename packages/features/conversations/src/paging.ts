/**
 * The two rules a PAGED, self-refreshing pane obeys — the thread list and the
 * transcript share both.
 *
 * DE-DUPLICATION on flatten. A refresh of an infinite query re-reads its retained
 * pages one after another, not in one shot, so a record restamped between two of
 * those reads comes back in BOTH of them. Flattening that straight into keyed
 * React children would render one id twice; {@link dedupeBy} keeps the copy from
 * the page read first, which is the newest page and so the freshest reading.
 *
 * A REFRESH BOUND that never costs the newest page. TanStack's `maxPages` evicts
 * from the end away from the paging direction, and both panes page away from page
 * 1 — the very page a refresh exists to re-read, and the one a live tail lives on.
 * So the retained window is left uncapped and the REFRESH is bounded instead
 * ({@link boundedRefresh}): it runs only while the window is within `maxPages`,
 * and past that the pane stops refreshing — visibly, with
 * {@link trimToNewestPage} behind a control that puts it back — rather than
 * silently dropping its newest page.
 */
import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

/** The items in order, with every later repeat of an id dropped. */
export function dedupeBy<T>(items: readonly T[], identity: (item: T) => string): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of items) {
    const id = identity(item);
    if (!seen.has(id)) {
      seen.add(id);
      kept.push(item);
    }
  }
  return kept;
}

/** True while a window of `pages` pages is one a refresh may re-read whole. */
export function withinRefreshWindow(pages: number | undefined, maxPages: number): boolean {
  return (pages ?? 1) <= maxPages;
}

/** The query object the refetch predicates are handed, narrowed to what they read. */
interface PagedQuery {
  readonly state: { readonly data?: { readonly pages: readonly unknown[] } | undefined };
}

/** The refetch options {@link boundedRefresh} builds. */
export interface BoundedRefresh {
  readonly refetchInterval: (query: PagedQuery) => number | false;
  readonly refetchOnWindowFocus: (query: PagedQuery) => boolean;
  readonly refetchOnReconnect: (query: PagedQuery) => boolean;
  readonly refetchOnMount: (query: PagedQuery) => boolean;
}

/**
 * Every AUTOMATIC read of a paged pane — the interval, and the ones a window
 * focus, a reconnect or a remount fires — gated on the retained window still
 * being within `maxPages`, so no automatic refresh can cost more requests than
 * that however deep the reader has paged.
 */
export function boundedRefresh(maxPages: number, intervalMs: number): BoundedRefresh {
  const within = (query: PagedQuery): boolean =>
    withinRefreshWindow(query.state.data?.pages.length, maxPages);
  return {
    refetchInterval: (query) => (within(query) ? intervalMs : false),
    refetchOnWindowFocus: within,
    refetchOnReconnect: within,
    refetchOnMount: within,
  };
}

/**
 * Drop every retained page but the newest, putting a paused pane back inside its
 * refresh window — the one move that restarts a pane's own refreshing.
 */
export function trimToNewestPage(client: QueryClient, key: QueryKey): void {
  client.setQueryData<InfiniteData<unknown>>(key, (data) =>
    data === undefined
      ? data
      : { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
  );
}
