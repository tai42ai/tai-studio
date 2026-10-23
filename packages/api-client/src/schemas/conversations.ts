/** Conversation route, thread, transcript and config schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

// The cross-channel conversation monitor's READ side: the stored routing rows
// (the route picker) from `GET /api/conversations`, a route's threads from
// `GET /api/conversations/{route}/threads`, and one thread's transcript from
// `GET /api/conversations/{route}/transcript?thread_id=`. Timestamps are float
// epoch seconds, not ISO strings, and both paged doors carry the same window
// fields; the transcript adds the direction it was read in. Each listing reports
// `unreadable`, the stored rows it could not read.

/** The inbound door a route is bound to: the authed API, or a channel medium. */
export const conversationDoor = openapi.conversationRecordView.shape.door;
export type ConversationDoor = z.infer<typeof conversationDoor>;

/** What a route's turn runs: a registered agent, or a tool dispatch. */
export const conversationTargetKind = openapi.conversationConfigSetResult.shape.target_kind;
export type ConversationTargetKind = z.infer<typeof conversationTargetKind>;

/**
 * A route's default control mode (`initial_mode`) when a thread carries no
 * per-thread override: `agent` runs the target turn, `manual` suppresses it for an
 * operator to answer. The same value vocabulary as a per-thread mode override, but
 * a distinct concept (the route default vs. one thread's override).
 */
export const conversationMode = openapi.threadModeView.shape.mode;
export type ConversationMode = z.infer<typeof conversationMode>;

/**
 * Where a record sits between intake and a terminal outcome. `failed` is the one
 * the monitor surfaces loudly; `shed` and `silent` are terminal by design and
 * never send. `merged` and `superseded` are the overlap-policy outcomes: this
 * record's text was carried into (`merged`) or dropped in favour of (`superseded`)
 * a later turn, named by `successor_id`; both are terminal and never send.
 * A send record starts `sending` once it is written and its send has begun, and
 * becomes `outcome_unknown` when the send never reported an outcome (it passed its
 * bound, it was cancelled mid-call, or the process stopped), so the message may or may
 * not have reached the participant; `outcome_unknown` is terminal, never re-sent, and
 * surfaced as loudly as `failed`. A `sending` record is not in the thread index, so no transcript, thread
 * list or search ever shows one.
 */
export const conversationDeliveryStatus = openapi.deliveryStatus;
export type ConversationDeliveryStatus = z.infer<typeof conversationDeliveryStatus>;

/** The nature of a turn's outcome, orthogonal to where its delivery stands. */
export const conversationAnswerStatus = openapi.conversationRecordView.shape.answer_status
  .unwrap()
  .unwrap();
export type ConversationAnswerStatus = z.infer<typeof conversationAnswerStatus>;

/**
 * Who authored a record's outgoing side. `client` is the ordinary turn the flow
 * answered; `operator` is a message a human sent into the thread; `send` is a
 * message the platform sent on its own (a notification, an ask, a notice), named
 * by `sent_by`. An `operator` or `send` record answers no message: its text rides
 * `answer` and its `inbound_text` is empty.
 */
export const conversationRecordOrigin = openapi.conversationRecordView.shape.origin;
export type ConversationRecordOrigin = z.infer<typeof conversationRecordOrigin>;

/** One stored routing row as a read door serves it, its `callback_secret` withheld. */
export const conversationRouteView = openapi.conversationRouteViewBody;
export type ConversationRouteView = z.infer<typeof conversationRouteView>;

export const conversationRoutes = openapi.conversationRouteListEnvelope;
export type ConversationRoutes = z.infer<typeof conversationRoutes>;

/**
 * The create/replace reply: whether THIS call created the row (vs. replaced an
 * existing one), the row itself (its `callback_secret` withheld), and the
 * `callback_secret` returned ONCE for an `api`-door row (`null` for a `channel`
 * row). The secret signs delivery callbacks and is never re-read from any door, so
 * a caller that needs it must capture it from this reply.
 */
export const conversationRouteWritten = openapi.conversationRouteCreateResult;
export type ConversationRouteWritten = z.infer<typeof conversationRouteWritten>;

/**
 * The delete reply: `removed` says whether THIS call removed the routing row (a
 * retryable reclamation of orphaned thread indexes answers `false` rather than a
 * 404).
 */
export const conversationRouteDeleted = openapi.routeRemoveResult;
export type ConversationRouteDeleted = z.infer<typeof conversationRouteDeleted>;

/**
 * One thread of a route, summarized from its newest record. A `thread_id` holds
 * an api-door address (`{principal}/{end user}`, percent-encoded), so it never
 * goes back into a URL as a path segment — the transcript door takes it as a
 * query value.
 */
export const conversationThread = openapi.threadSummaryRow;
export type ConversationThread = z.infer<typeof conversationThread>;

export const conversationThreadsPage = openapi.threadSummaryEnvelope;
export type ConversationThreadsPage = z.infer<typeof conversationThreadsPage>;

