/**
 * `useSse` — the live interactions stream, implemented over the api-client's
 * `streamInteractions` (fetch + ReadableStream, never EventSource).
 *
 * SSE event contract: events `interaction.add` /
 * `interaction.answered` / `interaction.removed` / `interaction.backlog_done`.
 * The `add` frame (backlog on connect + live tail) carries the full question;
 * `answered` / `removed` frames carry only ids. On (re)connect the server
 * replays the current PENDING set as the backlog (answered items are NOT in it);
 * this hook treats that backlog as authoritative for the PENDING set only — a
 * still-pending entry not re-seen by `interaction.backlog_done` is dropped
 * (removed while the client was disconnected), while a locally-ANSWERED entry is
 * exempt from that reconcile so it survives reconnect (reconcile-deleting it
 * would vanish an answered card on the next reconnect, since the pending-only
 * backlog never replays it).
 *
 * ANSWERED-CARD LIFECYCLE: the server emits no removal for an answered card —
 * only `interaction.answered`, never `interaction.removed` for it — so answered
 * cards would otherwise pile up unbounded in the always-mounted badge/inbox. This
 * hook AGES them out itself: an answered card is dropped once it is older than
 * `ANSWERED_RETENTION_MS`, with `ANSWERED_CAP` as a hard newest-N flood backstop.
 * Both are swept lazily on frame/reconnect ticks (the stream carries no idle
 * heartbeat frame), never a per-item timer.
 *
 * `add` frames are at-least-once, so entries are de-duplicated by
 * `interaction_id`, and a redelivered `add` preserves the client `answered` flag.
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

/**
 * The internal map value: a `StreamInteraction` plus the wall-clock ms of its
 * answered frame (`null` while pending), read only by the client-side aging
 * sweep. `answeredAt` is stripped before the interaction is published — it is not
 * part of the public `StreamInteraction` contract.
 */
type TrackedInteraction = StreamInteraction & { readonly answeredAt: number | null };

