/** Conversation route, thread, transcript and config schemas. */
import { z } from 'zod';
import { conversationRoute, targetConversationConfig } from './served';
import { pageWindow } from './shared';

// The cross-channel conversation monitor's READ side: the stored routing rows
// (the route picker) from `GET /api/conversations`, a route's threads from
// `GET /api/conversations/{route}/threads`, and one thread's transcript from
// `GET /api/conversations/{route}/transcript?thread_id=`. Timestamps are float
// epoch seconds, not ISO strings, and both paged doors carry the same window
// fields; the transcript adds the direction it was read in.

/** The inbound door a route is bound to: the authed API, or a channel medium. */
export const conversationDoor = z.enum(['api', 'channel']);
export type ConversationDoor = z.infer<typeof conversationDoor>;

/** What a route's turn runs: a registered agent, or a tool dispatch. */
export const conversationTargetKind = z.enum(['agent', 'tool']);
export type ConversationTargetKind = z.infer<typeof conversationTargetKind>;

/**
 * A route's default control mode (`initial_mode`) when a thread carries no
 * per-thread override: `agent` runs the target turn, `manual` suppresses it for an
 * operator to answer. The same value vocabulary as a per-thread mode override, but
 * a distinct concept (the route default vs. one thread's override).
 */
export const conversationMode = z.enum(['agent', 'manual']);
export type ConversationMode = z.infer<typeof conversationMode>;

/**
 * Where a record sits between intake and a terminal outcome. `failed` is the one
 * the monitor surfaces loudly; `shed` and `silent` are terminal by design and
 * never send.
 */
export const conversationDeliveryStatus = z.enum([
  'accepted',
  'pending_delivery',
  'provisional',
  'delivered',
  'failed',
  'shed',
  'silent',
]);
export type ConversationDeliveryStatus = z.infer<typeof conversationDeliveryStatus>;

/** The nature of a turn's outcome, orthogonal to where its delivery stands. */
export const conversationAnswerStatus = z.enum(['answered', 'error', 'silent']);
export type ConversationAnswerStatus = z.infer<typeof conversationAnswerStatus>;

/**
 * Who authored a record's outgoing side. `client` is the ordinary turn the flow
 * answered; `operator` is a message a human sent into the thread, whose text
 * rides `answer` (its `inbound_text` is empty).
 */
export const conversationRecordOrigin = z.enum(['client', 'operator']);
export type ConversationRecordOrigin = z.infer<typeof conversationRecordOrigin>;

export const conversationRoutes = z.object({
  items: z.array(conversationRoute),
  total: z.number(),
});
export type ConversationRoutes = z.infer<typeof conversationRoutes>;

/**
 * The create/replace reply: whether THIS call created the row (vs. replaced an
 * existing one), the row itself (its `callback_secret` withheld), and the
 * `callback_secret` returned ONCE for an `api`-door row (`null` for a `channel`
 * row). The secret signs delivery callbacks and is never re-read from any door, so
 * a caller that needs it must capture it from this reply.
 */
export const conversationRouteWritten = z.object({
  created: z.boolean(),
  route_name: z.string(),
  route: conversationRoute,
  callback_secret: z.string().nullable(),
});
export type ConversationRouteWritten = z.infer<typeof conversationRouteWritten>;

/**
 * The delete reply: `removed` says whether THIS call removed the routing row (a
 * retryable reclamation of orphaned thread indexes answers `false` rather than a
 * 404).
 */
export const conversationRouteDeleted = z.object({
  removed: z.boolean(),
  route_name: z.string(),
});
export type ConversationRouteDeleted = z.infer<typeof conversationRouteDeleted>;

/**
 * One thread of a route, summarized from its newest record. A `thread_id` holds
 * an api-door address (`{principal}/{end user}`, percent-encoded), so it never
 * goes back into a URL as a path segment — the transcript door takes it as a
 * query value.
 */
export const conversationThread = z.object({
  thread_id: z.string(),
  client_address: z.string(),
  last_activity_at: z.number(),
  message_count: z.number(),
  last_delivery_status: conversationDeliveryStatus,
});
export type ConversationThread = z.infer<typeof conversationThread>;

export const conversationThreadsPage = z.object({
  items: z.array(conversationThread),
  ...pageWindow,
});
export type ConversationThreadsPage = z.infer<typeof conversationThreadsPage>;

/**
 * One exchange: the visitor's `inbound_text` — every record answers a message, so
 * both projections always carry it — and the agent's `answer`, plus where that
 * answer's delivery stands. The fields after `updated_at` are ADMIN ONLY —
 * the same door serves a caller-scoped projection that withholds them — so they
 * are optional here and absence means "not published to this reader".
 */
