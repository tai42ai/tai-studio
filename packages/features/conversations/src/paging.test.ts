/**
 * The two rules a paged, self-refreshing pane obeys: a flatten drops every later
 * repeat of an id, an automatic refresh runs only while the retained window is
 * within its cap, and the trim that restarts a paused pane keeps the newest page
 * alone — a no-op when the query holds nothing yet.
 */
import { describe, expect, it } from 'vitest';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { boundedRefresh, dedupeBy, trimToNewestPage, withinRefreshWindow } from './paging';

describe('dedupeBy', () => {
  it('keeps the first copy of each id, in order', () => {
    const items = [
      { id: 'a', page: 1 },
      { id: 'b', page: 1 },
      { id: 'a', page: 2 },
    ];
    expect(dedupeBy(items, (item) => item.id)).toEqual([
      { id: 'a', page: 1 },
      { id: 'b', page: 1 },
    ]);
  });
});

describe('withinRefreshWindow', () => {
  it('treats an unread window as a single page', () => {
    expect(withinRefreshWindow(undefined, 3)).toBe(true);
  });

  it('is false only once the window passes the cap', () => {
    expect(withinRefreshWindow(3, 3)).toBe(true);
    expect(withinRefreshWindow(4, 3)).toBe(false);
  });
});

describe('boundedRefresh', () => {
  const refresh = boundedRefresh(2, 5_000);
  const query = (pages: number) => ({ state: { data: { pages: new Array(pages) } } });

  it('runs every automatic read while the window is within the cap', () => {
    expect(refresh.refetchInterval(query(2))).toBe(5_000);
    expect(refresh.refetchOnWindowFocus(query(2))).toBe(true);
    expect(refresh.refetchOnReconnect(query(2))).toBe(true);
    expect(refresh.refetchOnMount(query(2))).toBe(true);
  });

  it('stops every automatic read once the window passes the cap', () => {
    expect(refresh.refetchInterval(query(3))).toBe(false);
    expect(refresh.refetchOnWindowFocus(query(3))).toBe(false);
    expect(refresh.refetchOnReconnect(query(3))).toBe(false);
    expect(refresh.refetchOnMount(query(3))).toBe(false);
  });
});

describe('trimToNewestPage', () => {
  const key = ['conversation-threads'] as const;

  it('drops every retained page but the newest', () => {
    const client = new QueryClient();
    const data: InfiniteData<string> = {
      pages: ['newest', 'older', 'oldest'],
      pageParams: [1, 2, 3],
    };
    client.setQueryData(key, data);

    trimToNewestPage(client, key);

    expect(client.getQueryData<InfiniteData<string>>(key)).toEqual({
      pages: ['newest'],
      pageParams: [1],
    });
  });

  it('leaves a query that holds nothing untouched', () => {
    const client = new QueryClient();

    trimToNewestPage(client, key);

    expect(client.getQueryData(key)).toBeUndefined();
  });
});
