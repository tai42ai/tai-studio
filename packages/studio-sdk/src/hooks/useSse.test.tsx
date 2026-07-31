import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, SseFrame } from '@tai42/api-client';

import { ApiProvider } from './useApi';
import { UnauthorizedProvider } from './useUnauthorized';
import { useInteractionsStream } from './useSse';

// -- scripted stream helpers -------------------------------------------------

function iterate(frames: SseFrame[]): AsyncGenerator<SseFrame> {
  async function* gen(): AsyncGenerator<SseFrame> {
    for (const frame of frames) yield frame;
  }
  return gen();
}

// The `interaction.add` wire shape (backlog + tail) — the full question.
function addData(id: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    interaction_id: id,
    group_id: `g-${id}`,
    question: '',
    answer_format: 'text',
    format_payload: {},
    created_at: '2026-07-04T00:00:00Z',
    timeout_at: '2026-07-04T00:05:00Z',
    ...extra,
  });
}

// The `answered` / `removed` wire shape — ids only, no question fields.
function idData(id: string): string {
  return JSON.stringify({ interaction_id: id, group_id: `g-${id}` });
}

const add = (id: string): SseFrame => ({ event: 'interaction.add', data: addData(id) });
const answered = (id: string): SseFrame => ({
  event: 'interaction.answered',
  data: idData(id),
});
const removed = (id: string): SseFrame => ({ event: 'interaction.removed', data: idData(id) });
const backlogDone: SseFrame = { event: 'interaction.backlog_done', data: '{}' };

function scriptedClient(...batches: SseFrame[][]): ApiClient {
  const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
  for (const batch of batches) stream.mockResolvedValueOnce(iterate(batch));
  // Any further reconnects yield an empty (already-drained) stream.
  stream.mockImplementation(() => Promise.resolve(iterate([])));
  return { streamInteractions: stream } as unknown as ApiClient;
}

