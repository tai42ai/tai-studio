/**
 * Left pane of the trace explorer: a waterfall timeline over a collapsible span
 * tree. Every lane spans the whole trace; a bar's LEFT edge is when the span
 * started and its WIDTH is how long it ran, so the critical path — what ran when,
 * what was slow, what overlapped — is visible at a glance. Rows are click- and
 * keyboard-select. A text filter, jump-to-error / jump-to-slowest, and
 * collapse-all speed navigation through a large trace.
 */
import { useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  AlertTriangleIcon,
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  TextInput,
} from '@tai42/studio-sdk';

import { formatLatencyMs } from './format';
import { isErrorSpan, type SpanNode, type TraceTree } from './trace-tree';

/** Least visible bar width, so a zero/near-zero-duration span is still a target. */
const MIN_BAR_PERCENT = 1.5;

/** A percentage rounded to a clean CSS length (float math yields `69.9999…`). */
function percent(value: number): string {
  return `${String(Number(value.toFixed(3)))}%`;
}

/** One indent step per nesting level. */
const INDENT_STEP = 'var(--tai-space-4)';

/** The fill token for a span's bar: error and slowest dominate, then type, then default. */
function barColor(node: SpanNode, slowestId: string | null): string {
  if (isErrorSpan(node.span)) return 'var(--tai-color-err-fill)';
  if (node.span.id === slowestId) return 'var(--tai-color-warn-fill)';
  const type = (node.span.type ?? '').toUpperCase();
  if (type === 'GENERATION' || type === 'LLM') return 'var(--tai-color-accent)';
  if (type === 'TOOL') return 'var(--tai-color-primary)';
  return 'var(--tai-color-border-strong)';
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-2)',
  borderBottom: '1px solid var(--tai-color-border)',
  flexWrap: 'wrap',
};

const listStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 'var(--tai-space-1) 0',
};

const trackStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  minWidth: '3.5rem',
  height: '0.5rem',
  borderRadius: 'var(--tai-radius-sm)',
  background: 'var(--tai-color-surface-raised)',
};

function Row({
  node,
  depth,
  tree,
  selectedId,
  collapsed,
  onSelect,
  onToggle,
  flat,
}: {
  readonly node: SpanNode;
  readonly depth: number;
  readonly tree: TraceTree;
  readonly selectedId: string | null;
  readonly collapsed: ReadonlySet<string>;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (id: string) => void;
  readonly flat: boolean;
}): ReactNode {
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

  const select = (): void => {
    onSelect(node.span.id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  };

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
        {hasChildren && !flat ? (
          <button
            type="button"
            className="tai-icon-btn"
            aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
            aria-expanded={open}
            onClick={() => {
              onToggle(node.span.id);
            }}
            style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }}
          >
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        ) : (
          <span style={{ width: '1.25rem', flexShrink: 0 }} aria-hidden="true" />
        )}

        <div
          role="button"
          tabIndex={0}
          data-testid="waterfall-row"
          data-span-id={node.span.id}
          aria-current={selected ? 'true' : undefined}
          onClick={select}
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
            <span
              style={{ color: 'var(--tai-color-err-text)', display: 'inline-flex', flexShrink: 0 }}
            >
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
                background: barColor(node, tree.slowestId),
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

export function TraceWaterfall({
  tree,
  selectedId,
  onSelect,
}: {
  readonly tree: TraceTree;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}): ReactNode {
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const parentIds = useMemo(() => {
    const ids: string[] = [];
    for (const node of tree.byId.values()) {
      if (node.children.length > 0) ids.push(node.span.id);
    }
    return ids;
  }, [tree]);

  const allCollapsed = parentIds.length > 0 && parentIds.every((id) => collapsed.has(id));

  const toggle = (id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAll = (): void => {
    setCollapsed(allCollapsed ? new Set() : new Set(parentIds));
  };

  const matches = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (query === '') return null;
    const out: SpanNode[] = [];
    for (const node of tree.byId.values()) {
      const name = (node.span.name ?? '').toLowerCase();
      const type = (node.span.type ?? '').toLowerCase();
      if (name.includes(query) || type.includes(query)) out.push(node);
    }
    out.sort(
      (a, b) =>
        (a.span.start !== null ? new Date(a.span.start).getTime() : 0) -
        (b.span.start !== null ? new Date(b.span.start).getTime() : 0),
    );
    return out;
  }, [filter, tree]);

  // Bind to consts so the null-guard narrows into the click handlers (a const
  // cannot be reassigned, so its narrowing survives into the closure).
  const firstErrorId = tree.firstErrorId;
  const slowestId = tree.slowestId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={toolbarStyle}>
        <div style={{ flex: 1, minWidth: '8rem' }}>
          <TextInput
            aria-label="Filter spans"
            placeholder="Filter spans…"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
        </div>
        {firstErrorId !== null ? (
          <Button
            variant="secondary"
            onClick={() => {
              onSelect(firstErrorId);
            }}
          >
            <AlertTriangleIcon />
            Error
          </Button>
        ) : null}
        {slowestId !== null ? (
          <Button
            variant="secondary"
            onClick={() => {
              onSelect(slowestId);
            }}
          >
            Slowest
          </Button>
        ) : null}
        {parentIds.length > 0 ? (
          <Button variant="ghost" onClick={collapseAll}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </Button>
        ) : null}
      </div>

      <div style={listStyle}>
        {matches !== null ? (
          matches.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: 'var(--tai-space-3)',
                fontSize: 'var(--tai-text-sm)',
                color: 'var(--tai-color-text-muted)',
              }}
            >
              No spans match “{filter}”.
            </p>
          ) : (
            matches.map((node) => (
              <Row
                key={node.span.id}
                node={node}
                depth={0}
                tree={tree}
                selectedId={selectedId}
                collapsed={collapsed}
                onSelect={onSelect}
                onToggle={toggle}
                flat
              />
            ))
          )
        ) : (
          tree.roots.map((node) => (
            <Row
              key={node.span.id}
              node={node}
              depth={0}
              tree={tree}
              selectedId={selectedId}
              collapsed={collapsed}
              onSelect={onSelect}
              onToggle={toggle}
              flat={false}
            />
          ))
        )}
      </div>
    </div>
  );
}
