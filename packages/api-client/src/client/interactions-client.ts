/** Interaction listing/answer and the SSE stream sub-clients. */
import * as s from '../schemas';
import { ApiError, ApiUnauthorizedError } from '../errors';
import { encodeSegment, extractError } from '../http';
import { readSseFrames, sseOpenToken } from '../sse';
import type { Transport } from './transport';

export function interactionsClient(t: Transport) {
  const { req } = t;
  return {
    // One page of the pending interactions (the tail-only stream's paged base). The
    // door filters by audience before paging — the SAME filter the stream applies —
    // so `total` is the caller's own count, and every terminal frame it later receives
    // refers to a question within that `total`.
    listInteractions: (page: number, pageSize: number, signal?: AbortSignal) =>
      req('/api/interactions', s.interactionsPage, { signal, query: { page, pageSize } }),
    answerInteraction: (interactionId: string, answer: unknown) =>
      req(`/api/interactions/${encodeSegment(interactionId)}/answer`, s.interactionAnswered, {
        method: 'POST',
        body: { answer },
      }),
    // Withdraw a pending ask WITHOUT answering it (a bodyless POST): the question is
    // resolved as cancelled and the flow that asked never resumes. Terminal like an
    // answer, so the loud failure mappings mirror it — a 409 (already answered, so no
    // longer cancellable) surfaces as `ApiConflictError`, a 404 (unknown/already gone)
    // and a 403 (not this caller's audience) as `ApiError` — all via the shared
    // `apiRequest` status handling.
    cancelInteraction: (interactionId: string) =>
      req(`/api/interactions/${encodeSegment(interactionId)}/cancel`, s.interactionCancelled, {
        method: 'POST',
      }),
  };
}

export function interactionsStreamClient(t: Transport) {
  const { config } = t;
  return {
    /**
     * Open the authed interactions SSE stream. The stream is TAIL-ONLY: its cursor
     * is the stream tail at connect, so it carries no backlog and no
     * `interaction.backlog_done` frame — the pending base comes from
     * `listInteractions`. The caller drives reconnect and refetches that base on
     * each (re)connect. Returns the raw frame iterator; the interactions feature
     * maps frames to typed events.
     *
     * `lastEventId` (the id of the last frame the caller saw) is sent as the
     * `Last-Event-ID` header so the server resumes AFTER it and replays any frame —
     * including a card's `answered` — that landed during a disconnect gap. It is
     * also sent as a `?last_event_id=` query param so a proxy that strips the header
     * still resumes; the server reads either. Omitted on a first connect.
     */
    streamInteractions: async (signal?: AbortSignal, lastEventId?: string) => {
      const doFetch = config.fetch ?? globalThis.fetch;
      const token = config.getToken();
      const headers: Record<string, string> = { accept: 'text/event-stream' };
      if (token) headers['x-api-key'] = token;
      if (lastEventId) headers['last-event-id'] = lastEventId;
      // Distinct-URL per open — see the canonical constraint on `sseOpenToken`.
      const resume = lastEventId ? `&last_event_id=${encodeURIComponent(lastEventId)}` : '';
      const url = `${config.baseUrl ?? ''}/api/interactions/stream?_=${sseOpenToken()}${resume}`;
      const response = await doFetch(url, {
        headers,
        signal,
      });
      if (response.status === 401) throw new ApiUnauthorizedError();
      // A non-ok stream open (5xx/4xx) still carries a body, which would parse to
      // zero frames and look like a silently-empty stream — surface it loudly so
      // the caller shows an error instead of hanging on a reconnect loop. Read the
      // `{ "error" }` envelope so a load-bearing server message (e.g. the OFF
      // store's 501 remediation line) surfaces verbatim instead of collapsing to
      // the bare status text.
      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new ApiError(response.statusText || 'stream failed', response.status);
        }
        const { message, code } = extractError(payload);
        throw new ApiError(
          message ?? (response.statusText || 'stream failed'),
          response.status,
          code,
        );
      }
      return readSseFrames(response, signal);
    },
  };
}
