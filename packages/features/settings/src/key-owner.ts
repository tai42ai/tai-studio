/**
 * The per-key payload type and the owner claim the server merges into a key's
 * `policy_data`.
 */
import type { TokensPayload } from '@tai42/api-client';

export type KeyPayload = TokensPayload[number];

/**
 * The owner claim the server merges into a key's `policy_data` under the literal
 * `owner_user_id` key, or `null` for an ownerless key. An owned key is a delegated
 * credential whose actions run as its owner; the keys table surfaces it so an admin
 * can tell owned keys apart.
 */
export function ownerOf(payload: KeyPayload): string | null {
  const data = payload.policy_data;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const owner = (data as Record<string, unknown>).owner_user_id;
  return typeof owner === 'string' ? owner : null;
}
