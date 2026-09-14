/**
 * One waterfall row and its recursion. A lane spans the whole trace; a bar's LEFT edge
 * is when the span started and its WIDTH how long it ran. The row splits into a
 * {@link DisclosureToggle} (expand/collapse) and a {@link SpanBarRow} (the selectable
 * label + bar + duration); {@link Row} owns the geometry and recurses over children.
 */
import { type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { AlertTriangleIcon, ChevronDownIcon, ChevronRightIcon } from '@tai42/studio-sdk';

import { formatLatencyMs } from './format';
import { isErrorSpan, type SpanNode, type TraceTree } from './trace-tree';

/** Least visible bar width, so a zero/near-zero-duration span is still a target. */
const MIN_BAR_PERCENT = 1.5;

/** One indent step per nesting level. */
const INDENT_STEP = 'var(--tai-space-4)';

/** A percentage rounded to a clean CSS length (float math yields `69.9999…`). */
function percent(value: number): string {
  return `${String(Number(value.toFixed(3)))}%`;
}

/** The fill token for a span's bar: error and slowest dominate, then type, then default. */
function barColor(node: SpanNode, slowestId: string | null): string {
  if (isErrorSpan(node.span)) return 'var(--tai-color-err-fill)';
  if (node.span.id === slowestId) return 'var(--tai-color-warn-fill)';
  const type = (node.span.type ?? '').toUpperCase();
  if (type === 'GENERATION' || type === 'LLM') return 'var(--tai-color-accent)';
  if (type === 'TOOL') return 'var(--tai-color-primary)';
  return 'var(--tai-color-border-strong)';
}

const trackStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  minWidth: '3.5rem',
  height: '0.5rem',
  borderRadius: 'var(--tai-radius-sm)',
  background: 'var(--tai-color-surface-raised)',
};

interface RowProps {
  readonly node: SpanNode;
  readonly depth: number;
  readonly tree: TraceTree;
  readonly selectedId: string | null;
  readonly collapsed: ReadonlySet<string>;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (id: string) => void;
  readonly flat: boolean;
}

/** The expand/collapse control, or an inert spacer when the row has no children (or is
 * rendered flat in a filtered list). */
function DisclosureToggle({
  hasChildren,
  flat,
  open,
  name,
  onToggle,
}: {
  readonly hasChildren: boolean;
  readonly flat: boolean;
  readonly open: boolean;
  readonly name: string;
  readonly onToggle: () => void;
}): ReactNode {
  if (!hasChildren || flat) {
    return <span style={{ width: '1.25rem', flexShrink: 0 }} aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      className="tai-icon-btn"
      aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
      aria-expanded={open}
      onClick={onToggle}
      style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }}
    >
      {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
    </button>
  );
}

/** The selectable row body: an error marker, the span name, its bar, and its duration. */
function SpanBarRow({
  node,
  slowestId,
  selected,
  name,
  error,
  left,
  width,
  onSelect,
}: {
  readonly node: SpanNode;
  readonly slowestId: string | null;
  readonly selected: boolean;
  readonly name: string;
  readonly error: boolean;
  readonly left: number;
  readonly width: number;
  readonly onSelect: () => void;
}): ReactNode {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="waterfall-row"
      data-span-id={node.span.id}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      title={`${name}${node.span.type !== null ? ` · ${node.span.type}` : ''}${
        node.durationMs !== null ? ` · ${formatLatencyMs(node.durationMs)}` : ''
      }${error ? ' · error' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--tai-space-2)',
        flex: 1,
        minWidth: 0,
        cursor: 'pointer',
      }}
    >
      {error ? (
        <span style={{ color: 'var(--tai-color-err-text)', display: 'inline-flex', flexShrink: 0 }}>
          <AlertTriangleIcon />
        </span>
      ) : null}
      <span
        style={{
          fontSize: 'var(--tai-text-sm)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: '5rem',
          maxWidth: '11rem',
          color: 'var(--tai-color-text)',
        }}
      >
        {name}
      </span>
      <div style={trackStyle}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            height: '100%',
            borderRadius: 'var(--tai-radius-sm)',
            left: percent(left),
            width: percent(width),
            background: barColor(node, slowestId),
          }}
        />
      </div>
      <span
        className="tai-mono"
        style={{
          flexShrink: 0,
          width: '3.5rem',
          textAlign: 'right',
          fontSize: 'var(--tai-text-xs)',
          color: 'var(--tai-color-text-muted)',
        }}
      >
        {node.durationMs !== null ? formatLatencyMs(node.durationMs) : '—'}
      </span>
    </div>
  );
}

export function Row({
  node,
  depth,
  tree,
  selectedId,
  collapsed,
  onSelect,
  onToggle,
  flat,
}: RowProps): ReactNode {
  const axis = tree.t1 - tree.t0;
  const hasChildren = node.children.length > 0;
  const open = !collapsed.has(node.span.id);
  const selected = node.span.id === selectedId;
  const name = node.span.name ?? '(unnamed span)';
  const error = isErrorSpan(node.span);

  const startMs = node.span.start !== null ? new Date(node.span.start).getTime() : tree.t0;
  const safeStart = Number.isNaN(startMs) ? tree.t0 : startMs;
  // Clamp so a span at t1 still shows its min-width bar inside the track.
  const left = Math.min(((safeStart - tree.t0) / axis) * 100, 100 - MIN_BAR_PERCENT);
  const width =
    node.durationMs !== null
      ? Math.max((node.durationMs / axis) * 100, MIN_BAR_PERCENT)
      : MIN_BAR_PERCENT;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--tai-space-2)',
          paddingLeft: `calc(${flat ? '0' : String(depth)} * ${INDENT_STEP} + var(--tai-space-2))`,
          paddingRight: 'var(--tai-space-2)',
          paddingTop: 'var(--tai-space-1)',
          paddingBottom: 'var(--tai-space-1)',
          borderLeft: selected ? '2px solid var(--tai-color-accent)' : '2px solid transparent',
          background: selected ? 'var(--tai-color-accent-tint)' : undefined,
        }}
      >
        <DisclosureToggle
          hasChildren={hasChildren}
          flat={flat}
          open={open}
          name={name}
          onToggle={() => {
            onToggle(node.span.id);
          }}
        />
        <SpanBarRow
          node={node}
          slowestId={tree.slowestId}
          selected={selected}
          name={name}
          error={error}
          left={left}
          width={width}
          onSelect={() => {
            onSelect(node.span.id);
          }}
        />
      </div>

      {!flat && open && hasChildren
        ? node.children.map((child) => (
            <Row
              key={child.span.id}
              node={child}
              depth={depth + 1}
              tree={tree}
              selectedId={selectedId}
              collapsed={collapsed}
              onSelect={onSelect}
              onToggle={onToggle}
              flat={false}
            />
          ))
        : null}
    </div>
  );
}
