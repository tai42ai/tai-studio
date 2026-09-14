/**
 * The pure reducer behind the live interactions inbox: frame parsing, the live
 * overlay accumulated over the paged base, and the two derived projections
 * (`merge` → the published list, `pendingCount` → the live badge tally). No React,
 * no I/O — the connection driver owns the SSE loop and feeds frames through here.
 */
import type { Interaction } from '@tai42/api-client';

import { isRecord } from '../guards';

/** A live interaction plus the client-maintained `answered` flag. */
export type StreamInteraction = Interaction & { readonly answered: boolean };

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

/** The strictly-required frame fields, narrowed once so the assembly needs no casts. */
interface RequiredFrameFields {
  interaction_id: string;
  group_id: string;
  created_at: string;
  timeout_at: string;
  answer_format: Interaction['answer_format'];
}

/**
 * The strict-required fields: `interaction_id`, `group_id`, `created_at`,
 * `timeout_at` must each be a string and `answer_format` a known enum value.
 * `question` is `z.string().default('')` — a missing question is valid (normalized
 * to `''` on assembly) but a present non-string is malformed; `format_payload` is
 * nullish — absent/null is valid but a present non-object is malformed.
 */
function requiredFieldsValid(
  obj: Record<string, unknown>,
): obj is Record<string, unknown> & RequiredFrameFields {
  if (typeof obj.interaction_id !== 'string') return false;
  if (typeof obj.group_id !== 'string') return false;
  if (obj.question !== undefined && typeof obj.question !== 'string') return false;
  if (typeof obj.created_at !== 'string') return false;
  if (typeof obj.timeout_at !== 'string') return false;
  if (typeof obj.answer_format !== 'string' || !ANSWER_FORMATS.has(obj.answer_format)) return false;
  if (obj.format_payload != null && !isRecord(obj.format_payload)) return false;
  return true;
}

/**
 * The optional fields, each rejected only when PRESENT with the wrong type: an
 * absent value stays absent (or takes its schema default on assembly). `media`
 * items stay unknown by design — each is validated per item by the renderer.
 */
function optionalFieldsValid(obj: Record<string, unknown>): boolean {
  if (obj.sensitive !== undefined && typeof obj.sensitive !== 'boolean') return false;
  if (obj.server_verified !== undefined && typeof obj.server_verified !== 'boolean') return false;
  if (obj.channel !== undefined && typeof obj.channel !== 'string') return false;
  if (obj.recipient !== undefined && typeof obj.recipient !== 'string') return false;
  if (obj.origin !== undefined && typeof obj.origin !== 'string') return false;
  if (obj.audience !== undefined && typeof obj.audience !== 'string') return false;
  if (obj.media !== undefined && !Array.isArray(obj.media)) return false;
  return true;
}

/** Assemble the validated frame into an `Interaction`, applying the schema defaults. */
function buildInteraction(obj: Record<string, unknown> & RequiredFrameFields): Interaction {
  return {
    interaction_id: obj.interaction_id,
    group_id: obj.group_id,
    question: typeof obj.question === 'string' ? obj.question : '',
    answer_format: obj.answer_format,
    format_payload: isRecord(obj.format_payload) ? obj.format_payload : {},
    created_at: obj.created_at,
    timeout_at: obj.timeout_at,
    sensitive: typeof obj.sensitive === 'boolean' ? obj.sensitive : false,
    ...(typeof obj.server_verified === 'boolean' ? { server_verified: obj.server_verified } : {}),
    ...(typeof obj.channel === 'string' ? { channel: obj.channel } : {}),
    ...(typeof obj.recipient === 'string' ? { recipient: obj.recipient } : {}),
    ...(typeof obj.origin === 'string' ? { origin: obj.origin } : {}),
    ...(typeof obj.audience === 'string' ? { audience: obj.audience } : {}),
    ...(Array.isArray(obj.media) ? { media: obj.media } : {}),
  };
}

/**
 * Validate an `interaction.add` frame into an `Interaction`, or null when it is
 * malformed. This mirrors the api-client `interaction` zod schema exactly — it
 * accepts what that schema accepts, no more, no less — so the caller surfaces a
 * malformed frame as an error rather than rendering a blank card, and never
 * silently coerces one.
 */
