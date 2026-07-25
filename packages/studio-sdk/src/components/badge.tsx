/**
 * `Badge` — a small token-styled label. `variant` is a free string (extension
 * "kind" values map straight to it); known variants get a themed color and any
 * other value falls back to the neutral palette.
 */
import type { CSSProperties, ReactNode } from 'react';

export interface BadgeProps {
  readonly variant?: string;
  readonly children: ReactNode;
}

interface BadgeColors {
  readonly bg: string;
  readonly fg: string;
}

const VARIANT_COLORS: Record<string, BadgeColors> = {
  neutral: { bg: 'var(--tai-color-surface)', fg: 'var(--tai-color-text-muted)' },
  primary: {
    bg: 'color-mix(in srgb, var(--tai-color-primary) 15%, transparent)',
    fg: 'var(--tai-color-primary)',
  },
  success: {
    bg: 'color-mix(in srgb, var(--tai-color-success) 15%, transparent)',
    fg: 'var(--tai-color-success)',
  },
  warning: {
    bg: 'color-mix(in srgb, var(--tai-color-warning) 18%, transparent)',
    fg: 'var(--tai-color-warning)',
  },
  danger: {
    bg: 'color-mix(in srgb, var(--tai-color-danger) 15%, transparent)',
    fg: 'var(--tai-color-danger)',
  },
};

const NEUTRAL: BadgeColors = { bg: 'var(--tai-color-surface)', fg: 'var(--tai-color-text-muted)' };

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  const colors = VARIANT_COLORS[variant] ?? NEUTRAL;
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--tai-space-1)',
    padding: '0.125rem var(--tai-space-2)',
    borderRadius: 'var(--tai-radius-sm)',
    fontSize: 'var(--tai-text-sm)',
    fontFamily: 'var(--tai-font-sans)',
    fontWeight: 600,
    lineHeight: 1.4,
    background: colors.bg,
    color: colors.fg,
  };
  return (
    <span data-variant={variant} style={style}>
      {children}
    </span>
  );
}
