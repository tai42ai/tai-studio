/**
 * `JsonDiff` — a GENERIC, kind-agnostic structural diff of two JSON values,
 * hand-rolled (no diff library). It recursively walks OBJECT keys and emits one row
 * per leaf difference: a key present only on one side is `added`/`removed`, a key
 * whose value differs is `changed`.
 *
 * ARRAYS ARE LEAVES: an unequal array (by deep compare) emits exactly ONE `changed`
 * row at the array's path carrying both whole array values — there are no per-index
 * rows and no LCS alignment. A container object whose descendants differ emits rows
 * only for the differing leaves, never for the container itself.
 *
 * Rendered as a table: the dotted `path` (e.g. `fixed_kwargs.city`) as code, the
 * kind as a Badge (removed → danger, added → success, changed → neutral), and the
 * before/after values as a `JsonTree` for objects/arrays or escaped text for
 * scalars. Every value renders as React TEXT, so payload markup is escaped and this
 * is never an HTML sink.
 *
 * Each row also carries its `tai-diff-*` tint, but the tint only REINFORCES the
 * kind — the Badge spells the kind out in words, so a row is never identified by
 * color alone.
 */
import { type ReactNode } from 'react';

import { Badge } from './badge';
import { JsonTree } from './json-tree';
import { Table, TBody, TD, TH, THead, TR } from './table';

/** One leaf difference between the two JSON values. */
export interface JsonDiffRow {
  /** The dotted path to the differing key, e.g. `fixed_kwargs.city` (`''` = root). */
  readonly path: string;
  readonly kind: 'added' | 'removed' | 'changed';
  /** The value on the LEFT side — set for `removed` and `changed` rows. */
  readonly before?: unknown;
  /** The value on the RIGHT side — set for `added` and `changed` rows. */
  readonly after?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural deep-equality over JSON values (arrays compared position-wise). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function childPath(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/**
 * Recursively collect the leaf differences. Only when BOTH sides are plain objects
 * does the walk descend by key; anything else (arrays, scalars, a type mismatch) is
 * compared as a single leaf.
 */
function collect(path: string, before: unknown, after: unknown, rows: JsonDiffRow[]): void {
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((a, b) =>
      a.localeCompare(b),
    );
    for (const key of keys) {
      const next = childPath(path, key);
      const inBefore = key in before;
      const inAfter = key in after;
      if (inBefore && !inAfter) {
        rows.push({ path: next, kind: 'removed', before: before[key] });
      } else if (!inBefore && inAfter) {
        rows.push({ path: next, kind: 'added', after: after[key] });
      } else {
        collect(next, before[key], after[key], rows);
      }
    }
    return;
  }
  if (!deepEqual(before, after)) {
    rows.push({ path, kind: 'changed', before, after });
  }
}

/** The pure structural diff — every leaf difference between `before` and `after`. */
export function diffJson(before: unknown, after: unknown): JsonDiffRow[] {
  const rows: JsonDiffRow[] = [];
  collect('', before, after, rows);
  return rows;
}

const KIND_VARIANT = {
  added: 'success',
  removed: 'danger',
  changed: 'neutral',
} as const;

/** The row tint for each kind — a reinforcement of the Badge, never the sole cue. */
const KIND_ROW_CLASS = {
  added: 'tai-diff-added',
  removed: 'tai-diff-removed',
  changed: 'tai-diff-changed',
} as const;

/**
 * Render one side's value: a `JsonTree` for objects/arrays, escaped text for
 * scalars. The tree is a scroll region once it overflows, so it is named from
 * the row's path and its side — a table of rows all announcing "JSON" tells a
 * reader which pane they are in for none of them.
 */
function DiffValue({
  value,
  label,
}: {
  readonly value: unknown;
  readonly label: string;
}): ReactNode {
  if (Array.isArray(value) || isRecord(value)) {
    return <JsonTree data={value} defaultExpanded={false} label={label} />;
  }
  return <code className="tai-code">{JSON.stringify(value)}</code>;
}

/** The row's path as it reads on screen; the root diff has no path of its own. */
function pathLabel(path: string): string {
  return path === '' ? '(root)' : path;
}

const emptyCell = <span className="tai-muted">—</span>;

export interface JsonDiffProps {
  readonly before: unknown;
  readonly after: unknown;
}

export function JsonDiff({ before, after }: JsonDiffProps): ReactNode {
  const rows = diffJson(before, after);

  if (rows.length === 0) {
    return <p className="tai-muted">No differences between the two values.</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Path</TH>
          <TH>Change</TH>
          <TH>Before</TH>
          <TH>After</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row, index) => (
          <TR
            key={`${row.kind}-${row.path}-${String(index)}`}
            className={KIND_ROW_CLASS[row.kind]}
            data-testid={`diff-row-${row.path}`}
          >
            <TD className="tai-table-id" style={{ wordBreak: 'break-all' }}>
              {pathLabel(row.path)}
            </TD>
            <TD>
              <Badge variant={KIND_VARIANT[row.kind]}>{row.kind}</Badge>
            </TD>
            <TD>
              {row.kind === 'added' ? (
                emptyCell
              ) : (
                <DiffValue value={row.before} label={`${pathLabel(row.path)} before`} />
              )}
            </TD>
            <TD>
              {row.kind === 'removed' ? (
                emptyCell
              ) : (
                <DiffValue value={row.after} label={`${pathLabel(row.path)} after`} />
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
