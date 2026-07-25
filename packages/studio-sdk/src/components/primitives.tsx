/**
 * Owned DS primitives, token-styled (via `var(--tai-*)`). These cover the shared
 * UI states every feature drives from TanStack Query: loading skeletons, a
 * shared empty state, and a loud error surface. Plugins consume these — never raw
 * Tailwind utilities.
 */
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

const box = (style: CSSProperties): CSSProperties => style;

// -- Button ------------------------------------------------------------------

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ variant = 'secondary', style, ...props }: ButtonProps) {
  const palette: Record<NonNullable<ButtonProps['variant']>, CSSProperties> = {
    primary: {
      background: 'var(--tai-color-primary)',
      color: 'var(--tai-color-primary-text)',
      border: 'none',
    },
    secondary: {
      background: 'var(--tai-color-surface-raised)',
      color: 'var(--tai-color-text)',
      border: '1px solid var(--tai-color-border)',
    },
    danger: {
      background: 'var(--tai-color-danger)',
      color: 'var(--tai-color-danger-text)',
      border: 'none',
    },
  };
  return (
    <button
      {...props}
      style={box({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--tai-space-2)',
        padding: 'var(--tai-space-2) var(--tai-space-4)',
        borderRadius: 'var(--tai-radius-md)',
        font: `var(--tai-text-md) var(--tai-font-sans)`,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.6 : 1,
        ...palette[variant],
        ...style,
      })}
    />
  );
}

// -- Card --------------------------------------------------------------------

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={box({
        background: 'var(--tai-color-surface-raised)',
        border: '1px solid var(--tai-color-border)',
        borderRadius: 'var(--tai-radius-lg)',
        boxShadow: 'var(--tai-shadow-sm)',
        padding: 'var(--tai-space-4)',
        color: 'var(--tai-color-text)',
        ...style,
      })}
    >
      {children}
    </div>
  );
}

// -- Skeleton (loading) ------------------------------------------------------

export function Skeleton({
  height = 16,
  width = '100%',
}: {
  height?: number | string;
  width?: number | string;
}) {
  return (
    <div
      aria-hidden="true"
      style={box({
        height,
        width,
        borderRadius: 'var(--tai-radius-sm)',
        background: 'var(--tai-color-surface)',
        animation: 'tai-pulse 1.4s ease-in-out infinite',
      })}
    />
  );
}

// -- EmptyState --------------------------------------------------------------

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div
      role="status"
      style={box({
        textAlign: 'center',
        padding: 'var(--tai-space-8)',
        color: 'var(--tai-color-text-muted)',
        font: `var(--tai-text-md) var(--tai-font-sans)`,
      })}
    >
      <p style={{ color: 'var(--tai-color-text)', fontSize: 'var(--tai-text-lg)', margin: 0 }}>
        {title}
      </p>
      {description ? <p style={{ marginTop: 'var(--tai-space-2)' }}>{description}</p> : null}
    </div>
  );
}

// -- ErrorState (loud, visible) ----------------------------------------------

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      style={box({
        padding: 'var(--tai-space-4)',
        border: '1px solid var(--tai-color-danger)',
        borderRadius: 'var(--tai-radius-md)',
        color: 'var(--tai-color-text)',
        background: 'color-mix(in srgb, var(--tai-color-danger) 8%, var(--tai-color-surface))',
      })}
    >
      <strong style={{ color: 'var(--tai-color-danger)' }}>Something went wrong</strong>
      <p style={{ margin: 'var(--tai-space-2) 0 0', whiteSpace: 'pre-wrap' }}>{message}</p>
      {onRetry ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// -- Spinner -----------------------------------------------------------------

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      style={box({
        display: 'inline-block',
        width: 16,
        height: 16,
        border: '2px solid var(--tai-color-border)',
        borderTopColor: 'var(--tai-color-primary)',
        borderRadius: '50%',
        animation: 'tai-spin 0.7s linear infinite',
      })}
    />
  );
}
