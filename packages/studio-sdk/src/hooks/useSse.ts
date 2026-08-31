/**
 * `useInteractionsStream` — the live interactions inbox, a TAIL-ONLY SSE stream
 * (via the api-client's `streamInteractions`: fetch + ReadableStream, never
 * EventSource) laid over a PAGED base the caller supplies.
 *
 * The stream carries only the live tail: events `interaction.add` /
 * `interaction.answered` / `interaction.removed` (no backlog, no
 * `interaction.backlog_done`). The PENDING SET is not replayed on the stream — it
 * is the `seed` the caller passes from the paged `GET /api/interactions` door; this
 * hook overlays the live deltas onto it. The hook calls `onResync` on every
 * (re)connect ONLY, so the caller refetches that base to catch up anything missed
 * while disconnected; a live delta never triggers a refetch — the overlay updates
 * the list and the derived `count` in place.
 *
 * The published list is `merge(seed, live)`: every seeded pending item, plus any
 * item added on the tail since connect, minus any removed on the tail, with the
 * client `answered` flag set on an item the tail reported answered.
 *
 * The published `count` is the live PENDING tally, derived from the same overlay
 * without a refetch, reconciled by EPOCH so a resync never double-counts. Each
 * (re)connect refetches the base under a fresh epoch and, once that refetch LANDS
 * fresh, records it as `countEpoch` (a failed refetch does not advance it, so
 * prior-epoch deltas keep applying against the consistent prior total rather than
 * being discarded against a stale one); every overlay add and every terminal
 * (answered or removed) entry is stamped with the epoch current when its frame
 * arrived. The count
 * is the seed `total` plus live adds not in the seed AND stamped at or after
 * `countEpoch`, minus one for every terminal id stamped at or after `countEpoch`
 * (deduped per id) — a terminal or an add already folded into the refetched `total`
 * carries an older stamp and is not applied again. The single residual: a frame
 * arriving while a refetch is in flight may or may not be reflected in that refetch's
 * `total`, and is reconciled on the next resync.
 *
 * ANSWERED-CARD LIFECYCLE: the server emits no removal for an answered card —
 * only `interaction.answered`, never `interaction.removed` for it — and the paged
 * base never carries answered items. On its answered frame a card is promoted into
 * the overlay's adds (a seed-origin card too), so it lingers uniformly whether it
 * began as a live add or a seed item, even after a refetch drops it from the base.
 * This hook AGES it out itself: an answered card is dropped `ANSWERED_RETENTION_MS`
 * after its answered frame (tombstoned so a still-stale seed cannot resurrect it),
 * with `ANSWERED_CAP` as a hard newest-N flood backstop. Both are swept lazily on
 * frame/reconnect ticks (the stream carries no idle heartbeat frame), never a
 * per-item timer.
 *
 * `add` / `answered` frames are at-least-once; entries are keyed by
 * `interaction_id`, a redelivered `add` overwrites in place, and a redelivered
 * `answered` keeps the original stamp so the retention window is not extended.
 *
 * The `Interaction` type is imported type-only (no runtime dep on api-client);
 * frames are validated defensively and a malformed frame is surfaced as an error,
 * never rendered as a silent blank. `answered` is not a wire field — it is a
 * client flag this hook flips on an `interaction.answered` event.
 */
import { useEffect, useRef, useState } from 'react';
import type { Interaction } from '@tai42/api-client';

import { useApi } from './useApi';
import { useOnUnauthorized } from './useUnauthorized';
import { isFeatureDisabled } from '../feature-disabled';

/** A live interaction plus the client-maintained `answered` flag. */
export type StreamInteraction = Interaction & { readonly answered: boolean };

