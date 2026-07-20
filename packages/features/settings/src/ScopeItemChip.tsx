/**
 * One draggable URL chip in the access-control mapper. The chip's label area is
 * the drag handle (a `role="button"` element dnd-kit makes pointer- AND
 * keyboard-operable); an optional inline remove control sits beside it as a
 * separate button so no interactive element is nested inside another.
 *
 * A chip carries a `route` or a `sub-mcp` url. Route chips surfaced from the
 * unassigned bucket also render their HTTP methods as a secondary label.
 */
import { useDraggable } from '@dnd-kit/core';
import type { CSSProperties, ReactNode } from 'react';

/** Where a chip currently lives — its origin zone. */
export type ZoneRef =
  | { readonly kind: 'scope'; readonly scopeId: string }
  | { readonly kind: 'unassigned' }
  | { readonly kind: 'public' };

/** The typed payload a chip carries through a drag. */
export interface ChipData {
  readonly url: string;
  readonly itemType: 'route' | 'sub-mcp';
  /** The sub-MCP slug when `itemType === 'sub-mcp'`, else `null`. */
  readonly slug: string | null;
  readonly origin: ZoneRef;
  /** The HTTP methods for an unassigned route chip; empty otherwise. */
  readonly methods: readonly string[];
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-1) var(--tai-space-2)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  background: 'var(--tai-color-surface)',
  fontFamily: 'var(--tai-font-mono, monospace)',
  fontSize: 'var(--tai-text-sm)',
};

const handleStyle: CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  gap: '2px',
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: 'var(--tai-color-text)',
  textAlign: 'left',
  font: 'inherit',
};

const methodsStyle: CSSProperties = {
  fontSize: 'var(--tai-text-xs)',
  color: 'var(--tai-color-text-muted)',
  fontFamily: 'var(--tai-font-sans)',
};

const removeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.25rem',
  height: '1.25rem',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-sm)',
  background: 'transparent',
  color: 'var(--tai-color-text-muted)',
  cursor: 'pointer',
  lineHeight: 1,
};

export function ScopeItemChip({
  data,
  interactive,
  onRemove,
  removeLabel,
}: {
  readonly data: ChipData;
  readonly interactive: boolean;
  /** When present (and `interactive`), renders the inline remove control. */
  readonly onRemove?: (data: ChipData) => void;
  readonly removeLabel?: string;
}): ReactNode {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: data.url,
    data,
    disabled: !interactive,
  });

  const dragStyle: CSSProperties = {
    ...handleStyle,
    cursor: interactive ? 'grab' : 'default',
    transform:
      transform === null
        ? undefined
        : `translate3d(${String(transform.x)}px, ${String(transform.y)}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  };

  const kindLabel = data.itemType === 'sub-mcp' ? 'sub-MCP mount' : data.methods.join(' ');

  return (
    <span style={chipStyle}>
      <button
        ref={setNodeRef}
        type="button"
        style={dragStyle}
        aria-label={`${data.url}${kindLabel === '' ? '' : ` (${kindLabel})`}`}
        {...attributes}
        {...listeners}
      >
        <span>{data.url}</span>
        {kindLabel === '' ? null : <span style={methodsStyle}>{kindLabel}</span>}
      </button>
      {interactive && onRemove !== undefined ? (
        <button
          type="button"
          style={removeStyle}
          aria-label={removeLabel ?? `Remove ${data.url}`}
          onClick={() => {
            onRemove(data);
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
