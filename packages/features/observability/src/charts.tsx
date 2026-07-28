/**
 * Inline-SVG chart primitives — the observability visualizations, built from
 * scratch on the design-system tokens rather than a charting dependency (the
 * feature deliberately bundles no chart library). Two shapes cover the dashboard:
 * a filled area/sparkline over a numeric series, and a horizontal bar list for a
 * labelled ranking. Both are theme-token-driven and expose an accessible summary.
 */
import type { CSSProperties, ReactNode } from 'react';

// -- Area chart (time series) ------------------------------------------------

export interface AreaPoint {
  readonly label: string;
  readonly value: number;
}

export interface AreaChartProps {
  readonly points: readonly AreaPoint[];
  readonly ariaLabel: string;
  readonly formatValue: (value: number) => string;
}

const VIEW_W = 600;
const VIEW_H = 160;
const PAD = 4;

/**
 * A filled area line over the series. The SVG uses a `viewBox` with
 * `preserveAspectRatio="none"` so it scales fluidly to its container width while
 * the caller-fixed height keeps the line readable. A single point degrades to a
 * flat baseline; an empty series renders nothing (the caller shows an empty note).
 */
export function AreaChart({ points, ariaLabel, formatValue }: AreaChartProps): ReactNode {
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const innerW = VIEW_W - PAD * 2;
  const innerH = VIEW_H - PAD * 2;

  const x = (index: number): number =>
    points.length === 1 ? VIEW_W / 2 : PAD + (index / (points.length - 1)) * innerW;
  const y = (value: number): number => PAD + innerH - ((value - min) / span) * innerH;

  const line = points.map((p, i) => `${String(x(i))},${String(y(p.value))}`).join(' ');
  const area = `${String(PAD)},${String(VIEW_H - PAD)} ${line} ${String(VIEW_W - PAD)},${String(
    VIEW_H - PAD,
  )}`;

  const last = points[points.length - 1];
  const lastIndex = points.length - 1;
  // Evenly spaced horizontal gridlines behind the series (top, quartiles, base).
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => PAD + innerH * f);

  return (
    <figure style={{ margin: 0 }}>
      <svg
        role="img"
        aria-label={`${ariaLabel}. Latest ${formatValue(last?.value ?? 0)}.`}
        viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 160, display: 'block', overflow: 'visible' }}
      >
        {gridYs.map((gy, i) => (
          <line
            key={`grid-${String(i)}`}
            x1={PAD}
            x2={VIEW_W - PAD}
            y1={gy}
            y2={gy}
            stroke="var(--tai-color-border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polygon points={area} fill="var(--tai-color-accent)" fillOpacity={0.14} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--tai-color-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={`${p.label}-${String(i)}`}
            cx={x(i)}
            cy={y(p.value)}
            // Endpoint emphasis: the latest sample reads larger than the trail.
            r={i === lastIndex ? 4 : 2.5}
            fill="var(--tai-color-accent)"
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${p.label}: ${formatValue(p.value)}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

// -- Bar list (ranking) ------------------------------------------------------

export interface BarItem {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly caption: string;
}

export interface BarListProps {
  readonly items: readonly BarItem[];
  readonly ariaLabel: string;
}

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(6rem, 12rem) 1fr auto',
  alignItems: 'center',
  gap: 'var(--tai-space-3)',
  padding: 'var(--tai-space-1) 0',
};

const labelStyle: CSSProperties = {
  fontFamily: 'var(--tai-font-sans)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const trackStyle: CSSProperties = {
  position: 'relative',
  height: 10,
  borderRadius: 'var(--tai-radius-sm)',
  background: 'var(--tai-color-surface)',
  overflow: 'hidden',
};

const captionStyle: CSSProperties = {
  fontFamily: 'var(--tai-font-mono)',
  fontSize: 'var(--tai-text-sm)',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--tai-color-text-muted)',
  whiteSpace: 'nowrap',
};

/** A horizontal bar per item, width proportional to the item's share of the max. */
export function BarList({ items, ariaLabel }: BarListProps): ReactNode {
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  return (
    <div role="list" aria-label={ariaLabel} style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((item) => {
        const pct = Math.max(0, Math.min(100, (item.value / max) * 100));
        return (
          <div key={item.key} role="listitem" style={rowStyle}>
            <span style={labelStyle} title={item.label}>
              {item.label}
            </span>
            <span style={trackStyle}>
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${String(pct)}%`,
                  background: 'var(--tai-color-accent)',
                  borderRadius: 'var(--tai-radius-sm)',
                }}
              />
            </span>
            <span style={captionStyle}>{item.caption}</span>
          </div>
        );
      })}
    </div>
  );
}
