/**
 * The bounded-traversal model behind `JsonTree`: container inspection, the paged
 * child slice, path identity, and the open-state computation for the depth
 * default, expand-all and collapse-all baselines. Pure — no React, no DOM.
 */
import { isRecord } from '../guards';

/** The deepest level opened by the guarded default; deeper nodes start collapsed. */
export const AUTO_EXPAND_DEPTH = 1;

/**
 * The deepest level EXPAND-ALL reaches. Past it a node opens only on an explicit
 * click, so the one action that opens the whole tree still cannot force an
 * unbounded-depth payload into the DOM in a single stroke.
 */
export const MAX_AUTO_DEPTH = 6;

/** Children rendered per page; the rest wait behind a "show more" control. */
export const PAGE_SIZE = 100;

/**
 * The most rendered nodes EXPAND-ALL may auto-open in one stroke. The depth cap and
 * the per-page limit each bound ONE dimension, but a payload that is wide AND deep
 * multiplies them — auto-opening every node up to the cap would lay out on the order
 * of PAGE_SIZE^depth nodes and freeze the tab. Expand-all instead opens containers
 * breadth-first only until this budget is spent; a node past it stays collapsed and
 * opens on an explicit click, so a huge payload opens a bounded, usable subset.
 */
export const AUTO_EXPAND_NODE_BUDGET = 1500;

/** Whether a value is a disclosure (object or array) rather than a leaf. */
export function isContainer(value: unknown): boolean {
  return Array.isArray(value) || isRecord(value);
}

/** A container's child count, without materializing its entries. */
export function containerCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  throw new Error('containerCount expects an array or a record.');
}

/**
 * The first `end` entries of a container, arrays keyed by index and objects by
 * key. Only the visible window is materialized, so a million-element array's
 * children never all exist at once.
 */
export function sliceEntries(value: unknown, end: number): [string, unknown][] {
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
export function containerSummary(value: unknown, count: number): string {
  return Array.isArray(value) ? `Array(${String(count)})` : `Object(${String(count)})`;
}

/**
 * A child's identity for the open-state map. Each segment is percent-encoded, so a
 * key that itself contains the separator cannot collide with a different path.
 */
export function childPath(parent: string, name: string): string {
  const segment = encodeURIComponent(name);
  return parent === '' ? segment : `${parent}/${segment}`;
}

/** The default open state a call site's `defaultExpanded` selects. */
export type Baseline = 'depth' | 'expanded' | 'collapsed';

export function initialBaseline(defaultExpanded: boolean | undefined): Baseline {
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
export function expandedOpenPaths(root: unknown): ReadonlySet<string> {
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
export function computeOpen(
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
