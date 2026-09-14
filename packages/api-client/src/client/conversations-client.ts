/** Conversation route, thread, transcript, config and admin sub-client. */
import * as s from '../schemas';
import { encodeSegment } from '../http';
import type { Transport } from './transport';

/**
 * The thread-list filter set (GET `/api/conversations/{route}/threads` query
 * params, alongside `page`/`pageSize`). `status` narrows to threads whose newest
 * record sits in one delivery state; `address` is a SUBSTRING match over the
 * client address. Both omitted when undefined — an unfiltered listing.
 */
export interface ConversationThreadFilters {
  readonly status?: s.ConversationDeliveryStatus;
  readonly address?: string;
}

/**
 * One transcript read (GET `/api/conversations/{route}/transcript` query params).
 * `order` is not a default the caller may skip: `asc` reads the thread from its
 * beginning and `desc` from its newest end, and which one a screen wants is a
 * decision that screen must make. `q` narrows the page to records whose text
 * matches it (a SUBSTRING), omitted for an unfiltered read.
 */
export interface ConversationTranscriptQuery {
  readonly routeName: string;
  readonly threadId: string;
  readonly page: number;
  readonly pageSize: number;
  readonly order: s.TranscriptOrder;
  readonly q?: string;
}

/**
 * A route-scoped message search (GET
 * `/api/conversations/{route}/messages/search` query params). `q` is the required
 * needle — a substring over record text, across every thread on the route; `page`
 * is supplied per-request by the infinite query.
 */
