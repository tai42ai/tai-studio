/**
 * Left pane of the trace explorer: a waterfall timeline over a collapsible span
 * tree. Every lane spans the whole trace; a bar's LEFT edge is when the span
 * started and its WIDTH is how long it ran, so the critical path — what ran when,
 * what was slow, what overlapped — is visible at a glance. Rows are click- and
 * keyboard-select. A text filter, jump-to-error / jump-to-slowest, and
 * collapse-all speed navigation through a large trace.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangleIcon, Button, TextInput } from '@tai42/studio-sdk';

import { type SpanNode, type TraceTree } from './trace-tree';
import { Row } from './WaterfallRow';

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
