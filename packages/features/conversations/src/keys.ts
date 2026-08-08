/**
 * TanStack Query keys for the conversation monitor. Each key embeds the window it
 * queries with EXCEPT the page number: both paged reads are infinite queries, so
 * their accumulated pages live under one key and only a route/thread/page-size
 * change is a new cache entry.
 */

/** Key for the stored routing rows (the route picker). */
export const conversationRoutesKey = ['conversations', 'routes'] as const;

/** Key for one route's thread listing. */
export function conversationThreadsKey(
  routeName: string,
  pageSize: number,
): readonly ['conversations', 'threads', string, number] {
  return ['conversations', 'threads', routeName, pageSize];
}

/** Key for one thread's transcript. */
export function conversationTranscriptKey(
  routeName: string,
  threadId: string,
  pageSize: number,
): readonly ['conversations', 'transcript', string, string, number] {
  return ['conversations', 'transcript', routeName, threadId, pageSize];
}
