/**
 * The shared live-tailing pager behind the transcript and the thread list: it
 * de-duplicates the retained pages (optionally reversing them to reading order),
 * decides whether the tail is paused past its refresh window, announces a settled
 * page load and each pause/resume transition, and surfaces the stale-read notice.
 * The differing copy (noun, the loaded/resumed sentences, the paused notice) is
 * injected so one hook backs both panes.
 */
import { useEffect, useRef } from 'react';

import { dedupeBy, withinRefreshWindow } from './paging';
import { staleReadMessage } from './read-states';
import type { FocusHandoff } from './focus';
import type { LiveRegion } from './live-region';
import { useStandingNotice } from './live-region';

/** The infinite-query surface the pager reads, narrowed to what it uses. */
interface TailQuery<Item> {
  readonly data:
    | { readonly pages: readonly { readonly items: Item[]; readonly truncated: boolean }[] }
    | undefined;
  readonly hasNextPage: boolean;
  readonly isFetchNextPageError: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isRefetchError: boolean;
  readonly error: unknown;
  readonly fetchNextPage: () => Promise<unknown>;
}

/** The differing announcements between the two panes. */
export interface TailMessages {
  /** Spoken after a settled page load; `hasMore` is whether an older/more page remains. */
  readonly loaded: (hasMore: boolean, count: number) => string;
  /** Spoken (and shown) when the pane pauses past its refresh window. */
  readonly paused: string;
  /** Spoken when the pane returns to its newest page. */
  readonly resumed: (count: number) => string;
}

export interface TailingPager<Item> {
  readonly items: Item[];
  readonly paused: boolean;
  readonly truncated: boolean;
  readonly count: number;
  readonly hasMore: boolean;
  readonly pageFailed: boolean;
  readonly loadingMore: boolean;
  /** Fetch the next (older/more) page, arming the focus handoff + settled announcement. */
  readonly onLoadMore: () => void;
}

export function useTailingPager<Item>({
  query,
  maxPages,
  idOf,
  reverse,
  live,
  loadFocus,
  resumeFocus,
  messages,
}: {
  readonly query: TailQuery<Item>;
  readonly maxPages: number;
  readonly idOf: (item: Item) => string;
  readonly reverse: boolean;
  readonly live: LiveRegion;
  readonly loadFocus: FocusHandoff;
  readonly resumeFocus: FocusHandoff;
  readonly messages: TailMessages;
}): TailingPager<Item> {
  const { announce } = live;
  const deduped = dedupeBy(query.data?.pages.flatMap((page) => page.items) ?? [], idOf);
  // A transcript reads newest-first and reverses to reading order; the thread list
  // keeps the newest-first order the door returns.
  const items = reverse ? deduped.reverse() : deduped;
  const paused = !withinRefreshWindow(query.data?.pages.length, maxPages);
  // Any capped page means the read is partial — surfaced, never a silent cut.
  const truncated = query.data?.pages.some((page) => page.truncated) ?? false;
  const count = items.length;
  const hasMore = query.hasNextPage;
  const pageFailed = query.isFetchNextPageError;
  const loadingMore = query.isFetchingNextPage;

  /** Set by the paging click, cleared once that page's outcome is on screen. */
  const pendingPage = useRef(false);
  // Deliberately UNKEYED: a page already in the cache settles without the pane ever
  // rendering an in-flight state, so there is no value whose change marks the
  // outcome. The flag the click set is what makes this act.
  useEffect(() => {
    if (!pendingPage.current || loadingMore) return;
    pendingPage.current = false;
    // A failed page speaks for itself in its own alert; a second account is one too many.
    if (!pageFailed) announce(messages.loaded(hasMore, count));
    loadFocus.settle();
  });

  const wasPaused = useRef(paused);
  useEffect(() => {
    if (paused === wasPaused.current) return;
    wasPaused.current = paused;
    if (paused) {
      announce(messages.paused);
      return;
    }
    announce(messages.resumed(count));
    resumeFocus.settle();
  }, [paused, count, announce, resumeFocus, messages]);

  // Said only in the state the pane actually shows it in: paused wins over stale.
  const staleMessage = !paused && query.isRefetchError ? staleReadMessage(query.error) : undefined;
  useStandingNotice(live, staleMessage);

  const onLoadMore = (): void => {
    pendingPage.current = true;
    loadFocus.hold();
    void query.fetchNextPage();
  };

  return { items, paused, truncated, count, hasMore, pageFailed, loadingMore, onLoadMore };
}
