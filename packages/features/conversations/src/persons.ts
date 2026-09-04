/**
 * A LINKED person's aggregated conversation thread is addressed by a reserved
 * thread id — the server's `PERSON_THREAD_PREFIX` followed by the person's uuid.
 * That id is the only place a person surfaces in this monitor (a thread row / an
 * open transcript), so the GDPR person-erase action reads the person id back out of
 * it here rather than inventing a separate persons listing.
 */

/** The reserved namespace the server gives a person's aggregated thread. */
export const PERSON_THREAD_PREFIX = 'bridge:@person:';

/**
 * The person id a thread id names, or `null` when the thread is an ordinary
 * per-address thread (not a linked person's aggregated one). A prefix with an empty
 * remainder is treated as not-a-person: there is no person to erase.
 */
export function personIdOfThread(threadId: string): string | null {
  if (!threadId.startsWith(PERSON_THREAD_PREFIX)) return null;
  const personId = threadId.slice(PERSON_THREAD_PREFIX.length);
  return personId === '' ? null : personId;
}
