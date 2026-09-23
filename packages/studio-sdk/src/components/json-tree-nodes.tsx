/**
 * The rendered nodes of a `JsonTree`: the copy control, one disclosure/leaf node,
 * and a node's paged children. State is read from the tree context; layout uses
 * the code-block rhythm.
 */
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import { COPIED_LABEL, COPIED_RESET_MS } from '../hooks/useClipboardCopy';
import { CheckIcon, CopyIcon } from './icons';
import { useJsonTreeContext } from './json-tree-context';
import {
  childPath,
  containerCount,
  containerSummary,
  isContainer,
  sliceEntries,
} from './json-tree-model';
import { primitiveClass, primitiveText } from './json-value-format';

/** A copy control's resting face; whichever is exposed is also its accessible name. */
export const COPY_LABEL = 'Copy';

/**
 * One nesting level's indent: the child block insets and draws its own guide
 * rail. The depth is expressed by the DOM nesting, so each level repeats this
 * single step rather than computing an absolute offset.
 */
const childrenStyle: CSSProperties = {
  paddingLeft: 'var(--tai-space-4)',
  marginLeft: 'var(--tai-space-1)',
  borderLeft: '1px solid var(--tai-color-decor)',
};

/** A `<summary>` is a click target; browsers do not style it as one by default. */
const summaryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  cursor: 'pointer',
};

/**
 * A disclosure and its copy control share one row: the disclosure fills it and the
 * copy control sits at the far end, top-aligned with the summary so it stays on the
 * summary's line even when the open node's children run tall below it.
 */
const nodeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--tai-space-2)',
};

/** The disclosure takes the row's width, leaving the copy control at its end. */
const nodeDetailsStyle: CSSProperties = { flex: 1, minWidth: 0 };

/**
 * The per-node copy button's geometry: borrows `tai-icon-btn` for the focus ring,
 * muted ink and hover, then shrinks to the code rhythm so the row stays dense.
 */
const nodeCopyButtonStyle: CSSProperties = {
  width: 'auto',
  height: 'auto',
  padding: 'var(--tai-space-1)',
};

const showMoreStyle: CSSProperties = { marginTop: 'var(--tai-space-1)' };

interface CopyButtonProps {
  readonly value: unknown;
  /**
   * The button's resting accessible name. When it flips to its confirmed state the
   * name flips with it, so a control reading "Copied" is never still named "Copy"
   * (WCAG 2.5.3). A `text` button spells the name in its own words; an `icon` button
   * takes it from here.
   */
  readonly label: string;
  readonly variant: 'text' | 'icon';
}

/**
 * A copy control that writes its value to the clipboard and shows a transient
 * confirmed state. The write itself lives on the tree context, so a refusal is
 * reported ONCE — as the tree's shared alert — rather than inline at each of the
 * many buttons a large payload carries.
 */
export function CopyButton({ value, label, variant }: CopyButtonProps): ReactElement {
  const { copy } = useJsonTreeContext();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The write is async, so a copy can be in flight when the button unmounts (a dialog
  // holding the tree closes on the same click); checked before the resolution sets state.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleClick = (): void => {
    void copy(value).then((ok) => {
      if (!ok || !mounted.current) return;
      setCopied(true);
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        if (mounted.current) setCopied(false);
      }, COPIED_RESET_MS);
    });
  };

  if (variant === 'text') {
    return (
      <button type="button" className="tai-btn tai-btn-ghost" onClick={handleClick}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? COPIED_LABEL : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="tai-icon-btn"
      style={nodeCopyButtonStyle}
      aria-label={copied ? COPIED_LABEL : label}
      onClick={handleClick}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

interface NodeProps {
  readonly name?: string;
  readonly value: unknown;
  readonly depth: number;
  readonly path: string;
}

/**
 * The visible slice of a container's children, plus a "show more" control while
 * any remain. Rendered ONLY when the node is open, so a collapsed container costs
 * nothing and the page count follows how far the reader has opened it.
 */
function NodeChildren({
  value,
  count,
  depth,
  path,
}: {
  readonly value: unknown;
  readonly count: number;
  readonly depth: number;
  readonly path: string;
}): ReactElement {
  const { pageSize } = useJsonTreeContext();
  const [visible, setVisible] = useState(pageSize);
  const shownCount = Math.min(visible, count);
  const shown = sliceEntries(value, shownCount);
  const remaining = count - shownCount;

  return (
    <div style={childrenStyle}>
      {shown.map(([childName, childValue]) => (
        <JsonNode
          key={childName}
          name={childName}
          value={childValue}
          depth={depth + 1}
          path={childPath(path, childName)}
        />
      ))}
      {remaining > 0 ? (
        <button
          type="button"
          className="tai-btn tai-btn-ghost"
          style={showMoreStyle}
          onClick={() => {
            setVisible((current) => current + pageSize);
          }}
        >
          Show {String(Math.min(remaining, pageSize))} more
        </button>
      ) : null}
    </div>
  );
}

export function JsonNode({ name, value, depth, path }: NodeProps): ReactElement {
  const { isOpen, setOpen } = useJsonTreeContext();

  if (isContainer(value)) {
    const count = containerCount(value);
    const open = isOpen(path, depth);
    const summary = containerSummary(value, count);
    const handleToggle = (event: ReactMouseEvent<HTMLElement>): void => {
      // The disclosure is state-driven: cancel the browser's own toggle so the two
      // never diverge, then record the reader's intent.
      event.preventDefault();
      setOpen(path, !open);
    };

    const disclosure = (
      <details open={open} style={depth > 0 ? nodeDetailsStyle : undefined}>
        <summary style={summaryStyle} onClick={handleToggle}>
          {name !== undefined ? <span className="tai-syntax-key">{name}: </span> : null}
          <span className="tai-muted">{summary}</span>
        </summary>
        {open ? <NodeChildren value={value} count={count} depth={depth} path={path} /> : null}
      </details>
    );

    // The root's copy-node control would duplicate the toolbar's copy-whole.
    if (depth === 0) return disclosure;

    // The copy control is a SIBLING of the disclosure, never a child of its
    // interactive `<summary>`, so no interactive control nests inside another
    // (WCAG 4.1.2 name/role/value — a nested-interactive control has no reliable
    // accessible role). Both the disclosure toggle and the copy button stay
    // independently keyboard operable.
    return (
      <div style={nodeRowStyle}>
        {disclosure}
        <CopyButton
          value={value}
          variant="icon"
          label={name !== undefined ? `Copy ${name}` : COPY_LABEL}
        />
      </div>
    );
  }

  return (
    <div>
      {name !== undefined ? <span className="tai-syntax-key">{name}: </span> : null}
      <span className={primitiveClass(value)}>{primitiveText(value)}</span>
    </div>
  );
}
