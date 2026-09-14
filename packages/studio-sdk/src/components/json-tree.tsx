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
import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { XCircleIcon } from './icons';
import { useOverflowRegion } from './scroll-region';
import { useClipboardCopy } from '../hooks/useClipboardCopy';
import {
  PAGE_SIZE,
  computeOpen,
  expandedOpenPaths,
  initialBaseline,
  isContainer,
  type Baseline,
} from './json-tree-model';
import { NO_CLIPBOARD, copyFailed, serializeForCopy } from './json-value-format';
import { JsonTreeContext, type JsonTreeContextValue } from './json-tree-context';
import { COPY_LABEL, CopyButton, JsonNode } from './json-tree-nodes';

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
