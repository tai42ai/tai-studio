/**
 * The shared inline styles for the agent-authoring surface: stacked layouts, an
 * inline row, a monospace text style, and the removable-chip style used by the
 * pickers, editors, and lists.
 */
export const stackStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'var(--tai-space-4)',
};
export const smallStackStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'var(--tai-space-2)',
};
export const rowStyle = { display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' };
export const monoStyle = { fontFamily: 'var(--tai-font-mono, monospace)' };
export const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-1) var(--tai-space-2)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-sm, 4px)',
};
