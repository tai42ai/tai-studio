/** Web-channel entry-gate code response schemas. */
import { z } from 'zod';

// The web channel's entry gate: a web route can be gated so its chat page is
// served only to a navigation carrying a live entry code. These four doors are
// keyed by the route's `our_identity`. A raw code exists only in flight (the
// mint reply); a listed code carries its hash id, never a raw value (none is
// stored).

/** One minted entry code as the gate read door lists it — its hash id, its
 * optional label, and when it was created / dies. Never a raw code. */
export const webEntryCode = z.object({
  code_id: z.string(),
  label: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string().nullable(),
});
export type WebEntryCode = z.infer<typeof webEntryCode>;

/** `GET /api/channels/web/gates/{identity}` — the gate flag and its live codes. */
export const webEntryGate = z.object({
  enabled: z.boolean(),
  codes: z.array(webEntryCode),
});
export type WebEntryGate = z.infer<typeof webEntryGate>;

/** `PUT /api/channels/web/gates/{identity}` — the gate flag after the write. */
export const webEntryGateState = z.object({ enabled: z.boolean() });
export type WebEntryGateState = z.infer<typeof webEntryGateState>;

/**
 * `POST /api/channels/web/gates/{identity}/codes` — a freshly minted code. The
 * raw `code` rides this reply ONCE (nothing else stores or lists it — a listed
 * code's raw value is unrecoverable by design); `code_id` is its hash id and
 * `expires_at` an ISO-8601 instant, or `null` for a code that never expires.
 */
export const webEntryCodeMinted = z.object({
  code: z.string(),
  code_id: z.string(),
  expires_at: z.string().nullable(),
});
export type WebEntryCodeMinted = z.infer<typeof webEntryCodeMinted>;

/** `DELETE /api/channels/web/gates/{identity}/codes/{code_id}` — the revoked code. */
export const webEntryCodeRevoked = z.object({ status: z.literal('revoked') });
export type WebEntryCodeRevoked = z.infer<typeof webEntryCodeRevoked>;
