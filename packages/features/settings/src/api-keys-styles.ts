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

// The advisory, NON-BLOCKING notice shown next to Save when the condition's last
// Test failed and it is unchanged since. The Test guard is advisory — it never
// gates the save (the server re-validates the condition at enforcement).
export const conditionWarningStyle: CSSProperties = {
  margin: 'var(--tai-space-3) 0 0',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-warn-text)',
};
