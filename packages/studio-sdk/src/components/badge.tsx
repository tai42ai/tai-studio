/**
 * `Badge` — a small tinted label. `variant` is a free string (extension "kind"
 * values map straight to it); known variants get a themed tint plus its
 * matching text color from the design-system classes, and any other value falls
 * back to the neutral tint.
 */
import type { ReactNode } from 'react';

export interface BadgeProps {
  readonly variant?: string;
  readonly children: ReactNode;
}

const NEUTRAL_CLASS = 'tai-badge tai-badge-neutral';

/** `primary` is the base badge: the accent tint needs no modifier class. */
const VARIANT_CLASS: Record<string, string> = {
  neutral: NEUTRAL_CLASS,
  primary: 'tai-badge',
  success: 'tai-badge tai-badge-ok',
  warning: 'tai-badge tai-badge-warn',
  danger: 'tai-badge tai-badge-err',
};

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return (
    <span data-variant={variant} className={VARIANT_CLASS[variant] ?? NEUTRAL_CLASS}>
      {children}
    </span>
  );
}
