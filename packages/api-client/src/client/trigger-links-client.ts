/** Trigger-link mint, listing and revoke sub-client. */
import { encodeSegment } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

/**
 * Body for minting a trigger link (POST `/api/hooks/trigger-links`). `ttl_seconds`
 * is REQUIRED and nullable — a positive int is a timed link, `null` is a permanent
 * link (`0`/negative is a loud server 400); it is always sent EXPLICITLY (a dropped
 * key 400s server-side). `name` is optional (the server generates one when omitted);
 * `tool_kwargs` is the optional per-link params merged last into every fire.
 */
export interface TriggerLinkCreateBody {
  readonly topic: string;
  readonly name?: string;
  readonly execution_key: string;
  // The link is a token door; this is its only auth knob (token → token+api_key).
  readonly require_api_key: boolean;
  readonly ttl_seconds: number | null;
  readonly tool_kwargs?: Record<string, unknown> | null;
}

export function triggerLinksClient(t: Transport) {
  const { req } = t;
  return {
    // Mint a trigger link for a topic. `ttl_seconds` is sent EXPLICITLY
    // (including `null` for a permanent link) — the server requires the key present
    // and 400s a dropped one; `tool_kwargs` is omitted when undefined. The raw
    // `token` rides the response ONCE (composed into the QR URL client-side).
    createTriggerLink: (body: TriggerLinkCreateBody) =>
      req('/api/hooks/trigger-links', s.triggerLinkCreated, {
        method: 'POST',
        body: {
          topic: body.topic,
          name: body.name,
          execution_key: body.execution_key,
          require_api_key: body.require_api_key,
          ttl_seconds: body.ttl_seconds,
          tool_kwargs: body.tool_kwargs,
        },
      }),
    // Every live trigger-link record (hash prefix only — never a raw token).
    listTriggerLinks: (signal?: AbortSignal) =>
      req('/api/hooks/trigger-links', s.triggerLinkList, { signal }),
    // Revoke a link by name (immediate + durable). 404 when the name is unknown.
    deleteTriggerLink: (name: string) =>
      req(`/api/hooks/trigger-links/${encodeSegment(name)}`, s.triggerLinkDeleted, {
        method: 'DELETE',
      }),
  };
}
