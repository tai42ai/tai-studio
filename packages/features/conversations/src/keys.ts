/**
 * TanStack Query keys for the conversation monitor. Each key embeds the window it
 * queries with EXCEPT the page number: both paged reads are infinite queries, so
 * their accumulated pages live under one key and only a route/thread/page-size
 * change is a new cache entry.
 */

/** Key for the stored routing rows (the route picker). */
export const conversationRoutesKey = ['conversations', 'routes'] as const;

/** Key for one route's thread listing. The status/address filters are part of the
 * key: a different filter is a different listing, never this one re-paged. */
export function conversationThreadsKey(
  routeName: string,
  pageSize: number,
  status: string | undefined,
  address: string | undefined,
): readonly ['conversations', 'threads', string, number, string | null, string | null] {
  return ['conversations', 'threads', routeName, pageSize, status ?? null, address ?? null];
}

/** Key for one web route's entry-gate state (flag + live codes), keyed by the
 * route's `our_identity`. */
export function webEntryGateKey(
  identity: string,
): readonly ['conversations', 'entry-gate', string] {
  return ['conversations', 'entry-gate', identity];
}

/** Prefix over EVERY read of one thread's transcript (any page size, any `q`
 * filter). A write into the thread invalidates them all through this prefix. */
export function conversationTranscriptPrefix(
  routeName: string,
  threadId: string,
): readonly ['conversations', 'transcript', string, string] {
  return ['conversations', 'transcript', routeName, threadId];
}

/** Key for one thread's transcript. The `q` text filter is part of the key: a
 * filtered read is a different transcript window, never this one re-tailed. */
export function conversationTranscriptKey(
  routeName: string,
  threadId: string,
  pageSize: number,
  q: string | undefined,
): readonly ['conversations', 'transcript', string, string, number, string | null] {
  return ['conversations', 'transcript', routeName, threadId, pageSize, q ?? null];
}

/** Key for one route's message search (`?q=`, across threads). */
export function conversationMessageSearchKey(
  routeName: string,
  pageSize: number,
  q: string,
): readonly ['conversations', 'message-search', string, number, string] {
  return ['conversations', 'message-search', routeName, pageSize, q];
}

/** Key for one thread's reply mode (agent vs. manual). */
export function conversationThreadModeKey(
  routeName: string,
  threadId: string,
): readonly ['conversations', 'thread-mode', string, string] {
  return ['conversations', 'thread-mode', routeName, threadId];
}
