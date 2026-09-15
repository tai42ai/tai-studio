/** Web-channel entry-gate sub-client. */
import { encodeSegment } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

/**
 * Body for minting a web entry code (POST
 * `/api/channels/web/gates/{identity}/codes`). Both fields are optional-nullable
 * and sent EXPLICITLY: `label` is a human tag (`null` for none); `expires_at` is
 * an ISO-8601 instant the code dies at (`null` for a code that never expires).
 */
export interface WebEntryCodeMintBody {
  readonly label: string | null;
  readonly expires_at: string | null;
}

export function webEntryGateClient(t: Transport) {
  const { req } = t;
  return {
    // A web route's entry gate, keyed by its `our_identity`: read the flag + its
    // live codes, flip the flag, mint a code (raw returned ONCE), revoke a code by
    // its hash id. The conversation monitor's first route mutations.
    getWebEntryGate: (identity: string, signal?: AbortSignal) =>
      req(`/api/channels/web/gates/${encodeSegment(identity)}`, s.webEntryGate, { signal }),
    setWebEntryGate: (identity: string, enabled: boolean) =>
      req(`/api/channels/web/gates/${encodeSegment(identity)}`, s.webEntryGateState, {
        method: 'PUT',
        body: { enabled },
      }),
    // Mint a code. `label`/`expires_at` are sent EXPLICITLY (including `null`). The
    // raw `code` rides the reply ONCE (composed into the chat URL client-side).
    mintWebEntryCode: (identity: string, body: WebEntryCodeMintBody) =>
      req(`/api/channels/web/gates/${encodeSegment(identity)}/codes`, s.webEntryCodeMinted, {
        method: 'POST',
        body: { label: body.label, expires_at: body.expires_at },
      }),
    // Revoke a code by its hash id (immediate + durable). 404 when the id is unknown.
    revokeWebEntryCode: (identity: string, codeId: string) =>
      req(
        `/api/channels/web/gates/${encodeSegment(identity)}/codes/${encodeSegment(codeId)}`,
        s.webEntryCodeRevoked,
        { method: 'DELETE' },
      ),
  };
}
