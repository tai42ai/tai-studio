/**
 * The style constants shared by the Backup tab's export and import cards.
 */
import type { CSSProperties } from 'react';

export const headingStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

export const checklistStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
  marginBottom: 'var(--tai-space-3)',
};

// `.tai-warn-state` carries the panel itself — padding, tint, border, type — so the
// only thing left here is the gap to whatever follows the warning.
export const warningStyle: CSSProperties = { margin: '0 0 var(--tai-space-3)' };

export const noteStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};
