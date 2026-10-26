/**
 * The style constants shared across the API-keys tab and its dialogs.
 */
import type { CSSProperties } from 'react';

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

// The muted "Owned by …" line: the read-only owner a non-admin sees in the create
// dialog, and the owning-principal line under the minted-key dialog's title.
export const ownerLineStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

// The advisory, NON-BLOCKING notice shown next to Save when the condition's last
// Test failed and it is unchanged since. The Test guard is advisory — it never
// gates the save (the server re-validates the condition at enforcement).
export const conditionWarningStyle: CSSProperties = {
  margin: 'var(--tai-space-3) 0 0',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-warn-text)',
};

// The warning shown while a key is granted every scope: the warn colour with its
// icon, so the state never rests on colour alone.
export const fullAccessWarningStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--tai-space-2)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-warn-text)',
};

// The one-line hint under a field label that is not wrapped in the SDK `Field`
// (it carries the same `tai-field-hint` class `Field` paints its description with).
export const fieldHintStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-1)',
};
