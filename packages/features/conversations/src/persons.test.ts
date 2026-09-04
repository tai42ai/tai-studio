/**
 * The person-id reader: a linked person surfaces only through the reserved thread id
 * its aggregated conversation carries, so the GDPR erase action reads the id back out
 * of that thread id.
 */
import { describe, expect, it } from 'vitest';

import { PERSON_THREAD_PREFIX, personIdOfThread } from './persons';

describe('personIdOfThread', () => {
  it('reads the person id out of an aggregated person thread', () => {
    expect(personIdOfThread(`${PERSON_THREAD_PREFIX}p-123`)).toBe('p-123');
  });

  it('returns null for an ordinary per-address thread', () => {
    expect(personIdOfThread('svc-chat/+15551234567')).toBeNull();
  });

  it('returns null for a route-keyed bridge thread that is not a person thread', () => {
    expect(personIdOfThread('bridge:chat:user%40example.com/u1')).toBeNull();
  });

  it('treats a prefix with an empty remainder as not-a-person', () => {
    // There is no person id to erase, so the action must never offer to erase one.
    expect(personIdOfThread(PERSON_THREAD_PREFIX)).toBeNull();
  });

  it('keeps a uuid person id verbatim', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(personIdOfThread(`${PERSON_THREAD_PREFIX}${id}`)).toBe(id);
  });
});
