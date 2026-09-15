import type { ApiClient, SseFrame } from '@tai42/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  add,
  addData,
  answered,
  flush,
  iterate,
  removed,
  renderStream,
  scriptedClient,
  seedItem,
} from './test-interactions-stream';

beforeEach(() => {
  vi.useFakeTimers();
  // Pin the reconnect jitter to its midpoint so every backoff delay is EXACT and
  // each test advances by a known amount rather than padding past a random range.
  // The full-jitter delay is `Math.random() * ceiling`, so random=0.5 makes the
  // delay a deterministic `0.5 * ceiling` (e.g. 750 for the 1500ms base).
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('interactions-stream — frame parsing, overlay and count', () => {
  it('publishes the paged base seed, each item pending', async () => {
    const { result } = renderStream(scriptedClient([]), { seed: [seedItem('a')] });
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    expect(result.current.interactions[0]?.answered).toBe(false);
  });

  it('overlays a live interaction.add on top of the seed', async () => {
    const { result } = renderStream(scriptedClient([add('b')]), { seed: [seedItem('a')] });
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id).sort()).toEqual(['a', 'b']);
  });

  it('flips answered:true on interaction.answered for a seeded item', async () => {
    const { result } = renderStream(scriptedClient([answered('a')]), { seed: [seedItem('a')] });
    await flush();
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.answered).toBe(true);
  });

  it('drops a seeded item on interaction.removed', async () => {
    const { result } = renderStream(scriptedClient([removed('a')]), {
      seed: [seedItem('a'), seedItem('b')],
    });
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['b']);
  });

  it('de-duplicates a seeded id also delivered as a live add', async () => {
    const { result } = renderStream(scriptedClient([add('a')]), { seed: [seedItem('a')] });
    await flush();
    expect(result.current.interactions).toHaveLength(1);
  });

  it('bumps the derived count on a live add WITHOUT a refetch', async () => {
    // A live add for an id absent from the seed raises the pending count from the
    // door total (1) to 2, driven by the overlay alone — onResync fires only for the
    // connect, never for the delta.
    const { result, onResync } = renderStream(scriptedClient([add('b')]), {
      seed: [seedItem('a')],
      total: 1,
    });
    await flush();
    expect(result.current.count).toBe(2);
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('drops the derived count when a seeded item is answered or removed', async () => {
    // An answered seeded id and a removed seeded id each leave the pending set, so
    // the count falls from the door total (2) to 0 without a refetch.
    const { result } = renderStream(scriptedClient([answered('a'), removed('b')]), {
      seed: [seedItem('a'), seedItem('b')],
      total: 2,
    });
    await flush();
    expect(result.current.count).toBe(0);
  });

  it('drops the count for a terminal id outside the loaded seed page', async () => {
    // total=60 but only page 1 (50 items) is seeded; #55 lives on an unloaded page.
    // Every terminal frame refers to a question within the caller's own total, so an
    // answer for the unseen id drops the badge from 60 to 59 without a refetch.
    const seed = Array.from({ length: 50 }, (_, i) => seedItem(`s${String(i)}`));
    const { result } = renderStream(scriptedClient([answered('u55')]), { seed, total: 60 });
    await flush();
    expect(result.current.count).toBe(59);
  });

  it('counts a repeated answered for the same unseen id once', async () => {
    const seed = Array.from({ length: 50 }, (_, i) => seedItem(`s${String(i)}`));
    const { result } = renderStream(scriptedClient([answered('u55'), answered('u55')]), {
      seed,
      total: 60,
    });
    await flush();
    expect(result.current.count).toBe(59);
  });

  it('counts an answered-then-removed unseen id once', async () => {
    const seed = Array.from({ length: 50 }, (_, i) => seedItem(`s${String(i)}`));
    const { result } = renderStream(scriptedClient([answered('u55'), removed('u55')]), {
      seed,
      total: 60,
    });
    await flush();
    expect(result.current.count).toBe(59);
  });

  it('never goes negative for honest server data (terminals bounded by total)', async () => {
    // Honest data: every terminal id is within total. Answering all 60 (the 50 seeded
    // plus 10 on unloaded pages) drives the count to exactly 0, never below.
    const seed = Array.from({ length: 50 }, (_, i) => seedItem(`s${String(i)}`));
    const frames = [
      ...seed.map((item) => answered(item.interaction_id)),
      ...Array.from({ length: 10 }, (_, i) => answered(`u${String(i)}`)),
    ];
    const { result } = renderStream(scriptedClient(frames), { seed, total: 60 });
    await flush();
    expect(result.current.count).toBe(0);
    expect(result.current.count).toBeGreaterThanOrEqual(0);
  });

  it('surfaces a malformed frame as an error instead of dropping it silently', async () => {
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: 'not json' }]),
      {},
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('preserves the answered flag when the same add is redelivered', async () => {
    const { result } = renderStream(scriptedClient([add('a'), answered('a'), add('a')]), {});
    await flush();
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.answered).toBe(true);
  });

  it('ages an answered card out after the retention window', async () => {
    // The server sends no removal for an answered card, so the client ages it out.
    // a is answered at t0; b arrives only AFTER the 10-minute retention window, and
    // its frame is the lazy tick on which the now-aged a is swept away (tombstoned).
    async function* laterTick(): AsyncGenerator<SseFrame> {
      yield add('a');
      yield answered('a');
      // Suspend the OPEN connection past the retention window (no reconnect timer
      // is pending while the generator is mid-await), then emit the sweeping tick.
      await new Promise<void>((resolve) => setTimeout(resolve, 10 * 60 * 1000 + 1000));
      yield add('b');
    }
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockResolvedValueOnce(laterTick());
    stream.mockImplementation(() => Promise.resolve(iterate([])));
    const client = { streamInteractions: stream } as unknown as ApiClient;
    const { result } = renderStream(client, {});

    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    expect(result.current.interactions[0]?.answered).toBe(true);

    await flush(10 * 60 * 1000 + 1000);
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['b']);
    expect(result.current.interactions[0]?.answered).toBe(false);
  });

  it('tombstones an aged answered id so a still-stale seed cannot resurrect it', async () => {
    // a is seeded (pending) AND answered on the tail; after the retention window a
    // sweeping tick tombstones it. A seed that still lists a (stale, pre-refetch)
    // must NOT bring the retired card back.
    async function* laterTick(): AsyncGenerator<SseFrame> {
      yield answered('a');
      await new Promise<void>((resolve) => setTimeout(resolve, 10 * 60 * 1000 + 1000));
      yield add('b');
    }
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockResolvedValueOnce(laterTick());
    stream.mockImplementation(() => Promise.resolve(iterate([])));
    const client = { streamInteractions: stream } as unknown as ApiClient;
    const { result } = renderStream(client, { seed: [seedItem('a')] });

    await flush();
    expect(result.current.interactions[0]?.answered).toBe(true);

    await flush(10 * 60 * 1000 + 1000);
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['b']);
  });

  it('lingers an answered seed card after the base drops it, then ages it out like a live one', async () => {
    // A seed-origin card is answered on the tail, then the paged base refetches
    // WITHOUT it (the door never lists answered items). Promotion into the overlay
    // keeps it lingering exactly like a live-add card; the retention sweep then
    // ages it out uniformly.
    async function* laterTick(): AsyncGenerator<SseFrame> {
      yield answered('a');
      await new Promise<void>((resolve) => setTimeout(resolve, 10 * 60 * 1000 + 1000));
      yield add('b');
    }
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockResolvedValueOnce(laterTick());
    stream.mockImplementation(() => Promise.resolve(iterate([])));
    const client = { streamInteractions: stream } as unknown as ApiClient;
    const { result, rerender } = renderStream(client, { seed: [seedItem('a')], total: 1 });

    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    expect(result.current.interactions[0]?.answered).toBe(true);

    // The base refetches and no longer lists the answered card — it must STILL linger.
    rerender({ seed: [], total: 0 });
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    expect(result.current.interactions[0]?.answered).toBe(true);

    // Past the retention window the sweeping tick ages it out.
    await flush(10 * 60 * 1000 + 1000);
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['b']);
  });

  it('drops a seed-only id when a later seed omits it (not a live add)', async () => {
    // A pending item carried only by the seed (no overlay entry) vanishes when a
    // refetched seed no longer lists it — merge is seed ∪ live-adds − removed.
    const { result, rerender } = renderStream(scriptedClient([]), {
      seed: [seedItem('a'), seedItem('b')],
      total: 2,
    });
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id).sort()).toEqual(['a', 'b']);

    rerender({ seed: [seedItem('a')], total: 1 });
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
  });

  it('caps retained answered items at the newest ANSWERED_CAP, evicting the oldest', async () => {
    // 201 interactions are added and answered on one connection (arrival order is
    // age order). The hard cap (200) keeps only the newest 200: the earliest is
    // evicted as the flood backstop, the latest is kept.
    const frames: SseFrame[] = [];
    for (let i = 0; i <= 200; i += 1) {
      const id = `i${String(i)}`;
      frames.push(add(id), answered(id));
    }
    const { result } = renderStream(scriptedClient(frames), {});
    await flush();

    expect(result.current.interactions).toHaveLength(200);
    const ids = new Set(result.current.interactions.map((it) => it.interaction_id));
    expect(ids.has('i0')).toBe(false); // oldest-answered evicted by the cap
    expect(ids.has('i200')).toBe(true); // newest-answered kept
  });

  it('clears a transient malformed-frame error on the next good frame', async () => {
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: 'not json' }, add('a')]),
      {},
    );
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
  });

  it('surfaces an add with an unknown answer_format as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([
        { event: 'interaction.add', data: addData('a', { answer_format: 'bogus' }) },
      ]),
      {},
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });

  it('accepts an add whose question is missing, normalizing it to an empty string', async () => {
    // The schema declares question: z.string().default(''), whose default
    // substitutes ONLY an absent/undefined value, so a MISSING question is valid
    // and renders as ''.
    const parsed = JSON.parse(addData('a')) as Record<string, unknown>;
    delete parsed.question;
    const missingQuestion = JSON.stringify(parsed);
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: missingQuestion }]),
      {},
    );
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.question).toBe('');
  });

  it('surfaces an add with a present null question as an error, not a blank card', async () => {
    // The default substitutes only undefined, so a PRESENT null fails the schema
    // and must surface as an error rather than a normalized blank card.
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: addData('a', { question: null }) }]),
      {},
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });

  it('surfaces an add with a present non-string question as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: addData('a', { question: 123 }) }]),
      {},
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });

  it('surfaces an add with a present non-object format_payload as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([
        {
          event: 'interaction.add',
          data: addData('a', { answer_format: 'form', format_payload: 'oops' }),
        },
      ]),
      {},
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });

  it('surfaces an add with a non-string created_at as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: addData('a', { created_at: 12345 }) }]),
      {},
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });

  it('carries an add frame media array through to the interaction, items unvalidated', async () => {
    // media is z.array(z.unknown()).optional(): the array rides through; the items
    // stay opaque here and are validated per item by the renderer.
    const media = [
      { kind: 'image', url: 'https://x/y.png' },
      { kind: 'link', url: 'https://x', caption: 'Buy' },
      'not-an-object',
    ];
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: addData('a', { media }) }]),
      {},
    );
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.interactions[0]?.media).toEqual(media);
  });

  it('leaves media undefined when the add frame omits it', async () => {
    const { result } = renderStream(scriptedClient([add('a')]), {});
    await flush();
    expect(result.current.interactions[0]?.media).toBeUndefined();
  });

  it('surfaces an add with a present non-array media as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: addData('a', { media: 'oops' }) }]),
      {},
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });

  it('carries the attribution fields through to the interaction when present', async () => {
    const { result } = renderStream(
      scriptedClient([
        {
          event: 'interaction.add',
          data: addData('a', { recipient: 'wa:+15551234', origin: 'run-abc', audience: 'user-42' }),
        },
      ]),
      {},
    );
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.interactions[0]?.recipient).toBe('wa:+15551234');
    expect(result.current.interactions[0]?.origin).toBe('run-abc');
    expect(result.current.interactions[0]?.audience).toBe('user-42');
  });

  it('leaves each attribution field undefined when the add frame omits it', async () => {
    const { result } = renderStream(scriptedClient([add('a')]), {});
    await flush();
    expect(result.current.interactions[0]?.recipient).toBeUndefined();
    expect(result.current.interactions[0]?.origin).toBeUndefined();
    expect(result.current.interactions[0]?.audience).toBeUndefined();
  });

  it('surfaces an add with a non-string attribution field as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: addData('a', { recipient: 7 }) }]),
      {},
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });
});