function renderStream(client: ApiClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider value={client}>{children}</ApiProvider>
  );
  return renderHook(() => useInteractionsStream(), { wrapper });
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // Pin the reconnect jitter to its midpoint so every backoff delay is EXACT and
  // each test advances by a known amount rather than padding past a random range.
  // The hook's full-jitter delay is `Math.random() * ceiling`, so random=0.5 makes
  // the delay a deterministic `0.5 * ceiling` (e.g. 750 for the 1500ms base).
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useInteractionsStream', () => {
  it('adds an interaction on interaction.add and marks the backlog loaded', async () => {
    const { result } = renderStream(scriptedClient([add('a'), backlogDone]));
    await flush();
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.interaction_id).toBe('a');
    expect(result.current.backlogLoaded).toBe(true);
  });

  it('flips answered:true on interaction.answered', async () => {
    const { result } = renderStream(scriptedClient([add('a'), answered('a'), backlogDone]));
    await flush();
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.answered).toBe(true);
  });

  it('drops an interaction on interaction.removed', async () => {
    const { result } = renderStream(
      scriptedClient([add('a'), add('b'), removed('a'), backlogDone]),
    );
    await flush();
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.interaction_id).toBe('b');
  });

  it('de-duplicates a repeated interaction.add for the same id', async () => {
    const { result } = renderStream(scriptedClient([add('a'), add('a'), backlogDone]));
    await flush();
    expect(result.current.interactions).toHaveLength(1);
  });

  it('reconnects on stream end and a replayed backlog does not duplicate', async () => {
    // Connection 1 ends after one add; connection 2 replays it and adds one more.
    const { result } = renderStream(
      scriptedClient([add('a'), backlogDone], [add('a'), add('b'), backlogDone]),
    );
    await flush();
    expect(result.current.interactions).toHaveLength(1);

    // Advance the exact reconnect delay (0.5 * 1500ms base) so connection 2 runs.
    await flush(750);
    expect(result.current.interactions).toHaveLength(2);
    expect(result.current.interactions.map((i) => i.interaction_id).sort()).toEqual(['a', 'b']);
  });

  it('surfaces a malformed frame as an error instead of dropping it silently', async () => {
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: 'not json' }, backlogDone]),
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('preserves the answered flag when the same add is redelivered', async () => {
    // add → answered → a redelivered add for the same id (an at-least-once replay).
    const { result } = renderStream(
      scriptedClient([add('a'), answered('a'), add('a'), backlogDone]),
    );
    await flush();
    expect(result.current.interactions).toHaveLength(1);
    // The second add must not reset the client answered flag to false.
    expect(result.current.interactions[0]?.answered).toBe(true);
  });

  it('drops an interaction missing from a later reconnect backlog', async () => {
    // Connection 1 carries a + b; connection 2 replays only a as the authoritative
    // backlog, so b (removed while disconnected) is reconciled away.
    const { result } = renderStream(
      scriptedClient([add('a'), add('b'), backlogDone], [add('a'), backlogDone]),
    );
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id).sort()).toEqual(['a', 'b']);

    // Advance the exact reconnect delay so connection 2's backlog replays.
    await flush(750);
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.interaction_id).toBe('a');
  });

  it('keeps an answered interaction across a reconnect whose pending backlog omits it', async () => {
    // conn1: a is added then answered (client-terminal). conn2's backlog is the
    // PENDING set only, which never carries an answered item — so the reconcile
    // must NOT drop a: an answered card survives reconnect and ages out only
    // client-side (never re-vanished by a pending-only backlog).
    const { result } = renderStream(
      scriptedClient([add('a'), answered('a'), backlogDone], [backlogDone]),
    );
    await flush();
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.answered).toBe(true);

    // Advance the exact reconnect delay so connection 2's empty backlog replays.
    await flush(750);
    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.interaction_id).toBe('a');
    expect(result.current.interactions[0]?.answered).toBe(true);
  });

  it('reconciles a reconnect backlog by pending state: drops a pending id, keeps an answered one', async () => {
    // conn1 carries a (answered) + b and c (pending). conn2's pending backlog
    // replays only c — b (removed while disconnected) is reconciled away, c is
    // kept, and a (answered) is exempt from reconciliation, never dropped for
    // being absent from the pending-only backlog.
    const { result } = renderStream(
      scriptedClient(
        [add('a'), answered('a'), add('b'), add('c'), backlogDone],
        [add('c'), backlogDone],
      ),
    );
    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id).sort()).toEqual([
      'a',
      'b',
      'c',
    ]);

    // Advance the exact reconnect delay so connection 2's backlog replays.
    await flush(750);
    expect(result.current.interactions.map((i) => i.interaction_id).sort()).toEqual(['a', 'c']);
    expect(result.current.interactions.find((i) => i.interaction_id === 'a')?.answered).toBe(true);
  });

  it('ages an answered card out after the retention window', async () => {
    // The server sends no removal for an answered card, so the client ages it out.
    // a is answered at t0; b arrives only AFTER the 10-minute retention window, and
    // its frame is the lazy tick on which the now-aged a is swept away.
    async function* laterTick(): AsyncGenerator<SseFrame> {
      yield add('a');
      yield answered('a');
      yield backlogDone;
      // Suspend the OPEN connection past the retention window (no reconnect timer
      // is pending while the generator is mid-await), then emit the sweeping tick.
      await new Promise<void>((resolve) => setTimeout(resolve, 10 * 60 * 1000 + 1000));
      yield add('b');
      yield backlogDone;
    }
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockResolvedValueOnce(laterTick());
    stream.mockImplementation(() => Promise.resolve(iterate([])));
    const client = { streamInteractions: stream } as unknown as ApiClient;
    const { result } = renderStream(client);

    await flush();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
    expect(result.current.interactions[0]?.answered).toBe(true);

    // Advance past the retention window; the generator then yields b, whose tick
    // sweeps the aged-out a.
    await flush(10 * 60 * 1000 + 1000);
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['b']);
    expect(result.current.interactions[0]?.answered).toBe(false);
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
    frames.push(backlogDone);
    const { result } = renderStream(scriptedClient(frames));
    await flush();

    expect(result.current.interactions).toHaveLength(200);
    const ids = new Set(result.current.interactions.map((it) => it.interaction_id));
    expect(ids.has('i0')).toBe(false); // oldest-answered evicted by the cap
    expect(ids.has('i200')).toBe(true); // newest-answered kept
  });

  it('clears a transient malformed-frame error on the next good frame', async () => {
    const { result } = renderStream(
      scriptedClient([{ event: 'interaction.add', data: 'not json' }, add('a'), backlogDone]),
    );
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.interactions.map((i) => i.interaction_id)).toEqual(['a']);
  });

  it('surfaces an add with an unknown answer_format as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([
        { event: 'interaction.add', data: addData('a', { answer_format: 'bogus' }) },
        backlogDone,
      ]),
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
      scriptedClient([{ event: 'interaction.add', data: missingQuestion }, backlogDone]),
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
      scriptedClient([
        { event: 'interaction.add', data: addData('a', { question: null }) },
        backlogDone,
      ]),
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });

  it('surfaces an add with a present non-string question as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([
        { event: 'interaction.add', data: addData('a', { question: 123 }) },
        backlogDone,
      ]),
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
        backlogDone,
      ]),
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });

  it('surfaces an add with a non-string created_at as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([
        { event: 'interaction.add', data: addData('a', { created_at: 12345 }) },
        backlogDone,
      ]),
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });

  it('backs off exponentially across failed reconnects (capped, jittered)', async () => {
    // With jitter pinned to its midpoint the ceiling growth is observable: the
    // delay for attempt n is 0.5 * min(CAP, 1500 * 2**n) → 750, 1500, 3000, …
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockRejectedValue(new Error('network down')); // never opens → attempt never resets
    const client = { streamInteractions: stream } as unknown as ApiClient;
    renderStream(client);

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

  it('backs off across connections that open but never complete a backlog', async () => {
    // Each connection OPENS (streamInteractions resolves) but ends without an
    // interaction.backlog_done, so the healthy-reset never fires — the delay must
    // still grow. (Resetting on open, not on backlog_done, would tight-loop here.)
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream.mockImplementation(() => Promise.resolve(iterate([]))); // opens, drains empty, ends
    const client = { streamInteractions: stream } as unknown as ApiClient;
    renderStream(client);

    await flush(); // conn 1 opens+ends → attempt 0 → schedules 750ms
    expect(stream).toHaveBeenCalledTimes(1);
    await flush(750); // conn 2 → attempt 1 → schedules 1500ms
    expect(stream).toHaveBeenCalledTimes(2);
    await flush(1500); // conn 3 → attempt 2 → schedules 3000ms
    expect(stream).toHaveBeenCalledTimes(3);
    await flush(1500); // only half the 3000ms delay elapsed → no new open
    expect(stream).toHaveBeenCalledTimes(3);
  });

  it('resets the backoff when a connection proves healthy (backlog_done)', async () => {
    // A stream that rejects twice, then opens with a completed backlog, then drains
    // empty forever. With jitter fixed at 0.5 the delays are: conn1 (attempt 0) →
    // 750, conn2 (attempt 1) → 1500, conn3 (attempt 2) opens and its backlog_done
    // RESETS attempt → 0 before it ends → schedules 750 again. The reset is what
    // makes conn4 open at 750: an un-reset attempt (2 → 3) would schedule 3000, so
    // the final flush(750) would open nothing.
    const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
    stream
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(iterate([backlogDone]));
    stream.mockImplementation(() => Promise.resolve(iterate([]))); // then empty forever
    const client = { streamInteractions: stream } as unknown as ApiClient;
    renderStream(client);

    await flush(); // conn1 rejects → schedules 750
    expect(stream).toHaveBeenCalledTimes(1);
    await flush(750); // conn2 rejects → schedules 1500
    expect(stream).toHaveBeenCalledTimes(2);
    await flush(1500); // conn3 opens, backlog_done resets attempt→0, ends → schedules 750
    expect(stream).toHaveBeenCalledTimes(3);
    await flush(750); // reset proven: conn4 opens at 750 (un-reset would need 3000)
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
    renderStream(client);

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

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider value={client}>
        <UnauthorizedProvider value={onUnauthorized}>{children}</UnauthorizedProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => useInteractionsStream(), { wrapper });

    await flush();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeInstanceOf(Error);

    // Advancing past the reconnect delay must NOT trigger another stream open.
    await flush(3000);
    expect(stream).toHaveBeenCalledTimes(1);
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
      scriptedClient([{ event: 'interaction.add', data: addData('a', { media }) }, backlogDone]),
    );
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.interactions[0]?.media).toEqual(media);
  });

  it('leaves media undefined when the add frame omits it', async () => {
    const { result } = renderStream(scriptedClient([add('a'), backlogDone]));
    await flush();
    expect(result.current.interactions[0]?.media).toBeUndefined();
  });

  it('surfaces an add with a present non-array media as an error, not a blank card', async () => {
    const { result } = renderStream(
      scriptedClient([
        { event: 'interaction.add', data: addData('a', { media: 'oops' }) },
        backlogDone,
      ]),
    );
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.interactions).toHaveLength(0);
  });
});