export const conversationMessage = z.object({
  message_id: z.string(),
  route_name: z.string(),
  door: conversationDoor,
  thread_id: z.string(),
  client_address: z.string(),
  caller_principal: z.string().nullable(),
  inbound_text: z.string(),
  answer_status: conversationAnswerStatus.nullable(),
  answer: z.string().nullable(),
  origin: conversationRecordOrigin,
  delivery_status: conversationDeliveryStatus,
  created_at: z.number(),
  updated_at: z.number(),
  channel: z.string().nullable().optional(),
  our_identity: z.string().nullable().optional(),
  provider_message_id: z.string().nullable().optional(),
  callback_url: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  outbound_message_ids: z.array(z.string()).optional(),
  attempts: z.number().optional(),
});
export type ConversationMessage = z.infer<typeof conversationMessage>;

/**
 * The direction a transcript page reads in. `asc` is the reading order (oldest
 * first); `desc` is the live-tail order, where page 1 is always the newest page
 * and paging forward walks BACKWARDS through the thread's history.
 */
export const transcriptOrder = z.enum(['asc', 'desc']);
export type TranscriptOrder = z.infer<typeof transcriptOrder>;

/** A transcript page, echoing the order it was read in. */
export const conversationTranscriptPage = z.object({
  items: z.array(conversationMessage),
  ...pageWindow,
  order: transcriptOrder,
});
export type ConversationTranscriptPage = z.infer<typeof conversationTranscriptPage>;

/**
 * A route-scoped message search (`GET /api/conversations/{route}/messages/search?q`):
 * every record on the route whose text matches `q`, across threads, newest first.
 * The record shape is the transcript's exactly, so a hit renders with the same
 * projection. `truncated` says the match set outran the door's scan cap — surfaced
 * loudly, never a silent cut.
 */
export const conversationMessageSearchPage = z.object({
  items: z.array(conversationMessage),
  ...pageWindow,
});
export type ConversationMessageSearchPage = z.infer<typeof conversationMessageSearchPage>;

/**
 * Who answers a thread's incoming messages: `agent` lets the flow reply on its
 * own; `manual` holds the flow back so a human answers. `source` says whether the
 * setting is the thread's own (`thread`) or inherited from its route (`route`).
 */
export const conversationThreadMode = z.enum(['agent', 'manual']);
export type ConversationThreadMode = z.infer<typeof conversationThreadMode>;

export const conversationThreadModeState = z.object({
  mode: conversationThreadMode,
  source: z.enum(['thread', 'route']),
});
export type ConversationThreadModeState = z.infer<typeof conversationThreadModeState>;

/** The receipt a thread-message write returns: the stored id and its thread. */
export const conversationThreadMessageSent = z.object({
  message_id: z.string(),
  thread_id: z.string(),
});
export type ConversationThreadMessageSent = z.infer<typeof conversationThreadMessageSent>;

/** Every stored per-target config (`GET /api/conversation-configs`). */
export const conversationConfigs = z.object({
  items: z.array(targetConversationConfig),
  total: z.number(),
});
export type ConversationConfigs = z.infer<typeof conversationConfigs>;

/**
 * The upsert reply: whether THIS call created the config (vs. replaced an existing
 * one), its key, and the stored row.
 */
export const conversationConfigWritten = z.object({
  created: z.boolean(),
  target_kind: conversationTargetKind,
  target_name: z.string(),
  config: targetConversationConfig,
});
export type ConversationConfigWritten = z.infer<typeof conversationConfigWritten>;

/** The config-delete reply: `removed` is always `true` on success (an unknown key is a 404). */
export const conversationConfigDeleted = z.object({
  removed: z.boolean(),
  target_kind: conversationTargetKind,
  target_name: z.string(),
});
export type ConversationConfigDeleted = z.infer<typeof conversationConfigDeleted>;

/**
 * The admin-only failed-delivery listing (`GET /api/conversations/messages/failed`):
 * every answer record whose delivery ended `failed`, across every route and caller.
 * The records are the ADMIN projection (delivery bookkeeping and `error` included),
 * so the row shape is {@link conversationMessage} exactly. It is NOT a paged window —
 * the door returns `{items, total}` and nothing more.
 */
export const conversationFailedMessages = z.object({
  items: z.array(conversationMessage),
  total: z.number(),
});
export type ConversationFailedMessages = z.infer<typeof conversationFailedMessages>;

/**
 * The thread-delete reply (`DELETE /api/conversations/{route_name}/thread?thread_id=`).
 * `removed` is a COUNT of the answer records this call deleted — `0` when a prior
 * run already cleared them, when they had aged out under retention, or when the id
 * was never stored (forgetting is absolute, never a 404 on a valid id).
 */
export const conversationThreadDeleted = z.object({
  removed: z.number(),
  route_name: z.string(),
  thread_id: z.string(),
});
export type ConversationThreadDeleted = z.infer<typeof conversationThreadDeleted>;

/**
 * The person-erase reply (`DELETE /api/conversations/persons/{person_id}`).
 * `removed` counts the answer records deleted across the person's routes; `erased`
 * says whether THIS call removed the person row (`false` on a retry or an
 * already-gone person — never a 404).
 */
export const conversationPersonDeleted = z.object({
  person_id: z.string(),
  removed: z.number(),
  erased: z.boolean(),
});
export type ConversationPersonDeleted = z.infer<typeof conversationPersonDeleted>;