export interface ConversationMessageSearchQuery {
  readonly routeName: string;
  readonly q: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Body for sending a message into a thread (POST
 * `/api/conversations/{route}/thread/messages`). `thread_id` names the thread
 * (an api-door address, passed as a value); `text` is the message. `address` is
 * an optional override the server otherwise derives from the thread, omitted
 * when undefined.
 */
export interface ConversationThreadMessageBody {
  readonly thread_id: string;
  readonly text: string;
  readonly address?: string;
}

/** Route CRUD: the stored routing rows and their create/replace/delete doors. */
function conversationRouteMethods(t: Transport) {
  const { req } = t;
  return {
    // The stored routing rows, each with its `callback_secret` withheld — the
    // conversation monitor's route picker.
    listConversationRoutes: (signal?: AbortSignal) =>
      req('/api/conversations', s.conversationRoutes, { signal }),
    // Create or REPLACE a route (an UPSERT: the same door is the create and the
    // edit path). `route_name` rides the URL path AND the body; the door rejects a
    // disagreeing pair, so both come from the one create object. The reply carries
    // the freshly-minted `callback_secret` for an `api`-door row, returned ONCE.
    createOrReplaceConversationRoute: (route: s.ConversationRouteCreate) =>
      req(`/api/conversations/${encodeSegment(route.route_name)}`, s.conversationRouteWritten, {
        method: 'POST',
        body: route,
      }),
    // Delete a route by name (destructive + authority-changing server-side): it
    // drops the routing row and reclaims the thread indexes it owned.
    deleteConversationRoute: (routeName: string) =>
      req(`/api/conversations/${encodeSegment(routeName)}`, s.conversationRouteDeleted, {
        method: 'DELETE',
      }),
  };
}

/** Thread reads and writes: listings, transcript, message search, send, reply mode. */
function conversationThreadMethods(t: Transport) {
  const { req } = t;
  return {
    // One route's threads, newest activity first. Admin-only server-side: a
    // listing spans every caller on the route, so a scoped session gets a 403.
    listConversationThreads: (
      routeName: string,
      page: number,
      pageSize: number,
      filters: ConversationThreadFilters = {},
      signal?: AbortSignal,
    ) =>
      req(`/api/conversations/${encodeSegment(routeName)}/threads`, s.conversationThreadsPage, {
        signal,
        query: { page, pageSize, status: filters.status, address: filters.address },
      }),
    // One thread's transcript, caller-scoped, read in the asked-for direction.
    // The `thread_id` rides the QUERY STRING, never the path: it embeds the api
    // door's `{principal}/{end user}` address with the principal already
    // percent-encoded, which a path segment would have to encode a second time
    // and the server would then decode once too few. A query value is decoded
    // exactly once whatever it holds, so it is passed through verbatim.
    readConversationTranscript: (query: ConversationTranscriptQuery, signal?: AbortSignal) =>
      req(
        `/api/conversations/${encodeSegment(query.routeName)}/transcript`,
        s.conversationTranscriptPage,
        {
          signal,
          query: {
            thread_id: query.threadId,
            page: query.page,
            pageSize: query.pageSize,
            order: query.order,
            q: query.q,
          },
        },
      ),
    // Search every record on a route by text, across threads, newest first. The
    // needle rides the QUERY (`q`); paging is the infinite query's own window. The
    // page's `truncated` flag says the match set outran the door's scan cap.
    searchConversationMessages: (query: ConversationMessageSearchQuery, signal?: AbortSignal) =>
      req(
        `/api/conversations/${encodeSegment(query.routeName)}/messages/search`,
        s.conversationMessageSearchPage,
        { signal, query: { q: query.q, page: query.page, pageSize: query.pageSize } },
      ),
    // Send a human message into a thread. The `thread_id` rides the BODY (a POST,
    // never a path segment) — same encode-once reasoning as the transcript read.
    sendConversationThreadMessage: (routeName: string, body: ConversationThreadMessageBody) =>
      req(
        `/api/conversations/${encodeSegment(routeName)}/thread/messages`,
        s.conversationThreadMessageSent,
        { method: 'POST', body },
      ),
    // Read a thread's reply mode (`agent`/`manual`) and where it comes from. The
    // `thread_id` rides the QUERY value, encoded once, as the transcript read does.
    getConversationThreadMode: (routeName: string, threadId: string, signal?: AbortSignal) =>
      req(
        `/api/conversations/${encodeSegment(routeName)}/thread/mode`,
        s.conversationThreadModeState,
        { signal, query: { thread_id: threadId } },
      ),
    // Flip a thread's reply mode. The `thread_id` rides the BODY (a PUT).
    setConversationThreadMode: (
      routeName: string,
      threadId: string,
      mode: s.ConversationThreadMode,
    ) =>
      req(
        `/api/conversations/${encodeSegment(routeName)}/thread/mode`,
        s.conversationThreadModeState,
        { method: 'PUT', body: { thread_id: threadId, mode } },
      ),
  };
}

/** Per-target presentation configs, keyed by `(target_kind, target_name)`. Admin surface. */
function conversationConfigMethods(t: Transport) {
  const { req } = t;
  return {
    // The stored per-target presentation configs (each `(target_kind, target_name)`
    // pair's multichannel flag + first-contact greeting). Admin config surface.
    listConversationConfigs: (signal?: AbortSignal) =>
      req('/api/conversation-configs', s.conversationConfigs, { signal }),
    // One config by its `(target_kind, target_name)` key. 404 when unknown.
    getConversationConfig: (
      targetKind: s.ConversationTargetKind,
      targetName: string,
      signal?: AbortSignal,
    ) =>
      req(
        `/api/conversation-configs/${encodeSegment(targetKind)}/${encodeSegment(targetName)}`,
        s.targetConversationConfig,
        { signal },
      ),
    // Create or REPLACE a config (an UPSERT: the same door is the create and the
    // edit path). The `(target_kind, target_name)` key rides the URL path; the door
    // rejects a body whose key disagrees, so both come from the one config object.
    setConversationConfig: (config: s.TargetConversationConfig) =>
      req(
        `/api/conversation-configs/${encodeSegment(config.target_kind)}/${encodeSegment(config.target_name)}`,
        s.conversationConfigWritten,
        { method: 'PUT', body: config },
      ),
    // Delete a config by its key. 404 when the key is unknown.
    deleteConversationConfig: (targetKind: s.ConversationTargetKind, targetName: string) =>
      req(
        `/api/conversation-configs/${encodeSegment(targetKind)}/${encodeSegment(targetName)}`,
        s.conversationConfigDeleted,
        { method: 'DELETE' },
      ),
  };
}

/** Admin/GDPR doors: failed-message audit and destructive thread/person erasure. */
function conversationAdminMethods(t: Transport) {
  const { req } = t;
  return {
    // Every answer record whose delivery ended `failed`, across every route and
    // caller. Admin-only server-side; not a paged window (returns `{items, total}`).
    listFailedConversationMessages: (signal?: AbortSignal) =>
      req('/api/conversations/messages/failed', s.conversationFailedMessages, { signal }),
    // Forget ONE thread on a route (destructive): its checkpoint, answer records and
    // thread indexes. The `thread_id` rides the QUERY value, encoded once — it embeds
    // the api door's percent-encoded `{principal}/{end user}` address, which a path
    // segment would encode a second time. `removed` counts the records this call
    // cleared; a valid id on its own route always succeeds, never a 404.
    deleteConversationThread: (routeName: string, threadId: string) =>
      req(`/api/conversations/${encodeSegment(routeName)}/thread`, s.conversationThreadDeleted, {
        method: 'DELETE',
        query: { thread_id: threadId },
      }),
    // Erase a LINKED person ENTIRELY (GDPR, wide blast radius): its aggregated thread
    // and checkpoint, its person row, and every address→person index mapping, across
    // EVERY route it wrote under. The `person_id` is a uuid4 with no percent-encoded
    // principal, so it rides the PATH cleanly. `erased` says whether this call removed
    // the person row (idempotent — a retry answers `false`, never a 404).
    deleteConversationPerson: (personId: string) =>
      req(`/api/conversations/persons/${encodeSegment(personId)}`, s.conversationPersonDeleted, {
        method: 'DELETE',
      }),
  };
}

export function conversationsClient(t: Transport) {
  // Declaration emit prepends each spread group's members, so the groups are
  // spread in reverse of their public order to keep the surface route → thread
  // → config → admin.
  return {
    ...conversationAdminMethods(t),
    ...conversationConfigMethods(t),
    ...conversationThreadMethods(t),
    ...conversationRouteMethods(t),
  };
}
