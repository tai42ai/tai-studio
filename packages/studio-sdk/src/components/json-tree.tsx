/**
 * `JsonTree` — a collapsible viewer for arbitrary JSON on the design system's
 * terminal ground (`tai-code-block`). Objects and arrays are native
 * `<details>`/`<summary>` disclosures; primitives render inline, tinted by their
 * `tai-syntax-*` type class. All values render as React TEXT children, so markup in
 * a payload is escaped — never an HTML sink.
 *
 * It mounts against guaranteed-large payloads (a trace span's whole input/output),
 * so it is BOUNDED by construction:
 *
 * - Nodes deeper than {@link AUTO_EXPAND_DEPTH} start COLLAPSED, and a collapsed node
 *   renders no children. `defaultExpanded` overrides per call site.
 * - Expand-all opens breadth-first only until {@link AUTO_EXPAND_NODE_BUDGET} nodes
 *   render and never past {@link MAX_AUTO_DEPTH}; a node beyond either opens on click.
 * - A container over {@link PAGE_SIZE} children renders one page plus a "show more".
 * - Copy-whole and copy-node write JSON to the clipboard; a refused write shows an alert.
 *
 * The scrolling pane IS the scrolling box, carrying the region attributes itself
 * rather than nesting a `ScrollRegion` that would add a second scroller.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactElement } from 'react';

import { CheckIcon, CopyIcon, XCircleIcon } from './icons';
import { useOverflowRegion } from './scroll-region';
import { COPIED_LABEL, COPIED_RESET_MS, useClipboardCopy } from '../hooks/useClipboardCopy';

export interface JsonTreeProps {
  readonly data: unknown;
  /**
   * Opts the whole tree out of the depth-guarded default: `true` expands every
   * node (up to the depth cap), `false` collapses to the root. Omitted, the tree
   * opens through {@link AUTO_EXPAND_DEPTH} and collapses everything below.
   */
  readonly defaultExpanded?: boolean;
  /** The region's accessible name, applied only while the pane actually scrolls. */
  readonly label?: string;
}

/** The region's name when the caller supplies none. */
const DEFAULT_LABEL = 'JSON';

/** The deepest level opened by the guarded default; deeper nodes start collapsed. */
const AUTO_EXPAND_DEPTH = 1;

/**
 * The deepest level EXPAND-ALL reaches. Past it a node opens only on an explicit
 * click, so the one action that opens the whole tree still cannot force an
 * unbounded-depth payload into the DOM in a single stroke.
 */
const MAX_AUTO_DEPTH = 6;

/** Children rendered per page; the rest wait behind a "show more" control. */
const PAGE_SIZE = 100;

/**
 * The most rendered nodes EXPAND-ALL may auto-open in one stroke. The depth cap and
 * the per-page limit each bound ONE dimension, but a payload that is wide AND deep
 * multiplies them — auto-opening every node up to the cap would lay out on the order
 * of PAGE_SIZE^depth nodes and freeze the tab. Expand-all instead opens containers
 * breadth-first only until this budget is spent; a node past it stays collapsed and
 * opens on an explicit click, so a huge payload opens a bounded, usable subset.
 */
const AUTO_EXPAND_NODE_BUDGET = 1500;

/** A copy control's resting face; whichever is exposed is also its accessible name. */
const COPY_LABEL = 'Copy';

/** Shown when the browser offers no clipboard at all (any non-secure context). */
const NO_CLIPBOARD =
  'This browser will not write to the clipboard here. Select the value and copy it by hand.';