/** The inputs the caller drives the tail-only stream with. */
export interface InteractionsStreamOptions {
  /**
   * The pending set from the paged `GET /api/interactions` door — the base the
   * live tail overlays. A stable reference between refetches (memoize it upstream);
   * a new reference re-merges but does NOT reopen the stream.
   */
  readonly seed: readonly Interaction[];
  /**
   * The door's authoritative pending TOTAL for the current `seed` (the paged
   * response's `total`). The published `count` derives the live pending tally from
   * this plus the overlay delta, so the badge stays live without a refetch.
   */
  readonly total: number;
  /**
   * Refetch `seed`. Called on every (re)connect ONLY — the tail carries no backlog,
   * so this reconciles anything missed while disconnected. A live delta never calls
   * it: the overlay updates the list and the derived `count` in place. MUST resolve
   * `true` only when the refetch LANDED a fresh `total`, and `false` when it failed:
   * the hook advances `countEpoch` only on `true`, so terminals and adds already
   * folded into the fresh `total` are not applied to the count again, while after a
   * failed refetch the prior-epoch deltas keep applying against the unchanged prior
   * total instead of being discarded against a stale one.
   */
  readonly onResync: () => boolean | Promise<boolean>;
}

export interface InteractionsStreamState {
  readonly interactions: StreamInteraction[];
  /**
   * The live pending count: the seed `total` adjusted by the overlay delta stamped at
   * or after the last landed resync's epoch (adds not in the seed, minus one per
   * terminal id). Stays live without a refetch; a delta stamped before `countEpoch` is
   * already reflected in `total` and not applied again.
   */
  readonly count: number;
  readonly connected: boolean;
  readonly error: Error | null;
  /**
   * The interactions store is not configured on this deployment: the stream
   * answered with a terminal 501 `interactions-not-configured`. Reconnection is
   * abandoned (retrying would replay the same refusal forever) and the consumer
   * renders the muted OFF state instead of a red error or a floating badge.
   */
  readonly disabled: boolean;
}

// Reconnect backoff: capped exponential with full jitter. The delay for attempt
// n is a random value in [0, min(CAP, BASE * 2**n)); the attempt counter resets
// only when a connection PROVES HEALTHY — it stayed open at least
// `HEALTHY_CONNECTION_MS` — not merely when it opens, so a server that accepts the
// request then drops the body still backs off instead of tight-looping. A healthy
// tail-reconnect is near-instant while a sustained outage backs off, and the
// jitter spreads many clients apart rather than retrying in lockstep.
const RECONNECT_BASE_MS = 1500;
const RECONNECT_CAP_MS = 30000;
const HEALTHY_CONNECTION_MS = RECONNECT_BASE_MS;

// The server emits no removal for an answered card — only `interaction.answered`,
// never `interaction.removed` for it — and the paged base never carries answered
// items, so answered cards would otherwise pile up unbounded in the always-mounted
// badge/inbox. The client ages them out: drop an answered card
// ANSWERED_RETENTION_MS after its answered frame, keeping at most ANSWERED_CAP as a
// hard flood backstop. Swept lazily on frame/reconnect ticks (the stream carries no
// idle heartbeat frame), never a per-item timer.
const ANSWERED_RETENTION_MS = 10 * 60 * 1000;
const ANSWERED_CAP = 200;

