/**
 * The shared inline styles for the agent-authoring surface: stacked layouts, an
 * inline row, and a monospace text style. The removable chips wear the published
 * `tai-chip tai-chip-static` pair rather than a local copy of it.
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
export const monoStyle = { fontFamily: 'var(--tai-font-mono)' };
