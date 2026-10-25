/**
 * TanStack Query key factory for the interactions feature's server state: the
 * paged pending inbox (`GET /api/interactions`, the tail-only stream's base) and
 * the installed channel-plugin catalog.
 */

/** Key for one page window of the pending inbox. The page number is NOT part of
 * the key: it is an infinite query, so its accumulated pages live under one key
 * and only a page-size change is a new cache entry. */
export function inboxKey(pageSize: number): readonly ['interactions', 'inbox', number] {
  return ['interactions', 'inbox', pageSize];
}

/** The installed channel-plugin list, shared with the route form. */
export { channelsListKey } from '@tai42/studio-sdk';