/**
 * One exchange: the visitor's `inbound_text` and the agent's `answer`, plus where
 * that answer's delivery stands. An `operator` or `send` record answers no message,
 * so its `inbound_text` is empty and its text rides `answer`. A send record names
 * what sent it in `sent_by`, and carries `turn_message_id` when it was sent during a
 * turn to that turn's own participant; an ask's send record carries `ask`, and the
 * participant's reply over the channel in `ask_reply`, whose `answer` is `null` for a
 * sensitive ask. `inbound_reply_to` and `ask_reply.reply_to` name the earlier message
 * the visitor's message or the reply quotes, with its text when the thread holds it.
 * `successor_id` names the later turn a `merged` or `superseded` record was folded
 * into, `null` on every other outcome. The delivery bookkeeping fields (`channel`,
 * `our_identity`, `provider_message_id`, `callback_url`, `error`, `attempts`, the
 * per-part `sends`, every `ask` field but `sensitive` and every `ask_reply` field but
 * `answer` and `reply_to`) are ADMIN ONLY — the same door serves a caller-scoped
 * projection that withholds them, read here as `null` (`sends` as an empty list).
 */
export const conversationMessage = openapi.conversationRecordView;
export type ConversationMessage = z.infer<typeof conversationMessage>;

/**
 * The direction a transcript page reads in. `asc` is the reading order (oldest
 * first); `desc` is the live-tail order, where page 1 is always the newest page
 * and paging forward walks BACKWARDS through the thread's history.
 */
export const transcriptOrder = openapi.transcriptEnvelope.shape.order;
export type TranscriptOrder = z.infer<typeof transcriptOrder>;

/**
 * A transcript page, echoing the order it was read in; `person_id` names the person a
 * person thread aggregates (`null` for a route-keyed thread).
 */
export const conversationTranscriptPage = openapi.transcriptEnvelope;
export type ConversationTranscriptPage = z.infer<typeof conversationTranscriptPage>;

/**
 * A route-scoped message search (`GET /api/conversations/{route}/messages/search?q`):
 * every record on the route whose text matches `q`, across threads, newest first.
 * The record shape is the transcript's exactly, so a hit renders with the same
 * projection. `truncated` says the match set outran the door's scan cap — surfaced
 * loudly, never a silent cut.
 */
export const conversationMessageSearchPage = openapi.messageSearchEnvelope;
export type ConversationMessageSearchPage = z.infer<typeof conversationMessageSearchPage>;

/**
 * Who answers a thread's incoming messages: `agent` lets the flow reply on its
 * own; `manual` holds the flow back so a human answers. `source` says whether the
 * setting is the thread's own (`thread`) or inherited from its route (`route`).
 */
export const conversationThreadMode = openapi.threadModeView.shape.mode;
export type ConversationThreadMode = z.infer<typeof conversationThreadMode>;

export const conversationThreadModeState = openapi.threadModeView;
export type ConversationThreadModeState = z.infer<typeof conversationThreadModeState>;

/** The receipt a thread-message write returns: the stored id and its thread. */
export const conversationThreadMessageSent = openapi.threadMessageAck;
export type ConversationThreadMessageSent = z.infer<typeof conversationThreadMessageSent>;

/** Every stored per-target config (`GET /api/conversation-configs`). */
export const conversationConfigs = openapi.conversationConfigListEnvelope;
export type ConversationConfigs = z.infer<typeof conversationConfigs>;

/**
 * The upsert reply: whether THIS call created the config (vs. replaced an existing
 * one), its key, and the stored row.
 */
export const conversationConfigWritten = openapi.conversationConfigSetResult;
export type ConversationConfigWritten = z.infer<typeof conversationConfigWritten>;

/** The config-delete reply: `removed` is always `true` on success (an unknown key is a 404). */
export const conversationConfigDeleted = openapi.conversationConfigDeleteResult;
export type ConversationConfigDeleted = z.infer<typeof conversationConfigDeleted>;

/**
 * The admin-only failed-delivery listing (`GET /api/conversations/messages/failed`):
 * every answer record whose delivery ended `failed`, across every route and caller.
 * The records are the ADMIN projection (delivery bookkeeping and `error` included),
 * so the row shape is {@link conversationMessage} exactly. It is NOT a paged window —
 * the door returns `{items, total, unreadable}` and nothing more.
 */
export const conversationFailedMessages = openapi.failedConversationsEnvelope;
export type ConversationFailedMessages = z.infer<typeof conversationFailedMessages>;

/**
 * The thread-delete reply (`DELETE /api/conversations/{route_name}/thread?thread_id=`).
 * `removed` is a COUNT of the answer records this call deleted — `0` when a prior
 * run already cleared them, when they had aged out under retention, or when the id
 * was never stored (forgetting is absolute, never a 404 on a valid id).
 */
export const conversationThreadDeleted = openapi.threadDeleteResult;
export type ConversationThreadDeleted = z.infer<typeof conversationThreadDeleted>;

/**
 * The person-erase reply (`DELETE /api/conversations/persons/{person_id}`).
 * `removed` counts the answer records deleted across the person's routes; `erased`
 * says whether THIS call removed the person row (`false` on a retry or an
 * already-gone person — never a 404).
 */
export const conversationPersonDeleted = openapi.personDeleteResult;
export type ConversationPersonDeleted = z.infer<typeof conversationPersonDeleted>;