/** Shown when the write, or the value's serialization, is offered and refused. */
function copyFailed(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `Copy failed: ${detail}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a value is a disclosure (object or array) rather than a leaf. */
function isContainer(value: unknown): boolean {
  return Array.isArray(value) || isRecord(value);
}

function primitiveText(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'string':
      return `"${value}"`;
    case 'number':
    case 'bigint':
    case 'boolean':
      return String(value);
    case 'symbol':
      return value.toString();
    case 'function':
      return '[Function]';
    default:
      return '[object]';
  }
}

/**
 * `JSON.stringify` is TYPED to always return `string`, but a value it cannot
 * represent (a function, a bare `undefined`) yields `undefined` at runtime. This
 * boundary admits the absence the standard-library overload denies, so the guard
 * below is a real check rather than a cast around one.
 */
function stringifyJson(value: unknown): string | undefined {
  return JSON.stringify(value, null, 2);
}

/**
 * The value's pretty JSON for the clipboard. A value JSON cannot represent (a
 * function, a bare `undefined`) has no JSON, so its readable form is copied
 * rather than an empty string. A value JSON REFUSES (a `bigint`) throws here, and
 * the caller renders that as the same visible alert a blocked write is.
 */
function serializeForCopy(value: unknown): string {
  return stringifyJson(value) ?? String(value);
}

/**
 * A child's identity for the open-state map. Each segment is percent-encoded, so a
 * key that itself contains the separator cannot collide with a different path.
 */
function childPath(parent: string, name: string): string {
  const segment = encodeURIComponent(name);
  return parent === '' ? segment : `${parent}/${segment}`;
}

/** The default open state a call site's `defaultExpanded` selects. */
type Baseline = 'depth' | 'expanded' | 'collapsed';

function initialBaseline(defaultExpanded: boolean | undefined): Baseline {
  if (defaultExpanded === true) return 'expanded';
  if (defaultExpanded === false) return 'collapsed';
  return 'depth';
}

/**
 * The set of paths EXPAND-ALL auto-opens: a breadth-first sweep that opens each
 * container in turn — spending its visible child count against a shared node budget
 * and enqueuing that page's own container children — skipping any node whose page
 * would overspend {@link AUTO_EXPAND_NODE_BUDGET} or that sits past {@link MAX_AUTO_DEPTH}.
 * Only a bounded window of a huge payload is materialized, so this stays cheap even
 * when the data is enormous; the paths it omits stay collapsed and open on a click.
 */
function expandedOpenPaths(root: unknown): ReadonlySet<string> {
  const open = new Set<string>();
  if (!isContainer(root)) return open;

  let budget = AUTO_EXPAND_NODE_BUDGET;
  const queue: { readonly value: unknown; readonly path: string; readonly depth: number }[] = [
    { value: root, path: '', depth: 0 },
  ];

  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    if (node.depth >= MAX_AUTO_DEPTH) continue;

    const shown = Math.min(PAGE_SIZE, containerCount(node.value));
    // Skip when the budget can't seat a whole page (a later, smaller node may still fit).
    if (shown > budget) continue;
    budget -= shown;
    open.add(node.path);

    for (const [name, childValue] of sliceEntries(node.value, shown)) {
      if (isContainer(childValue)) {
        queue.push({ value: childValue, path: childPath(node.path, name), depth: node.depth + 1 });
      }
    }
  }

  return open;
}

/**
 * Whether a node is open, from the baseline and the reader's own toggles. An
 * explicit toggle always wins; otherwise the baseline decides — the depth-guarded
 * default opens through {@link AUTO_EXPAND_DEPTH}, expand-all opens the budgeted
 * breadth-first set, collapse-all opens nothing.
 */
function computeOpen(
  baseline: Baseline,
  overrides: ReadonlyMap<string, boolean>,
  expandedPaths: ReadonlySet<string> | null,
  path: string,
  depth: number,
): boolean {
  const override = overrides.get(path);
  if (override !== undefined) return override;
  if (baseline === 'expanded') return expandedPaths?.has(path) ?? false;
  if (baseline === 'collapsed') return false;
  return depth <= AUTO_EXPAND_DEPTH;
}

interface JsonTreeContextValue {
  /** Whether the node at `path`/`depth` is open right now. */
  readonly isOpen: (path: string, depth: number) => boolean;
  /** Records the reader's explicit toggle of one node. */
  readonly setOpen: (path: string, open: boolean) => void;
  /** Copies a value's JSON, returning whether the write succeeded. */
  readonly copy: (value: unknown) => Promise<boolean>;
  readonly pageSize: number;
}

const JsonTreeContext = createContext<JsonTreeContextValue | null>(null);

/** The shared tree state; a subcomponent outside a `JsonTree` is a wiring error. */
function useJsonTreeContext(): JsonTreeContextValue {
  const context = useContext(JsonTreeContext);
  if (context === null) {
    throw new Error('JsonTree subcomponents must be rendered inside a JsonTree.');
  }
  return context;
}

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

/** The copy control sits at the far end of a disclosure's row. */
const nodeCopyStyle: CSSProperties = { marginLeft: 'auto' };

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

/** The syntax class for a primitive's type; anything outside JSON reads as muted. */
function primitiveClass(value: unknown): string {
  if (typeof value === 'string') return 'tai-syntax-string';
  if (typeof value === 'number' || typeof value === 'bigint') return 'tai-syntax-number';
  if (typeof value === 'boolean') return 'tai-syntax-bool';
  if (value === null || value === undefined) return 'tai-syntax-null';
  return 'tai-muted';
}

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
function CopyButton({ value, label, variant }: CopyButtonProps): ReactElement {
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

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    // Inside a `<summary>` a click both toggles the disclosure natively and reaches
    // the summary's own toggle handler; neither should fire for a copy.
    event.preventDefault();
    event.stopPropagation();
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
      style={{ ...nodeCopyStyle, ...nodeCopyButtonStyle }}
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

/** A container's child count, without materializing its entries. */
function containerCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  throw new Error('containerCount expects an array or a record.');
}

/**
 * The first `end` entries of a container, arrays keyed by index and objects by
 * key. Only the visible window is materialized, so a million-element array's
 * children never all exist at once.
 */
function sliceEntries(value: unknown, end: number): [string, unknown][] {
  if (Array.isArray(value)) {
    return value.slice(0, end).map((item, index) => [String(index), item]);
  }
  // Slice the keys before reading values, so only the visible window is materialized.
  if (isRecord(value))
    return Object.keys(value)
      .slice(0, end)
      .map((key) => [key, value[key]]);
  throw new Error('sliceEntries expects an array or a record.');
}

/** One container's summary text: its kind and its child count. */
function containerSummary(value: unknown, count: number): string {
  return Array.isArray(value) ? `Array(${String(count)})` : `Object(${String(count)})`;
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

function JsonNode({ name, value, depth, path }: NodeProps): ReactElement {
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

    return (
      <details open={open}>
        <summary style={summaryStyle} onClick={handleToggle}>
          {name !== undefined ? <span className="tai-syntax-key">{name}: </span> : null}
          <span className="tai-muted">{summary}</span>
          {/* The root's copy-node control would duplicate the toolbar's copy-whole. */}
          {depth > 0 ? (
            <CopyButton
              value={value}
              variant="icon"
              label={name !== undefined ? `Copy ${name}` : COPY_LABEL}
            />
          ) : null}
        </summary>
        {open ? <NodeChildren value={value} count={count} depth={depth} path={path} /> : null}
      </details>
    );
  }

  return (
    <div>
      {name !== undefined ? <span className="tai-syntax-key">{name}: </span> : null}
      <span className={primitiveClass(value)}>{primitiveText(value)}</span>
    </div>
  );
}

export function JsonTree({ data, defaultExpanded, label }: JsonTreeProps): ReactElement {
  const [baseline, setBaseline] = useState<Baseline>(() => initialBaseline(defaultExpanded));
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());

  const {
    error: copyError,
    announcement,
    copy: copyText,
  } = useClipboardCopy({
    noClipboard: NO_CLIPBOARD,
    writeFailed: copyFailed,
  });

  // No consumer ref: the measurement's own callback ref is the only thing that
  // needs the pane, and this component publishes no `ref` prop.
  const region = useOverflowRegion(undefined, label ?? DEFAULT_LABEL);

  // Expand-all's open set is a function of the data alone, and it is consulted only
  // while that baseline is active; deriving it lazily keeps a collapsed or
  // depth-default tree from sweeping the payload at all.
  const expandedPaths = useMemo(
    () => (baseline === 'expanded' ? expandedOpenPaths(data) : null),
    [baseline, data],
  );

  const isOpen = useCallback(
    (path: string, depth: number): boolean =>
      computeOpen(baseline, overrides, expandedPaths, path, depth),
    [baseline, overrides, expandedPaths],
  );

  const setOpen = useCallback((path: string, open: boolean): void => {
    setOverrides((previous) => {
      const next = new Map(previous);
      next.set(path, open);
      return next;
    });
  }, []);

  // The value's JSON is produced lazily inside the write, so a value JSON refuses
  // (a `bigint`) surfaces as the same visible alert a blocked write does.
  const copy = useCallback(
    (value: unknown): Promise<boolean> => copyText(() => serializeForCopy(value)),
    [copyText],
  );

  const context = useMemo<JsonTreeContextValue>(
    () => ({ isOpen, setOpen, copy, pageSize: PAGE_SIZE }),
    [isOpen, setOpen, copy],
  );

  const expandAll = (): void => {
    setBaseline('expanded');
    setOverrides(new Map());
  };
  const collapseAll = (): void => {
    setBaseline('collapsed');
    setOverrides(new Map());
  };

  const showToolbar = isContainer(data);

  return (
    <JsonTreeContext.Provider value={context}>
      <div className="tai-stack tai-stack-2">
        {showToolbar ? (
          <div className="tai-row">
            <button type="button" className="tai-btn tai-btn-ghost" onClick={expandAll}>
              Expand all
            </button>
            <button type="button" className="tai-btn tai-btn-ghost" onClick={collapseAll}>
              Collapse all
            </button>
            <CopyButton value={data} variant="text" label={COPY_LABEL} />
            <span aria-live="polite" className="tai-visually-hidden">
              {announcement}
            </span>
          </div>
        ) : null}
        {copyError !== undefined ? (
          <span role="alert" className="tai-field-error">
            <XCircleIcon />
            {copyError}
          </span>
        ) : null}
        <div className="tai-code-block" {...region}>
          <JsonNode value={data} depth={0} path="" />
        </div>
      </div>
    </JsonTreeContext.Provider>
  );
}
