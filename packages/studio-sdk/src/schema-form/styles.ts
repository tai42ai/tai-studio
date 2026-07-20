/**
 * Shared layout styles for the schema-form field tree: the vertical field stack
 * and the indented, border-left group container that nests object/array/union
 * children.
 */
import type { CSSProperties } from 'react';

export const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

export const groupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
  paddingLeft: 'var(--tai-space-3)',
  borderLeft: '2px solid var(--tai-color-border)',
};