export function parseAddFrame(data: string): Interaction | null {
  const obj = parseJson(data);
  if (obj === null) return null;
  if (!requiredFieldsValid(obj) || !optionalFieldsValid(obj)) return null;
  return buildInteraction(obj);
}

/** The interaction id from an `answered` / `removed` frame, or null. */
export function parseId(data: string): string | null {
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
export interface LiveOverlay {
  readonly adds: Map<string, Interaction>;
  readonly addEpoch: Map<string, number>;
  readonly answeredAt: Map<string, number>;
  readonly removed: Set<string>;
  readonly goneEpoch: Map<string, number>;
}

export function emptyOverlay(): LiveOverlay {
  return {
    adds: new Map(),
    addEpoch: new Map(),
    answeredAt: new Map(),
    removed: new Set(),
    goneEpoch: new Map(),
  };
}

/** Record an `interaction.add`: a live add overwrites any prior copy in place. */
export function overlayApplyAdd(
  overlay: LiveOverlay,
  interaction: Interaction,
  epoch: number,
): void {
  overlay.adds.set(interaction.interaction_id, interaction);
  overlay.addEpoch.set(interaction.interaction_id, epoch);
}

/**
 * Record an `interaction.answered`. The answered time and terminal epoch are
 * stamped on the FIRST answered frame only (a redelivery keeps the original stamp,
 * so the retention window is not extended and a later terminal never re-dates it
 * into a fresher resync). A seed-origin card is promoted into the overlay so it
 * lingers uniformly with a live-add card, since the paged base never carries
 * answered items and a refetch would otherwise drop it before its window elapses.
 */
export function overlayApplyAnswered(
  overlay: LiveOverlay,
  id: string,
  epoch: number,
  seed: readonly Interaction[],
): void {
  if (!overlay.answeredAt.has(id)) overlay.answeredAt.set(id, Date.now());
  if (!overlay.goneEpoch.has(id)) overlay.goneEpoch.set(id, epoch);
  if (!overlay.adds.has(id)) {
    const seeded = seed.find((item) => item.interaction_id === id);
    if (seeded !== undefined) {
      overlay.adds.set(id, seeded);
      overlay.addEpoch.set(id, epoch);
    }
  }
}

/** Record an `interaction.removed`: tombstone the id and stamp its first terminal epoch. */
export function overlayApplyRemoved(overlay: LiveOverlay, id: string, epoch: number): void {
  overlay.adds.delete(id);
  overlay.addEpoch.delete(id);
  overlay.answeredAt.delete(id);
  overlay.removed.add(id);
  if (!overlay.goneEpoch.has(id)) overlay.goneEpoch.set(id, epoch);
}

/**
 * Age answered cards out (the server sends no removal for them): tombstone any past
 * the retention window, then — as a flood backstop — the oldest beyond the count
 * cap. A tombstone (not a bare delete) so a still-stale seed cannot resurrect a card
 * the client has retired; the id keeps its original `goneEpoch` so moving
 * answered→removed never re-dates it into a fresher resync.
 */
export function sweepAnswered(overlay: LiveOverlay): void {
  const now = Date.now();
  const retire = (id: string) => {
    overlay.answeredAt.delete(id);
    overlay.adds.delete(id);
    overlay.addEpoch.delete(id);
    overlay.removed.add(id);
  };
  for (const [id, at] of overlay.answeredAt) {
    if (now - at >= ANSWERED_RETENTION_MS) retire(id);
  }
  if (overlay.answeredAt.size > ANSWERED_CAP) {
    const oldest = [...overlay.answeredAt.entries()].sort((a, b) => a[1] - b[1]);
    for (const [id] of oldest.slice(0, oldest.length - ANSWERED_CAP)) retire(id);
  }
}

/** Fold the paged base and the live overlay into the published, ordered list. */
export function merge(seed: readonly Interaction[], live: LiveOverlay): StreamInteraction[] {
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
 * failed refetch keeps the prior-epoch deltas applying against the prior total. One
 * residual race remains: a frame arriving while a refetch is in flight may already be
 * reflected in that refetch's `total`, so the raw tally can transiently dip below zero
 * until the next resync reconciles. A pending tally below zero is meaningless, so the
 * published count clamps at 0; the clamp covers only the negative symptom (a transient
 * positive under-count reconciles on the next resync, not here).
 */
export function pendingCount(
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