export interface InteractionsStreamState {
  readonly interactions: StreamInteraction[];
  readonly connected: boolean;
  readonly backlogLoaded: boolean;
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
// only when a connection is proven healthy (`interaction.backlog_done`), not when
// it merely opens — so a flapping server that accepts the request then drops the
// body still backs off instead of tight-looping. A healthy tail-reconnect is
// near-instant while a sustained outage backs off, and the jitter spreads many
// clients apart rather than retrying in lockstep.
const RECONNECT_BASE_MS = 1500;
const RECONNECT_CAP_MS = 30000;

// The server emits no removal for an answered card — only `interaction.answered`,
// never `interaction.removed` for it — so answered cards would otherwise pile up
// unbounded in the always-mounted badge/inbox. The client ages them out: drop an
// answered card ANSWERED_RETENTION_MS after its answered frame (a "recently
// answered" window), keeping at most ANSWERED_CAP as a hard flood backstop. Swept
// lazily on frame/reconnect ticks (the stream carries no idle heartbeat frame),
// never a per-item timer.
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

export function useInteractionsStream(): InteractionsStreamState {
  const api = useApi();
  const onUnauthorized = useOnUnauthorized();
  const [state, setState] = useState<InteractionsStreamState>({
    interactions: [],
    connected: false,
    backlogLoaded: false,
    error: null,
    disabled: false,
  });
  // Source of truth: a dedupe map keyed by interaction_id, rebuilt into the
  // ordered array on every change.
  const mapRef = useRef<Map<string, TrackedInteraction>>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;

    // The published list carries the public shape only — the internal
    // `answeredAt` aging stamp is stripped here.
    const toPublicList = (): StreamInteraction[] =>
      Array.from(mapRef.current.values(), ({ answeredAt: _answeredAt, ...rest }) => rest);

    // Age answered cards out (the server sends no removal for them): drop any past
    // the retention window, then — as a flood backstop — the oldest beyond the
    // count cap. Pending items (`answeredAt === null`) are never touched. Called on
    // every frame/reconnect tick so the always-mounted badge cannot grow unbounded.
    const sweepAnswered = () => {
      const now = Date.now();
      const answered: { id: string; answeredAt: number }[] = [];
      for (const entry of mapRef.current.values()) {
        if (entry.answeredAt !== null) {
          answered.push({ id: entry.interaction_id, answeredAt: entry.answeredAt });
        }
      }
      for (const { id, answeredAt } of answered) {
        if (now - answeredAt >= ANSWERED_RETENTION_MS) mapRef.current.delete(id);
      }
      const live = answered.filter(({ id }) => mapRef.current.has(id));
      if (live.length > ANSWERED_CAP) {
        live.sort((a, b) => a.answeredAt - b.answeredAt); // oldest first
        for (const { id } of live.slice(0, live.length - ANSWERED_CAP)) {
          mapRef.current.delete(id);
        }
      }
    };

    // A successful data frame rebuilds the list and clears any transient
    // frame-parse error — one bad frame on a healthy stream must not stick.
    const publish = () => {
      sweepAnswered();
      setState((prev) => ({
        ...prev,
        interactions: toPublicList(),
        error: null,
      }));
    };

    const surfaceMalformed = (event: string) => {
      setState((prev) => ({ ...prev, error: new Error(`malformed interaction frame: ${event}`) }));
    };

    // Per-connection reconcile state: the replayed backlog is the PENDING set
    // only, so a still-pending id not re-seen by `interaction.backlog_done` is
    // dropped (removed while disconnected); a locally-answered id is exempt — it
    // survives reconnect and is aged out client-side (see `sweepAnswered`).
    let reconciling = false;
    let seenInBacklog = new Set<string>();
    // Consecutive failed reconnect attempts. Reset only when a connection proves
    // healthy (`interaction.backlog_done`), NOT merely when it opens — a server
    // that accepts the request then drops the body would otherwise reset every
    // time and never back off.
    let reconnectAttempt = 0;
    const beginConnection = () => {
      reconciling = true;
      seenInBacklog = new Set();
    };

    const applyFrame = (event: string, data: string) => {
      if (event === 'interaction.backlog_done') {
        if (reconciling) {
          // The pending-only backlog is authoritative for pending items alone:
          // drop a still-pending id it did not replay (removed while
          // disconnected), but NEVER an answered id — that is terminal and the
          // backlog never carries it, so reconcile-deleting it would vanish an
          // answered card on every reconnect.
          for (const [id, item] of mapRef.current) {
            if (!seenInBacklog.has(id) && !item.answered) mapRef.current.delete(id);
          }
          reconciling = false;
        }
        // A completed backlog is proof the connection is healthy — clear the
        // reconnect backoff so the next drop reconnects promptly.
        reconnectAttempt = 0;
        sweepAnswered();
        setState((prev) => ({
          ...prev,
          interactions: toPublicList(),
          backlogLoaded: true,
        }));
        return;
      }
      if (event === 'interaction.removed') {
        const id = parseId(data);
        if (id === null) {
          surfaceMalformed(event);
          return;
        }
        mapRef.current.delete(id);
        publish();
        return;
      }
      if (event === 'interaction.answered') {
        const id = parseId(data);
        if (id === null) {
          surfaceMalformed(event);
          return;
        }
        // The answered frame carries only ids — flip the existing item's flag,
        // keeping its question/format. An answered event for an item we never saw
        // has nothing to show. Stamp the answered time on the FIRST answered frame
        // only; a redelivered answered keeps the original stamp so the retention
        // window is not extended.
        const existing = mapRef.current.get(id);
        if (existing) {
          const answeredAt = existing.answered ? existing.answeredAt : Date.now();
          mapRef.current.set(id, { ...existing, answered: true, answeredAt });
        }
        publish();
        return;
      }
      // interaction.add — the full question.
      const interaction = parseAddFrame(data);
      if (interaction === null) {
        surfaceMalformed(event);
        return;
      }
      if (reconciling) seenInBacklog.add(interaction.interaction_id);
      // Dedupe by id; a redelivered add preserves the client answered flag (and
      // its aging stamp) so a prior `answered` is not undone by an at-least-once
      // replay. A fresh (pending) add carries no stamp until its answered frame.
      const existing = mapRef.current.get(interaction.interaction_id);
      const answered = existing?.answered ?? false;
      mapRef.current.set(interaction.interaction_id, {
        ...interaction,
        answered,
        answeredAt: answered ? (existing?.answeredAt ?? null) : null,
      });
      publish();
    };

    // The abort signal is the single cancellation source of truth: the cleanup
    // aborts it, and every loop guard reads it fresh.
    const run = async () => {
      while (!aborted()) {
        try {
          const frames = await api.streamInteractions(controller.signal);
          if (aborted()) return;
          beginConnection();
          // Clear `disabled` on a fresh connect: the terminal-501 branch sets it and
          // returns, so within a single mount this only ever writes false-over-false —
          // but should the effect re-run and a later stream connect, the hook must not
          // carry a stale OFF flag. Correct-by-construction, not load-bearing today.
          setState((prev) => ({ ...prev, connected: true, error: null, disabled: false }));
          for await (const frame of frames) {
            if (aborted()) return;
            applyFrame(frame.event, frame.data);
          }
        } catch (err) {
          if (aborted()) return;
          const error = err instanceof Error ? err : new Error(String(err));
          setState((prev) => ({ ...prev, connected: false, error }));
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
            setState((prev) => ({ ...prev, connected: false, disabled: true }));
            return;
          }
        }
        // Stream ended or errored → wait, then reconnect (server replays backlog).
        // Guard before the setState, like every other setState in run(): a
        // microtask scheduled after the `for await` must not write state after
        // the effect cleanup has aborted (and unmounted) the hook.
        if (aborted()) return;
        setState((prev) => ({ ...prev, connected: false }));
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
    };
  }, [api, onUnauthorized]);

  return state;
}
