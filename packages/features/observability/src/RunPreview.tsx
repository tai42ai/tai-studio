/**
 * A run input/output preview cell: a truncated inline value that expands to a
 * `JsonTree` for a structured value. The tree mounts only once open, so a long runs
 * list never lays out a tree per row. The subtree is marked `data-run-preview` so a
 * click inside it never drills the row into the trace.
 */
import { JsonTree } from '@tai42/studio-sdk';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { previewTree, previewValue } from './format';

export interface RunPreviewProps {
  readonly value: unknown;
  readonly label: string;
}

const truncStyle: CSSProperties = {
  display: 'block',
  maxWidth: '14rem',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 'var(--tai-text-xs)',
  color: 'var(--tai-color-text-muted)',
};

export function RunPreview({ value, label }: RunPreviewProps): ReactNode {
  const [open, setOpen] = useState(false);
  const inline = previewValue(value);
  const tree = previewTree(value);

  if (tree === null) {
    return (
      <span className="tai-mono" style={truncStyle}>
        {inline}
      </span>
    );
  }

  return (
    <div
      data-run-preview=""
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}
    >
      <button
        type="button"
        className="tai-btn tai-btn-ghost"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
        }}
        style={{ justifyContent: 'flex-start', padding: 'var(--tai-space-1)' }}
      >
        <span className="tai-mono" style={truncStyle}>
          {inline}
        </span>
      </button>
      {open ? <JsonTree data={tree} defaultExpanded={false} label={label} /> : null}
    </div>
  );
}
