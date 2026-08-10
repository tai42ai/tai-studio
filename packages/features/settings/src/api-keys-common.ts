/**
 * Shared pieces for the API keys tab and its dialogs: the per-key payload type
 * and the style constants used across more than one of the key components.
 */
import type { CSSProperties } from 'react';
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

export const badgeRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
};

export const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

export const fieldLabelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text)',
  display: 'block',
  marginBottom: 'var(--tai-space-1)',
};

export const dialogActionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 'var(--tai-space-2)',
  marginTop: 'var(--tai-space-4)',
};

// The advisory, NON-BLOCKING notice shown next to Save when the condition's last
// Test failed and it is unchanged since. The Test guard is advisory — it never
// gates the save (the server re-validates the condition at enforcement).
export const conditionWarningStyle: CSSProperties = {
  margin: 'var(--tai-space-3) 0 0',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-warn-text)',
};
