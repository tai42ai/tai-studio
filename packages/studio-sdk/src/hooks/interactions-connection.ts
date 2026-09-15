/**
 * The SSE reconnect driver behind `useInteractionsStream`: it owns the fetch +
 * ReadableStream tail (via the api-client's `streamInteractions`, never
 * EventSource), the capped-exponential-with-jitter reconnect backoff, the
 * on-(re)connect resync, and the wiring that folds each frame through the pure
 * overlay reducer and republishes the merged list. React state flows in as the
 * dispatchers the hook passes; this file holds no React.
 */
import type { ApiClient, Interaction } from '@tai42/api-client';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import { isFeatureDisabled } from '../feature-disabled';
import {
  emptyOverlay,
  type LiveOverlay,
  merge,
  overlayApplyAdd,
  overlayApplyAnswered,
  overlayApplyRemoved,
  parseAddFrame,
  parseId,
  type StreamInteraction,
  sweepAnswered,
} from './interactions-stream';

// Reconnect backoff: capped exponential with full jitter. The delay for attempt
// n is a random value in [0, min(CAP, BASE * 2**n)); the attempt counter resets
// only when a connection PROVES HEALTHY — it stayed open at least
// `HEALTHY_CONNECTION_MS` — not merely when it opens, so a server that accepts the
// request then drops the body still backs off instead of tight-looping.
const RECONNECT_BASE_MS = 1500;
const RECONNECT_CAP_MS = 30000;
const HEALTHY_CONNECTION_MS = RECONNECT_BASE_MS;

