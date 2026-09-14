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
 * client `answered` flag set on an item the tail reported answered. The published
 * `count` is the live PENDING tally, derived from the same overlay without a
 * refetch, reconciled by EPOCH so a resync never double-counts.
 *
 * The pure frame parsing, overlay reducer and derived projections live in
 * `interactions-stream`; the fetch/reconnect/resync loop lives in
 * `interactions-connection`. This hook holds the React state those two operate on
 * and wires them together: the overlay is a ref (mutated in place by the driver),
 * the published list is `merge(seed, overlay)` held in state and recomputed on
 * every overlay change and every seed change, and the count is derived on render.
 *
 * The `Interaction` type is imported type-only (no runtime dep on api-client);
 * `answered` is not a wire field — it is a client flag flipped on an
 * `interaction.answered` event.
 */
import { useEffect, useRef, useState } from 'react';
import type { Interaction } from '@tai42/api-client';

import { useApi } from './useApi';
import { useOnUnauthorized } from './useUnauthorized';
import {
  emptyOverlay,
  merge,
  pendingCount,
  type LiveOverlay,
  type StreamInteraction,
} from './interactions-stream';
import { startInteractionsStream, type ConnectionState } from './interactions-connection';

export type { StreamInteraction } from './interactions-stream';

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
   * abandoned and the consumer renders the muted OFF state instead of a red error.
   */
  readonly disabled: boolean;
}

export function useInteractionsStream(options: InteractionsStreamOptions): InteractionsStreamState {
  const { seed, total, onResync } = options;
  const api = useApi();
  const onUnauthorized = useOnUnauthorized();

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    error: null,
    disabled: false,
  });

  // The live overlay is a ref (mutated in place by the connection driver); the
  // published list is `merge(seed, overlay)` held in state, recomputed on every
  // overlay change (the driver) and every seed change (a refetch of the paged base).
  const overlayRef = useRef<LiveOverlay>(emptyOverlay());
  const [interactions, setInteractions] = useState<StreamInteraction[]>(() =>
    merge(seed, overlayRef.current),
  );

  // Resync epochs. `epochRef` increments on each (re)connect and stamps every frame;
  // `countEpoch` advances to a connect's epoch only once its refetch landed fresh.
  // `countEpoch` is STATE, not a ref: advancing it must republish the derived count
  // even when the reconnect carries no frame after the refetch.
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

  useEffect(
    () =>
      startInteractionsStream({
        api,
        overlayRef,
        epochRef,
        seedRef,
        onResyncRef,
        onUnauthorized,
        setConnectionState,
        setInteractions,
        setCountEpoch,
      }),
    [api, onUnauthorized],
  );

  // Derived live, not stored: every overlay mutation republishes `interactions`, and
  // every seed/total change and every `countEpoch` advance is itself a render, so
  // this recomputes from the current overlay ref on the same render.
  const count = pendingCount(seed, total, overlayRef.current, countEpoch);

  return {
    interactions,
    count,
    connected: connectionState.connected,
    error: connectionState.error,
    disabled: connectionState.disabled,
  };
}
