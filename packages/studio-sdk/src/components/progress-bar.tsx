/**
 * `ProgressBar` — a design-system, accessible progress indicator for a running
 * tool that reports progress (`ctx.report_progress`). Determinate when a
 * positive `total` is known (fills to `value/total`); otherwise indeterminate.
 *
 * The track and fill are classes; only the determinate fill's WIDTH stays inline,
 * because it is the one genuinely per-instance value here. The indeterminate
 * sweep is `tai-progress-fill-indeterminate`.
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
  // Written as `>= 0` rather than `< 0` so that NaN — which compares false to
  // everything, and would otherwise reach the width and the label as `NaN%` —
  // falls through to the floor.
  if (!(fraction >= 0)) return 0;
  if (fraction > 1) return 1;
  return fraction;
}

/**
 * The value to ANNOUNCE, clamped into `[0, total]`. Derived from `value`
 * directly rather than by multiplying the fraction back up: `value / total *
 * total` does not round-trip in binary floating point, so `value={7}
 * total={25}` announced `7.000000000000001`, and a non-finite `total` announced
 * `NaN`. The same `>= 0` shape as `clampFraction` keeps NaN at the floor.
 */
function clampValue(value: number, total: number): number {
  if (!(value >= 0)) return 0;
  if (!(value <= total)) return total;
  return value;
}

/** The status sits at one end of the row and the percentage at the other. */
const labelRowStyle: CSSProperties = { justifyContent: 'space-between' };

/**
 * Render a progress bar. With a positive `total`, `value/total` fills the track
 * and the percentage is announced via `aria-valuenow`; without one, the bar is
 * indeterminate (no `aria-valuenow`, per ARIA).
 */
export function ProgressBar({ value = 0, total, message }: ProgressBarProps): ReactNode {
  // A determinate bar has to announce a real `aria-valuemax`. `Number.isFinite`
  // rather than `> 0` alone: `total={Infinity}` passes the positivity test but
  // announces `aria-valuemax="Infinity"`, which is not a number any assistive
  // technology can place `aria-valuenow` against, and draws a 0 % fill while
  // announcing the raw value. An unbounded total is exactly the indeterminate
  // case, so it renders as one.
  const determinate = typeof total === 'number' && Number.isFinite(total) && total > 0;
  const fraction = determinate ? clampFraction(value, total) : undefined;
  const percent = fraction === undefined ? undefined : Math.round(fraction * 100);

  return (
    <div className="tai-stack tai-stack-2">
      {/* The status line always renders. An indeterminate bar under reduced
          motion is a full, still track — visually identical to a finished one —
          so the only thing separating "in flight" from "done" for a sighted
          reader is this line saying so. */}
      <div className="tai-row tai-field-hint" style={labelRowStyle}>
        <span>{message ?? 'Working…'}</span>
        {percent !== undefined && <span>{percent}%</span>}
      </div>
      <div
        role="progressbar"
        className="tai-progress-track"
        aria-valuemin={0}
        aria-valuemax={determinate ? total : undefined}
        // The clamped value, not the raw prop: a bar drawn full while it
        // announces `aria-valuenow="99"` against `aria-valuemax="10"` tells a
        // screen-reader user something the screen does not.
        aria-valuenow={determinate && fraction !== undefined ? clampValue(value, total) : undefined}
        aria-label={message ?? 'Progress'}
      >
        {determinate ? (
          <div
            className="tai-progress-fill"
            style={{ width: `${String((fraction ?? 0) * 100)}%` }}
          />
        ) : (
          <div className="tai-progress-fill tai-progress-fill-indeterminate" />
        )}
      </div>
    </div>
  );
}