/** The live connection status the hook renders from. */
export interface ConnectionState {
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

/** Everything the driver reads or writes, supplied by the hook's render. */
export interface InteractionsStreamDeps {
  readonly api: ApiClient;
  readonly overlayRef: RefObject<LiveOverlay>;
  readonly epochRef: RefObject<number>;
  readonly seedRef: RefObject<readonly Interaction[]>;
  readonly onResyncRef: RefObject<() => boolean | Promise<boolean>>;
  readonly onUnauthorized: () => void;
  readonly setConnectionState: Dispatch<SetStateAction<ConnectionState>>;
  readonly setInteractions: Dispatch<SetStateAction<StreamInteraction[]>>;
  readonly setCountEpoch: Dispatch<SetStateAction<number>>;
}

/** The driver's per-connection context: the deps plus this run's abort source and overlay. */
interface StreamContext extends InteractionsStreamDeps {
  readonly controller: AbortController;
  readonly overlay: LiveOverlay;
}

function aborted(ctx: StreamContext): boolean {
  return ctx.controller.signal.aborted;
}

function surfaceMalformed(ctx: StreamContext, event: string): void {
  ctx.setConnectionState((prev) => ({
    ...prev,
    error: new Error(`malformed interaction frame: ${event}`),
  }));
}

/**
 * A successful data frame sweeps aged answered cards, republishes the merged list,
 * and clears any transient frame-parse error — one bad frame on a healthy stream
 * must not stick. It does NOT refetch: the overlay already updated the list and the
 * derived count, and the resync fires on (re)connect only.
 */
function commit(ctx: StreamContext): void {
  if (aborted(ctx)) return;
  sweepAnswered(ctx.overlay);
  ctx.setConnectionState((prev) => (prev.error === null ? prev : { ...prev, error: null }));
  ctx.setInteractions(merge(ctx.seedRef.current, ctx.overlay));
}

function applyFrame(ctx: StreamContext, event: string, data: string): void {
  if (event === 'interaction.removed') {
    const id = parseId(data);
    if (id === null) {
      surfaceMalformed(ctx, event);
      return;
    }
    overlayApplyRemoved(ctx.overlay, id, ctx.epochRef.current);
    commit(ctx);
    return;
  }
  if (event === 'interaction.answered') {
    const id = parseId(data);
    if (id === null) {
      surfaceMalformed(ctx, event);
      return;
    }
    overlayApplyAnswered(ctx.overlay, id, ctx.epochRef.current, ctx.seedRef.current);
    commit(ctx);
    return;
  }
  // interaction.add — the full question.
  const interaction = parseAddFrame(data);
  if (interaction === null) {
    surfaceMalformed(ctx, event);
    return;
  }
  overlayApplyAdd(ctx.overlay, interaction, ctx.epochRef.current);
  commit(ctx);
}

/** The resume cursor: the id of the last frame seen on this mount, sent as Last-Event-ID. */
interface ResumeCursor {
  lastEventId: string | undefined;
}

/**
 * Open one connection and consume its frames until the tail ends. Refetches the
 * paged base on connect under a fresh epoch (tail-only carries no backlog) and
 * records that epoch as `countEpoch` only once the refetch LANDED, so the count
 * applies only deltas not yet folded into the fresh `total`.
 */
async function connectAndConsume(ctx: StreamContext, cursor: ResumeCursor): Promise<void> {
  const frames = await ctx.api.streamInteractions(ctx.controller.signal, cursor.lastEventId);
  if (aborted(ctx)) return;
  ctx.setConnectionState((prev) => ({ ...prev, connected: true, error: null, disabled: false }));
  const epoch = (ctx.epochRef.current += 1);
  const landed = await ctx.onResyncRef.current();
  if (aborted(ctx)) return;
  if (landed) ctx.setCountEpoch(epoch);
  for await (const frame of frames) {
    if (aborted(ctx)) return;
    applyFrame(ctx, frame.event, frame.data);
    // Advance the resume cursor to every id-bearing frame (even a malformed one)
    // so a reconnect never re-requests a frame already delivered.
    if (frame.id !== undefined) cursor.lastEventId = frame.id;
  }
}

/** Classify a connection error into whether the driver should stop or reconnect. */
function handleConnectionError(ctx: StreamContext, err: unknown): 'stop' | 'retry' {
  const error = err instanceof Error ? err : new Error(String(err));
  ctx.setConnectionState((prev) => ({ ...prev, connected: false, error }));
  if (error.name === 'ApiUnauthorizedError') {
    // A dead credential — reconnecting would replay the same bad key forever. Hand
    // off to the app's 401→login handler, the same path every other call takes.
    ctx.onUnauthorized();
    return 'stop';
  }
  if (isFeatureDisabled(error)) {
    // A terminal 501 `interactions-not-configured`: reconnecting would replay the
    // same refusal on every backoff forever. Flag the OFF state and stop.
    ctx.setConnectionState((prev) => ({ ...prev, connected: false, disabled: true }));
    return 'stop';
  }
  return 'retry';
}

/** Wait out the backoff for `attempt`, resolving early if the signal aborts. */
function waitBackoff(signal: AbortSignal, attempt: number): Promise<void> {
  const ceiling = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** attempt);
  const delay = Math.random() * ceiling;
  return new Promise<void>((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      // Normal wake: drop the abort listener so it does not accumulate across
      // reconnects ({ once: true } only self-removes on firing).
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** The reconnect loop: connect, consume, back off, repeat until aborted or terminal. */
async function runConnectionLoop(ctx: StreamContext): Promise<void> {
  const cursor: ResumeCursor = { lastEventId: undefined };
  let reconnectAttempt = 0;
  while (!aborted(ctx)) {
    const openedAt = Date.now();
    try {
      await connectAndConsume(ctx, cursor);
      if (aborted(ctx)) return;
    } catch (err) {
      if (aborted(ctx)) return;
      if (handleConnectionError(ctx, err) === 'stop') return;
    }
    // A connection open at least HEALTHY_CONNECTION_MS proved healthy — clear the
    // backoff so the next drop reconnects promptly; an accept-then-drop flap does not.
    if (Date.now() - openedAt >= HEALTHY_CONNECTION_MS) reconnectAttempt = 0;
    if (aborted(ctx)) return;
    ctx.setConnectionState((prev) => ({ ...prev, connected: false }));
    await waitBackoff(ctx.controller.signal, reconnectAttempt);
    reconnectAttempt += 1;
  }
}

/**
 * Start the tail-only interactions stream and return the effect cleanup. The
 * abort signal is the single cancellation source of truth: cleanup aborts it, every
 * loop guard reads it fresh, and a fresh mount starts from an empty overlay at epoch
 * 0 so a re-run never inherits the prior run's tail or its epoch stamps.
 */
export function startInteractionsStream(deps: InteractionsStreamDeps): () => void {
  const controller = new AbortController();
  const ctx: StreamContext = { ...deps, controller, overlay: deps.overlayRef.current };
  void runConnectionLoop(ctx);
  return () => {
    controller.abort();
    deps.overlayRef.current = emptyOverlay();
    deps.epochRef.current = 0;
    deps.setCountEpoch(0);
  };
}
