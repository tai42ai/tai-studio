/**
 * The documented CSS-variable token names — the Studio-plugin styling API. A
 * snapshot test pins this list so the contract can't drift silently. The
 * SDK compatibility version bumps if any of these are renamed/removed.
 */
export const TOKEN_NAMES = [
  '--tai-color-bg',
  '--tai-color-surface',
  '--tai-color-surface-raised',
  '--tai-color-border',
  '--tai-color-text',
  '--tai-color-text-muted',
  '--tai-color-primary',
  '--tai-color-primary-text',
  '--tai-color-danger',
  '--tai-color-danger-text',
  '--tai-color-success',
  '--tai-color-warning',
  '--tai-color-focus-ring',
  '--tai-space-1',
  '--tai-space-2',
  '--tai-space-3',
  '--tai-space-4',
  '--tai-space-6',
  '--tai-space-8',
  '--tai-radius-sm',
  '--tai-radius-md',
  '--tai-radius-lg',
  '--tai-font-sans',
  '--tai-font-mono',
  '--tai-text-sm',
  '--tai-text-md',
  '--tai-text-lg',
  '--tai-shadow-sm',
  '--tai-shadow-md',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