// The wire `answer_format` values. Duplicated from the api-client enum by design:
// the SDK is the leaf and must not import api-client at runtime. The `satisfies`
// pin against `Interaction['answer_format']` fails to compile if a listed value
// leaves the union, so this runtime guard cannot silently drift from the type.
const ANSWER_FORMATS = new Set<string>([
  'text',
  'confirm',
  'select',
  'form',
  'external',
] as const satisfies readonly Interaction['answer_format'][]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse a frame's JSON to a plain object, or null when it is not one. */
function parseJson(data: string): Record<string, unknown> | null {
  if (!data) return null;
  try {
    const obj: unknown = JSON.parse(data);
    return isRecord(obj) ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Validate an `interaction.add` frame into an `Interaction`, or null when it is
 * malformed. This mirrors the api-client `interaction` zod schema exactly — it
 * accepts what that schema accepts, no more, no less. The strict-required fields
 * — `interaction_id`, `group_id`, `created_at`, `timeout_at` — must be a string
 * and `answer_format` a known enum value; any missing or non-string one returns
 * null so the caller surfaces it as an error rather than rendering a blank card.
 * Two fields are laxer, matching the schema: `question` is
 * `z.string().default('')`, whose default substitutes ONLY an absent/undefined
 * value, so a missing question normalizes to `''` while a present `null` (or any
 * present non-string) is rejected; `format_payload` is nullish, so an absent/null
 * value (text/confirm carry none) normalizes to `{}` while a present non-object is
 * rejected — never silently coerced to a blank card.
 */
function parseAddFrame(data: string): Interaction | null {
  const obj = parseJson(data);
  if (obj === null) return null;
  const {
    interaction_id,
    group_id,
    question,
    answer_format,
    format_payload,
    created_at,
    timeout_at,
    sensitive,
    server_verified,
    channel,
    recipient,
    origin,
    audience,
    media,
  } = obj;
  if (typeof interaction_id !== 'string') return null;
  if (typeof group_id !== 'string') return null;
  // `question` is z.string().default('') in the schema: the default substitutes
  // ONLY an absent/undefined value, so a missing question is valid while a
  // present null (or any other present non-string) is malformed.
  if (question !== undefined && typeof question !== 'string') return null;
  if (typeof created_at !== 'string') return null;
  if (typeof timeout_at !== 'string') return null;
  if (typeof answer_format !== 'string' || !ANSWER_FORMATS.has(answer_format)) return null;
  // `format_payload` is nullish in the schema: absent/null normalizes to {}, but
  // a present non-object is malformed and must not be coerced to a blank card.
  if (format_payload != null && !isRecord(format_payload)) return null;
  // `sensitive` is z.boolean().default(false): an absent value normalizes to
  // false, while a present non-boolean is malformed.
  if (sensitive !== undefined && typeof sensitive !== 'boolean') return null;
  // `server_verified` is z.boolean().optional(): an absent value stays undefined,
  // while a present non-boolean is malformed.
  if (server_verified !== undefined && typeof server_verified !== 'boolean') return null;
  // `channel` is z.string().optional(): the delivery-channel name rides the frame
  // only for a channel-delivered question; absent stays undefined, a present
  // non-string is malformed.
  if (channel !== undefined && typeof channel !== 'string') return null;
  // Attribution fields are each z.string().optional(): `recipient` (delivery
  // address), `origin` (asking run id), `audience` (addressed user_id) ride the
  // frame only when set; absent stays undefined, a present non-string is malformed.
  if (recipient !== undefined && typeof recipient !== 'string') return null;
  if (origin !== undefined && typeof origin !== 'string') return null;
  if (audience !== undefined && typeof audience !== 'string') return null;
  // `media` is z.array(z.unknown()).optional(): the display-only media rides the
  // frame only when the question carries some; absent stays undefined, a present
  // non-array is malformed. The ITEMS stay unknown here (loose by design) — each is
  // validated per item by the renderer, so one bad item never fails this frame.
  if (media !== undefined && !Array.isArray(media)) return null;
  return {
    interaction_id,
    group_id,
    question: typeof question === 'string' ? question : '',
    answer_format: answer_format as Interaction['answer_format'],
    format_payload: isRecord(format_payload) ? format_payload : {},
    created_at,
    timeout_at,
    sensitive: sensitive ?? false,
    ...(typeof server_verified === 'boolean' ? { server_verified } : {}),
    ...(typeof channel === 'string' ? { channel } : {}),
    ...(typeof recipient === 'string' ? { recipient } : {}),
    ...(typeof origin === 'string' ? { origin } : {}),
    ...(typeof audience === 'string' ? { audience } : {}),
    ...(Array.isArray(media) ? { media } : {}),
  };
}

/** The interaction id from an `answered` / `removed` frame, or null. */
function parseId(data: string): string | null {
  const id = parseJson(data)?.interaction_id;
  return typeof id === 'string' ? id : null;
}

/**
 * The live overlay a connection accumulates over the paged base: the tail's own
 * adds (kept whether or not the base already lists them, so a fresher add wins),
 * the answered stamps (wall-clock ms, for the aging sweep), and the tombstones for
 * ids removed on the tail OR aged out of the answered window (a tombstone stops a
 * still-stale seed from re-showing a gone card; ids are never reused). `addEpoch`
 * and `goneEpoch` carry the resync epoch current when an add / a first terminal frame
 * arrived, so the count applies an add (or subtracts a terminal) only while it is not
 * yet folded into the refetched `total`; the merge and the aging sweep ignore them.
 */
interface LiveOverlay {
  readonly adds: Map<string, Interaction>;
  readonly addEpoch: Map<string, number>;
  readonly answeredAt: Map<string, number>;
  readonly removed: Set<string>;
  readonly goneEpoch: Map<string, number>;
}

function emptyOverlay(): LiveOverlay {
  return {
    adds: new Map(),
    addEpoch: new Map(),
    answeredAt: new Map(),
    removed: new Set(),
    goneEpoch: new Map(),
  };
}

/** Fold the paged base and the live overlay into the published, ordered list. */
function merge(seed: readonly Interaction[], live: LiveOverlay): StreamInteraction[] {
  const out = new Map<string, StreamInteraction>();
  for (const item of seed) {
    if (live.removed.has(item.interaction_id)) continue;
    out.set(item.interaction_id, { ...item, answered: live.answeredAt.has(item.interaction_id) });
  }
  for (const [id, item] of live.adds) {
    if (live.removed.has(id)) continue;
    out.set(id, { ...item, answered: live.answeredAt.has(id) });
  }
  return Array.from(out.values());
}

/**
 * The live pending tally: the door's `total` for the seed, plus live adds whose id
 * is absent from the seed AND stamped at or after `countEpoch` (a new question not
 * yet folded into `total`), minus one for every terminal id — answered OR removed —
 * stamped at or after `countEpoch`, deduped per id so an id counts once however many
 * terminal frames it drew. `countEpoch` is the epoch of the last resync whose refetch
 * LANDED (a failed refetch never advances it): a delta stamped before it is already
 * reflected in the fresh `total`, so it is NOT applied again — this is what stops a
 * resync from re-subtracting a terminal it already dropped from `total`, while a
 * failed refetch keeps the prior-epoch deltas applying against the prior total. Every
 * terminal frame a client receives refers to a
 * question inside its own `total` (the stream and the list door apply the same
 * audience filter). One residual race remains: a frame arriving while a refetch is in
 * flight may already be reflected in that refetch's `total` (the resync GET landing
 * after an answer POST), so the raw tally can transiently dip below zero until the
 * next resync reconciles — observed live as a "-1 pending questions" badge. A
 * pending tally below zero is meaningless, so the published count clamps at 0. The
 * clamp covers only the negative symptom: the same race can also leave a transient
 * positive under-count (a double-subtracted question hiding a still-pending one),
 * which reconciles on the next resync, not here.
 */
function pendingCount(
  seed: readonly Interaction[],
  total: number,
  live: LiveOverlay,
  countEpoch: number,
): number {
  const seedIds = new Set(seed.map((item) => item.interaction_id));
  let count = total;
  for (const id of live.adds.keys()) {
    if (!seedIds.has(id) && (live.addEpoch.get(id) ?? 0) >= countEpoch) count += 1;
  }
  const gone = new Set<string>([...live.answeredAt.keys(), ...live.removed]);
  for (const id of gone) {
    if ((live.goneEpoch.get(id) ?? 0) >= countEpoch) count -= 1;
  }
  return Math.max(count, 0);
}

export function useInteractionsStream(options: InteractionsStreamOptions): InteractionsStreamState {
  const { seed, total, onResync } = options;
  const api = useApi();
  const onUnauthorized = useOnUnauthorized();

  const [connectionState, setConnectionState] = useState<{
    connected: boolean;
    error: Error | null;
    disabled: boolean;
  }>({ connected: false, error: null, disabled: false });

  // The live overlay is a ref (mutated in place by the stream loop); the published
  // list is `merge(seed, overlay)` held in state, recomputed on every overlay
  // change (the stream loop) and every seed change (a refetch of the paged base).
  const overlayRef = useRef<LiveOverlay>(emptyOverlay());
  const [interactions, setInteractions] = useState<StreamInteraction[]>(() =>
    merge(seed, overlayRef.current),
  );

  // Resync epochs. `epochRef` increments on each (re)connect and stamps every frame
  // that arrives on that connection; `countEpoch` is set to the connect's epoch only
  // once its refetch landed fresh (onResync resolved true) — a failed refetch leaves
  // it unchanged so prior-epoch deltas keep applying against the prior total.
  // `pendingCount` applies only overlay entries stamped at or after `countEpoch`, so a
  // resync never re-subtracts a terminal it already dropped from the fresh `total`.
  // `countEpoch` is STATE, not a ref: advancing it must republish the derived count
  // even when the reconnect carries no frame after the refetch. Both reset with the
  // overlay on remount.
  const epochRef = useRef(0);
  const [countEpoch, setCountEpoch] = useState(0);

  // The stream effect must not reopen when `seed`/`onResync` change, so they are
  // read through refs the render keeps current.
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const onResyncRef = useRef(onResync);
  onResyncRef.current = onResync;

  // A new paged base (initial load or a refetch) re-merges over the live overlay.
  useEffect(() => {
    setInteractions(merge(seed, overlayRef.current));
  }, [seed]);

  useEffect(() => {
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    const overlay = overlayRef.current;
    let reconnectAttempt = 0;

    // Age answered cards out (the server sends no removal for them): tombstone any
    // past the retention window, then — as a flood backstop — the oldest beyond the
    // count cap. A tombstone (not a bare delete) so a still-stale seed cannot
    // resurrect a card the client has retired.
    const sweepAnswered = () => {
      const now = Date.now();
      const retire = (id: string) => {
        overlay.answeredAt.delete(id);
        overlay.adds.delete(id);
        overlay.addEpoch.delete(id);
        overlay.removed.add(id);
        // The id keeps its original `goneEpoch` (stamped on its answered frame) so
        // moving answered→removed never re-dates it into a fresher resync.
      };
      for (const [id, at] of overlay.answeredAt) {
        if (now - at >= ANSWERED_RETENTION_MS) retire(id);
      }
      if (overlay.answeredAt.size > ANSWERED_CAP) {
        const oldest = [...overlay.answeredAt.entries()].sort((a, b) => a[1] - b[1]);
        for (const [id] of oldest.slice(0, oldest.length - ANSWERED_CAP)) retire(id);
      }
    };

    const surfaceMalformed = (event: string) => {
      setConnectionState((prev) => ({
        ...prev,
        error: new Error(`malformed interaction frame: ${event}`),
      }));
    };

    // A successful data frame sweeps, republishes the merged list, and clears any
    // transient frame-parse error — one bad frame on a healthy stream must not
    // stick. It does NOT refetch: the overlay already updated the list and the
    // derived count, and `onResync` fires on (re)connect only.
    const commit = () => {
      if (aborted()) return;
      sweepAnswered();
      setConnectionState((prev) => (prev.error === null ? prev : { ...prev, error: null }));
      setInteractions(merge(seedRef.current, overlay));
    };

    const applyFrame = (event: string, data: string) => {
      if (event === 'interaction.removed') {
        const id = parseId(data);
        if (id === null) {
          surfaceMalformed(event);
          return;
        }
        overlay.adds.delete(id);
        overlay.addEpoch.delete(id);
        overlay.answeredAt.delete(id);
        overlay.removed.add(id);
        // Stamp the terminal epoch on the FIRST terminal frame for this id only.
        if (!overlay.goneEpoch.has(id)) overlay.goneEpoch.set(id, epochRef.current);
        commit();
        return;
      }
      if (event === 'interaction.answered') {
        const id = parseId(data);
        if (id === null) {
          surfaceMalformed(event);
          return;
        }
        // Stamp the answered time on the FIRST answered frame only; a redelivered
        // answered keeps the original stamp so the retention window is not extended.
        if (!overlay.answeredAt.has(id)) overlay.answeredAt.set(id, Date.now());
        // Stamp the terminal epoch on the FIRST terminal frame for this id only, so a
        // later terminal never re-dates it into a fresher resync.
        if (!overlay.goneEpoch.has(id)) overlay.goneEpoch.set(id, epochRef.current);
        // Promote a seed-origin card into the overlay so it lingers uniformly with a
        // live-add card: the paged base never carries answered items, so a refetch
        // would otherwise drop it before its retention window elapses.
        if (!overlay.adds.has(id)) {
          const seeded = seedRef.current.find((item) => item.interaction_id === id);
          if (seeded !== undefined) {
            overlay.adds.set(id, seeded);
            overlay.addEpoch.set(id, epochRef.current);
          }
        }
        commit();
        return;
      }
      // interaction.add — the full question. Ids are never reused, so a live add
      // simply overwrites any prior copy in place.
      const interaction = parseAddFrame(data);
      if (interaction === null) {
        surfaceMalformed(event);
        return;
      }
      overlay.adds.set(interaction.interaction_id, interaction);
      overlay.addEpoch.set(interaction.interaction_id, epochRef.current);
      commit();
    };

    // The abort signal is the single cancellation source of truth: the cleanup
    // aborts it, and every loop guard reads it fresh.
    const run = async () => {
      while (!aborted()) {
        const openedAt = Date.now();
        try {
          const frames = await api.streamInteractions(controller.signal);
          if (aborted()) return;
          setConnectionState((prev) => ({
            ...prev,
            connected: true,
            error: null,
            disabled: false,
          }));
          // Tail-only: the pending base is not on the stream. Refetch it on every
          // (re)connect under a fresh epoch so anything removed or added while
          // disconnected is reconciled by the fresh page; record that epoch as
          // `countEpoch` only once the refetch LANDED (onResync resolved true), so the
          // count applies only deltas not yet folded into the fresh `total`. A failed
          // refetch (false) leaves `countEpoch` unchanged, so prior-epoch deltas keep
          // applying against the consistent prior total instead of being discarded
          // against a stale one. Every frame on this connection is stamped with `epoch`.
          const epoch = (epochRef.current += 1);
          const landed = await onResyncRef.current();
          if (aborted()) return;
          if (landed) setCountEpoch(epoch);
          for await (const frame of frames) {
            if (aborted()) return;
            applyFrame(frame.event, frame.data);
          }
        } catch (err) {
          if (aborted()) return;
          const error = err instanceof Error ? err : new Error(String(err));
          setConnectionState((prev) => ({ ...prev, connected: false, error }));
          if (error.name === 'ApiUnauthorizedError') {
            // A 401 means the stored credential is dead — reconnecting would just
            // replay the same bad key every delay forever. Treat it as terminal
            // and hand off to the app's 401→login handler, the same path every
            // other data call takes; do not loop.
            onUnauthorized();
            return;
          }
          if (isFeatureDisabled(error)) {
            // A terminal 501 `interactions-not-configured`: the deployment runs no
            // interactions store, so reconnecting would replay the same refusal on
            // every backoff forever (this stream is always-mounted via the shell
            // badge). Stop, and flag the OFF state so the badge disappears and the
            // page renders the muted "not configured" note instead of a red error.
            setConnectionState((prev) => ({ ...prev, connected: false, disabled: true }));
            return;
          }
        }
        // A connection that stayed open at least HEALTHY_CONNECTION_MS proved
        // healthy — clear the reconnect backoff so the next drop reconnects
        // promptly; an immediate accept-then-drop flap does not reset it.
        if (Date.now() - openedAt >= HEALTHY_CONNECTION_MS) reconnectAttempt = 0;
        // Stream ended or errored → wait, then reconnect. Guard before the
        // setState, like every other setState in run(): a microtask scheduled after
        // the `for await` must not write state after the effect cleanup has aborted
        // (and unmounted) the hook.
        if (aborted()) return;
        setConnectionState((prev) => ({ ...prev, connected: false }));
        const ceiling = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt);
        const delay = Math.random() * ceiling;
        reconnectAttempt += 1;
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(() => {
            // Normal wake: drop the abort listener so it does not accumulate
            // across reconnects ({ once: true } only self-removes on firing).
            controller.signal.removeEventListener('abort', onAbort);
            resolve();
          }, delay);
          controller.signal.addEventListener('abort', onAbort, { once: true });
        });
      }
    };

    void run();
    return () => {
      controller.abort();
      // A fresh mount starts from an empty overlay at epoch 0: the effect owns the
      // connection and its live deltas, so a re-run must not inherit the prior run's
      // tail or its epoch stamps.
      overlayRef.current = emptyOverlay();
      epochRef.current = 0;
      setCountEpoch(0);
    };
  }, [api, onUnauthorized]);

  // Derived live, not stored: every overlay mutation republishes `interactions` (a
  // setState), and every seed/total change and every `countEpoch` advance is itself a
  // render, so this recomputes from the current overlay ref on the same render.
  const count = pendingCount(seed, total, overlayRef.current, countEpoch);

  return {
    interactions,
    count,
    connected: connectionState.connected,
    error: connectionState.error,
    disabled: connectionState.disabled,
  };
}
