import type { ApiClient, SseFrame } from '@tai42/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  add,
  addData,
  answered,
  flush,
  idData,
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

describe('interactions-connection — resync, reconnect and terminal handling', () => {
  it('re-merges a new seed reference WITHOUT reopening the stream', async () => {
    // A never-ending open connection: a seed change must re-merge over it, never
    // trigger a fresh open.
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    async function* open(): AsyncGenerator<SseFrame> {
      yield* iterate([]); // no frames…
      await new Promise<void>(() => {
        /* …then stays open forever */
      });
    }
    stream.mockImplementation(() => Promise.resolve(open()));
    const client = { streamInteractions: stream } as unknown as ApiClient;
    const { result, rerender } = renderStream(client, { seed: [seedItem('a')] });
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    expect(stream).toHaveBeenCalledTimes(1);

    rerender({ seed: [seedItem('a'), seedItem('b')], total: 2 });
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id).sort()).toEqual(['a', 'b']);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('calls onResync on connect (the tail carries no backlog to reconcile against)', async () => {
    // An empty connection: the connect fires onResync once, with no delta frames to
    // fire it again.
    const { onResync } = renderStream(scriptedClient([]), {});
    await flush();
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('fires onResync once per connect only, NOT on live deltas', async () => {
    // The overlay updates the list and the derived count in place, so a live delta
    // never refetches: one connect + three deltas (add/answered/removed) → ONE call.
    const { onResync } = renderStream(scriptedClient([add('a'), answered('a'), removed('a')]), {});
    await flush();
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('the removed-then-refetch repro: count stays 0 across the reconnect, never negative', async () => {
    // seed [X] total 1; removed(X) → 0. On reconnect the base refetches WITHOUT X
    // (fresh total 0). The persisted terminal must NOT be subtracted from the fresh
    // total a second time — epoch reconciliation keeps the count at 0, never -1.
    const { result, rerender } = renderStream(scriptedClient([removed('X')], []), {
      seed: [seedItem('X')],
      total: 1,
    });
    await flush(); // conn1 connects, resync, removed(X) → 1 - 1 = 0
    expect(result.current.count).toBe(0);

    await flush(750); // conn2 (re)connects → its landed resync advances countEpoch
    rerender({ seed: [], total: 0 }); // the refetch dropped X: fresh total 0
    await flush();
    expect(result.current.count).toBe(0);
    expect(result.current.count).toBeGreaterThanOrEqual(0);
  });

  it('clamps at 0 when the base refetch folds a terminal BEFORE its frame arrives (the "-1 pending questions" race)', async () => {
    // The live-observed race: the answer POST lands, the paged base refetches and
    // drops X (fresh seed [] / total 0) BEFORE the answered frame reaches this
    // client. The card is gone from the seed, so the answered frame cannot promote
    // it (+1 has nothing to promote), while its terminal stamp (same epoch as
    // countEpoch — no reconnect happened) still subtracts: 0 - 1 = -1, the badge
    // that read "-1 pending questions". The published count clamps at 0; the next
    // landed resync reconciles the epoch for real.
    let releaseAnswered!: () => void;
    const gate = new Promise<void>((resolve) => (releaseAnswered = resolve));
    async function* gatedFrames(): AsyncGenerator<SseFrame> {
      await gate;
      yield answered('X');
    }
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockResolvedValueOnce(gatedFrames());
    stream.mockImplementation(() => Promise.resolve(iterate([])));
    const client = { streamInteractions: stream } as unknown as ApiClient;

    const { result, rerender } = renderStream(client, { seed: [seedItem('X')], total: 1 });
    await flush(); // conn1 connects, resync lands (countEpoch = conn1 epoch); frame still gated
    expect(result.current.count).toBe(1);

    rerender({ seed: [], total: 0 }); // the refetch already dropped answered X; no reconnect
    await flush();
    expect(result.current.count).toBe(0);

    releaseAnswered(); // now the answered(X) frame arrives — too late to promote
    await flush();
    expect(result.current.count).toBe(0);
    expect(result.current.count).toBeGreaterThanOrEqual(0);
  });

  it('holds the count when a reconnect refetch FAILS (onResync false), then reconciles when a later refetch lands', async () => {
    // seed [a] total 2 (one more pending on an unloaded page); removed(a) → 1. On the
    // first reconnect the base refetch FAILS: onResync resolves false, so countEpoch is
    // NOT advanced and the prior-epoch removal keeps subtracting against the unchanged
    // total — the count holds at 1, never the stale 2 an epoch advance would leave (the
    // exact badge-wrong-for-the-outage bug). A LATER reconnect whose refetch LANDS
    // (true) with the reduced total 1 then reconciles, still 1.
    const onResync = vi.fn<() => Promise<boolean>>();
    onResync.mockResolvedValue(true); // conn3+ land
    onResync.mockResolvedValueOnce(true); // conn1 lands
    onResync.mockResolvedValueOnce(false); // conn2 refetch fails
    const { result, rerender } = renderStream(scriptedClient([removed('a')]), {
      seed: [seedItem('a')],
      total: 2,
      onResync,
    });
    await flush(); // conn1: landed resync (epoch 1), removed(a) → 2 - 1 = 1
    expect(result.current.count).toBe(1);

    await flush(750); // conn2: resync FAILS (false) → countEpoch unchanged
    expect(result.current.count).toBe(1); // NOT 2 — the prior-epoch terminal still applies

    await flush(1500); // conn3: resync LANDS (true) with the reduced base
    rerender({ seed: [], total: 1 }); // the door now reports total 1, a is gone
    await flush();
    expect(result.current.count).toBe(1);
    expect(result.current.count).toBeGreaterThanOrEqual(0);
  });

  it('subtracts five terminals once: after a reconnect refetch to total 2, count is 2', async () => {
    // Five seeded ids go terminal on conn1 (7 - 5 = 2). The reconnect refetch returns
    // the reduced total 2 (the five already dropped server-side); the persisted five
    // terminals carry the old epoch and are not re-subtracted, so the count holds at 2.
    const seed = Array.from({ length: 5 }, (_, i) => seedItem(`s${String(i)}`));
    const frames = seed.map((item) => removed(item.interaction_id));
    const { result, rerender } = renderStream(scriptedClient(frames, []), { seed, total: 7 });
    await flush(); // conn1: five removed → 7 - 5 = 2
    expect(result.current.count).toBe(2);

    await flush(750); // conn2 resync advances countEpoch
    rerender({ seed: [], total: 2 }); // the five are gone from the base; two remain elsewhere
    await flush();
    expect(result.current.count).toBe(2); // NOT 2 - 5 = -3
  });

  it('stamps a live add on the new connection at the new epoch, counted once against the refetched total', async () => {
    // conn1 answers the only seeded id (count 0). On reconnect the base refetches
    // WITHOUT it (total 0) and a live add for a new id arrives on conn2: it is stamped
    // at the NEW epoch and counted once, while the prior terminal (old epoch) is not
    // re-subtracted.
    const { result, rerender } = renderStream(scriptedClient([answered('a')], [add('z')]), {
      seed: [seedItem('a')],
      total: 1,
    });
    await flush(); // conn1: answered(a) → 1 - 1 = 0
    expect(result.current.count).toBe(0);

    await flush(750); // conn2: resync advances countEpoch, then add(z) applies at the new epoch
    rerender({ seed: [], total: 0 }); // the refetch dropped the answered card
    await flush();
    expect(result.current.count).toBe(1); // z counted once; a not double-subtracted
  });

  it('lingers an answered seed card after the base refetch drops it while the count stays right', async () => {
    // The answered seed card is retained in the LIST unchanged (the door never lists
    // answered items, so promotion keeps it), while the epoch-reconciled count stays
    // correct across the reconnect — retention and counting are independent.
    const { result, rerender } = renderStream(scriptedClient([answered('a')], []), {
      seed: [seedItem('a')],
      total: 1,
    });
    await flush(); // conn1: a answered → lingers, count 0
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    expect(result.current.interactions[0]?.answered).toBe(true);
    expect(result.current.count).toBe(0);

    await flush(750); // conn2 resync advances countEpoch
    rerender({ seed: [], total: 0 }); // the door never lists the answered card
    await flush();
    // Retention unchanged: the answered card still lingers…
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    expect(result.current.interactions[0]?.answered).toBe(true);
    // …while the count is right, never -1.
    expect(result.current.count).toBe(0);
    expect(result.current.count).toBeGreaterThanOrEqual(0);
  });

  it('does not refetch (onResync) on a malformed frame', async () => {
    // A malformed frame surfaces an error and does not touch the base — only the
    // connect refetch fired.
    const { onResync } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: 'not json' }]),
      {},
    );
    await flush();
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('calls onResync again on reconnect', async () => {
    // conn1 opens+drains empty (< the healthy window, so the backoff is not reset)
    // and schedules a 750ms reconnect; conn2 opens then.
    const { onResync } = renderStream(scriptedClient([], []), {});
    await flush();
    expect(onResync).toHaveBeenCalledTimes(1);
    await flush(750);
    expect(onResync).toHaveBeenCalledTimes(2);
  });

  it('keeps a live add across a reconnect and a redelivery does not duplicate', async () => {
    // conn1 adds a (kept in the overlay across connections in one mount); conn2
    // redelivers a and adds b.
    const { result } = renderStream(scriptedClient([add('a')], [add('a'), add('b')]), {});
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    await flush(750);
    expect(result.current.interactions.map((i) => i.interaction_id).sort()).toEqual(['a', 'b']);
  });

  it('heals a gap-answered card on reconnect via the resumed Last-Event-ID', async () => {
    // Composed path (the live report): the add lands (card pending) and the client
    // remembers the frame id; the connection drops; the answer happens during the gap;
    // the reconnect sends the last-seen id as Last-Event-ID so the server resumes AFTER
    // it and replays the gap `answered` frame. The card converges to answered instead
    // of vanishing (it is in neither the refetched pending base nor a from-tail stream).
    const stream =
      vi.fn<(signal?: AbortSignal, lastEventId?: string) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockResolvedValueOnce(
      iterate([{ event: 'interaction.add', data: addData('a'), id: '1-0' }]),
    );
    stream.mockResolvedValueOnce(
      iterate([{ event: 'interaction.answered', data: idData('a'), id: '2-0' }]),
    );
    stream.mockImplementation(() => Promise.resolve(iterate([])));
    const client = { streamInteractions: stream } as unknown as ApiClient;
    const { result } = renderStream(client, {});

    await flush(); // conn1: add('a') → pending; remembers id 1-0; drains → backoff
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    expect(result.current.interactions[0]?.answered).toBe(false);
    expect(stream).toHaveBeenNthCalledWith(1, expect.anything(), undefined);

    await flush(750); // reconnect resumes AFTER 1-0 and replays the gap answered('a')
    expect(stream).toHaveBeenNthCalledWith(2, expect.anything(), '1-0');
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.answered).toBe(true);
  });

  it('backs off exponentially across failed reconnects (capped, jittered)', async () => {
    // With jitter pinned to its midpoint the ceiling growth is observable: the
    // delay for attempt n is 0.5 * min(CAP, 1500 * 2**n) → 750, 1500, 3000, …
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockRejectedValue(new Error('network down')); // never opens → attempt never resets
    const client = { streamInteractions: stream } as unknown as ApiClient;
    renderStream(client, {});

    await flush(); // attempt 0 open (rejects) → schedules 750ms
    expect(stream).toHaveBeenCalledTimes(1);
    await flush(750); // → attempt 1 open → schedules 1500ms
    expect(stream).toHaveBeenCalledTimes(2);
    await flush(1500); // → attempt 2 open → schedules 3000ms
    expect(stream).toHaveBeenCalledTimes(3);
    await flush(1500); // only half the 3000ms delay elapsed → no new open
    expect(stream).toHaveBeenCalledTimes(3);
    await flush(1500); // full 3000ms elapsed → attempt 3 open
    expect(stream).toHaveBeenCalledTimes(4);
  });

  it('backs off across connections that open but drop before proving healthy', async () => {
    // Each connection OPENS (streamInteractions resolves) but drains empty
    // immediately — open for far less than the healthy window — so the healthy-reset
    // never fires and the delay must still grow. (Resetting on mere open would
    // tight-loop here.)
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockImplementation(() => Promise.resolve(iterate([]))); // opens, drains empty, ends
    const client = { streamInteractions: stream } as unknown as ApiClient;
    renderStream(client, {});

    await flush(); // conn 1 opens+ends → attempt 0 → schedules 750ms
    expect(stream).toHaveBeenCalledTimes(1);
    await flush(750); // conn 2 → attempt 1 → schedules 1500ms
    expect(stream).toHaveBeenCalledTimes(2);
    await flush(1500); // conn 3 → attempt 2 → schedules 3000ms
    expect(stream).toHaveBeenCalledTimes(3);
    await flush(1500); // only half the 3000ms delay elapsed → no new open
    expect(stream).toHaveBeenCalledTimes(3);
  });

  it('resets the backoff when a connection stays open past the healthy window', async () => {
    // conn1/conn2 reject (750, then 1500). conn3 OPENS and stays open exactly the
    // healthy window (1500ms) before ending, which resets attempt → 0, so it
    // schedules 750 again. conn4 therefore opens at 750: an un-reset attempt (→3)
    // would schedule 6000, so the final flush(750) would open nothing.
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    async function* healthyThenEnd(): AsyncGenerator<SseFrame> {
      yield add('x');
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    }
    stream
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementationOnce(() => Promise.resolve(healthyThenEnd()));
    stream.mockImplementation(() => Promise.resolve(iterate([]))); // then empty forever
    const client = { streamInteractions: stream } as unknown as ApiClient;
    renderStream(client, {});

    await flush(); // conn1 rejects → schedules 750
    expect(stream).toHaveBeenCalledTimes(1);
    await flush(750); // conn2 rejects → schedules 1500
    expect(stream).toHaveBeenCalledTimes(2);
    await flush(1500); // conn3 opens (its 1500ms suspend has not elapsed yet)
    expect(stream).toHaveBeenCalledTimes(3);
    await flush(1500); // conn3's suspend elapses, ends healthy → resets attempt→0 → schedules 750
    expect(stream).toHaveBeenCalledTimes(3);
    await flush(750); // reset proven: conn4 opens at 750 (un-reset would need 6000)
    expect(stream).toHaveBeenCalledTimes(4);
  });

  it('caps the reconnect delay at RECONNECT_CAP_MS', async () => {
    // Drive the always-rejecting backoff far enough that the raw ceiling overruns
    // the cap. The delay scheduled after each open uses attempt = opens-so-far - 1;
    // at attempt 5 the raw ceiling 1500 * 2**5 = 48000 first exceeds the 30000 cap,
    // so with jitter fixed at 0.5 that delay is 0.5 * min(30000, 48000) = 15000, NOT
    // the uncapped 0.5 * 48000 = 24000. The 6th open (attempt 5) therefore schedules
    // the 7th open 15000ms out; without the Math.min cap it would be 24000ms out.
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockRejectedValue(new Error('network down')); // never opens → attempt never resets
    const client = { streamInteractions: stream } as unknown as ApiClient;
    renderStream(client, {});

    await flush(); // attempt 0 open → schedules 750
    expect(stream).toHaveBeenCalledTimes(1);
    await flush(750); // attempt 1 open → schedules 1500
    expect(stream).toHaveBeenCalledTimes(2);
    await flush(1500); // attempt 2 open → schedules 3000
    expect(stream).toHaveBeenCalledTimes(3);
    await flush(3000); // attempt 3 open → schedules 6000
    expect(stream).toHaveBeenCalledTimes(4);
    await flush(6000); // attempt 4 open → schedules 12000 (min(30000,24000)=24000, uncapped)
    expect(stream).toHaveBeenCalledTimes(5);
    await flush(12000); // attempt 5 open → schedules the CAPPED 15000 (uncapped would be 24000)
    expect(stream).toHaveBeenCalledTimes(6);
    await flush(15000); // capped 15000 elapses → 7th open (uncapped 24000 would not have)
    expect(stream).toHaveBeenCalledTimes(7);
  });

  it('treats a 401 as terminal: routes to the app 401 handler and does not reconnect', async () => {
    // A dead credential surfaces as ApiUnauthorizedError (matched by name, since
    // the SDK cannot runtime-import api-client). It must NOT reconnect.
    const unauthorized = Object.assign(new Error('unauthorized'), {
      name: 'ApiUnauthorizedError',
    });
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockRejectedValueOnce(unauthorized);
    // Any further call would be an (unwanted) reconnect — make it observable.
    stream.mockImplementation(() => Promise.resolve(iterate([])));
    const client = { streamInteractions: stream } as unknown as ApiClient;
    const onUnauthorized = vi.fn();
    const { result } = renderStream(client, { onUnauthorized });

    await flush();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeInstanceOf(Error);

    // Advancing past the reconnect delay must NOT trigger another stream open.
    await flush(3000);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('treats a terminal 501 as disabled: flags disabled and does not reconnect', async () => {
    // The interactions store is unconfigured: the stream answers with a 501
    // `interactions-not-configured`. Reconnecting would replay the same refusal on
    // every backoff forever, so the hook stops and flags the OFF state.
    const notConfigured = Object.assign(new Error('interactions store not configured'), {
      name: 'ApiError',
      status: 501,
      code: 'interactions-not-configured',
    });
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockRejectedValueOnce(notConfigured);
    // Any further call would be an unwanted reconnect — make it observable.
    stream.mockImplementation(() => Promise.resolve(iterate([])));
    const client = { streamInteractions: stream } as unknown as ApiClient;
    const { result } = renderStream(client, {});

    await flush();
    expect(result.current.disabled).toBe(true);
    expect(result.current.connected).toBe(false);

    // Advancing far past any backoff ceiling must NOT open another stream.
    await flush(60000);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('treats a -not-configured code as terminal even when the status is not 501', async () => {
    // The `code` is authoritative; a machine code ending `-not-configured` is
    // terminal regardless of the transport status the error happens to carry.
    const notConfigured = Object.assign(new Error('off'), {
      name: 'ApiError',
      status: 400,
      code: 'interactions-not-configured',
    });
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockRejectedValueOnce(notConfigured);
    stream.mockImplementation(() => Promise.resolve(iterate([])));
    const client = { streamInteractions: stream } as unknown as ApiClient;
    const { result } = renderStream(client, {});

    await flush();
    expect(result.current.disabled).toBe(true);

    await flush(60000);
    expect(stream).toHaveBeenCalledTimes(1);
  });
});
