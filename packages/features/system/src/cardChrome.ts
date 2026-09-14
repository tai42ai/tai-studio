/** Shared card chrome for the system page: the card header row and a couple of
 * common inline styles the cards reuse. */
import type { CSSProperties } from 'react';

export const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-4)',
  marginBottom: 'var(--tai-space-4)',
};

export const monoStyle: CSSProperties = { fontFamily: 'var(--tai-font-mono)' };

export const readOnlyNoteStyle: CSSProperties = {
  margin: 0,
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};
