import type { CSSProperties } from 'react';

/**
 * Shared token-driven styling for form controls (inputs, textarea, select
 * trigger). Every value resolves from a `--tai-*` token so a plugin restyles the
 * whole design system by re-theming the tokens — never by overriding component
 * internals with raw utilities.
 */
export const controlBaseStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
  background: 'var(--tai-color-surface-raised)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  padding: 'var(--tai-space-2) var(--tai-space-3)',
};
