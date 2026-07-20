/**
 * `ProgressBar` — a token-styled, accessible progress indicator for a running
 * tool that reports progress (`ctx.report_progress`). Determinate when a
 * positive `total` is known (fills to `value/total`); otherwise indeterminate.
 *
 * Reusable by any feature's run surface — it takes only the raw
 * progress/total/message a `report_progress` notification carries and renders
 * a native `role="progressbar"` element with the ARIA value fields set.
 */
import type { CSSProperties, ReactNode } from 'react';

export interface ProgressBarProps {
  /** Current progress. Clamped to `[0, total]` when `total` is known. */
  readonly value?: number;
  /** Upper bound. When absent or non-positive the bar is INDETERMINATE. */
  readonly total?: number;
  /** Optional human-readable status shown alongside the bar. */
  readonly message?: string;
}

function clampFraction(value: number, total: number): number {
  if (!(total > 0)) return 0;
  const fraction = value / total;
  if (fraction < 0) return 0;
  if (fraction > 1) return 1;
  return fraction;
}

const trackStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  width: '100%',
  height: '0.5rem',
  borderRadius: 'var(--tai-radius-sm)',
  background: 'var(--tai-color-surface-raised)',
  border: '1px solid var(--tai-color-border)',
};

const fillStyle: CSSProperties = {
  height: '100%',
  background: 'var(--tai-color-primary)',
  transition: 'width 150ms ease-out',
};

const indeterminateFillStyle: CSSProperties = {
  height: '100%',
  width: '35%',
  background: 'var(--tai-color-primary)',
  animation: 'tai-progress-indeterminate 1.1s ease-in-out infinite',
};

const labelRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-2)',
  marginBottom: 'var(--tai-space-1)',
  font: 'var(--tai-text-sm) var(--tai-font-sans)',
  color: 'var(--tai-color-text-muted)',
};

/**
 * Render a progress bar. With a positive `total`, `value/total` fills the track
 * and the percentage is announced via `aria-valuenow`; without one, the bar is
 * indeterminate (no `aria-valuenow`, per ARIA).
 */
export function ProgressBar({ value = 0, total, message }: ProgressBarProps): ReactNode {
  const determinate = typeof total === 'number' && total > 0;
  const fraction = determinate ? clampFraction(value, total) : undefined;
  const percent = fraction === undefined ? undefined : Math.round(fraction * 100);

  return (
    <div>
      {(message !== undefined || percent !== undefined) && (
        <div style={labelRowStyle}>
          <span>{message ?? 'Working…'}</span>
          {percent !== undefined && <span>{percent}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={determinate ? total : undefined}
        aria-valuenow={determinate ? value : undefined}
        aria-label={message ?? 'Progress'}
        style={trackStyle}
      >
        {determinate ? (
          <div style={{ ...fillStyle, width: `${String((fraction ?? 0) * 100)}%` }} />
        ) : (
          <div style={indeterminateFillStyle} />
        )}
      </div>
    </div>
  );
}
