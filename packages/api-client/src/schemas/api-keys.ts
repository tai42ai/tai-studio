/** API-key payload and mint/edit/revoke response schemas. */
import { z } from 'zod';

import { principalRef } from './principals';
import { templatedText } from './served';
import { jsonValue } from './shared';

/** The per-key payloads (`GET /api/auth/tokens-payload`). The stable per-mint
 * `key_fingerprint` is nested under `policy_data`; the picker reads it there. */
export const tokensPayload = z.array(
  z.object({
    // The value an `execution_key` binding names.
    user_id: z.string().min(1),
    description: z.string(),
    scopes: z.array(z.string()),
    policy_data: jsonValue,
    condition: templatedText.nullable().optional(),
    // The key's OWNER principal (kind + display name); `null` for a key whose
    // principal row is absent (an orphaned restore state).
    principal: principalRef.nullable().optional(),
    // `true` for a key whose owning principal row is gone (an orphaned key that a
    // backup restore left without its principal).
    orphaned: z.boolean().optional(),
  }),
);
export type TokensPayload = z.infer<typeof tokensPayload>;

/** Mint reply `{ api_key, key_fingerprint }` narrowed to the raw `sk-…` key,
 *  returned once at creation and never again. */
export const createdApiKey = z
  .object({ api_key: z.string(), key_fingerprint: z.string() })
  .transform((minted) => minted.api_key);
export const editApiKeyResult = z.object({ user_id: z.string(), updated: z.boolean() });
export const revokeApiKeyResult = z.object({ user_id: z.string(), revoked: z.boolean() });
