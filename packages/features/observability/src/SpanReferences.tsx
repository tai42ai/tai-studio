/**
 * One span field (Input / Output / Arguments / Result) as a JSON tree, and — when
 * the recorded value holds references to other steps' records — a toolbar to switch
 * between the value as recorded (each `{"$tai42_ref": …}` object shown as it is) and
 * the value resolved by the server (`getResolvedSpanValue`, the whole field).
 *
 * The resolved read has its own loading, missing-reference (502) and other-error
 * states; a value carrying `{"$tai42_unrecorded": true}` says some values were not
 * recorded. Every payload renders through the escaped JSON tree.
 */
import type { ApiClient } from '@tai42/api-client';
import { ApiError } from '@tai42/api-client';
import { Button, errorMessage, JsonTree, RadioGroup, Skeleton, useApi } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { resolvedKey } from './keys';

/** The one key of a reference object the writer records. */
const REFERENCE_KEY = '$tai42_ref';
/** The one key of the statement that a value existed but was not recorded. */
const UNRECORDED_KEY = '$tai42_unrecorded';
/** How deep the value walk goes. */
const MAX_DEPTH = 64;

/**
 * Visit every object node down to {@link MAX_DEPTH} with its path from the root (an
 * array item named by its index); `visit` returning true stops descent.
 */
function walk(
  value: unknown,
  visit: (node: Record<string, unknown>, path: readonly string[]) => boolean,
  path: readonly string[] = [],
): void {
  if (path.length > MAX_DEPTH || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item: unknown, index) => {
      walk(item, visit, [...path, String(index)]);
    });
    return;
  }
  const record = value as Record<string, unknown>;
  if (visit(record, path)) return;
  for (const [key, item] of Object.entries(record)) walk(item, visit, [...path, key]);
}

function isMarker(node: Record<string, unknown>, key: string): boolean {
  const keys = Object.keys(node);
  return keys.length === 1 && keys[0] === key;
}

/**
 * The path from the root to the body of every reference object the value holds (a
 * reference's own payload is not walked), in the tree's path form.
 */
export function referencePaths(value: unknown): string[][] {
  const paths: string[][] = [];
  walk(value, (node, path) => {
    if (!isMarker(node, REFERENCE_KEY)) return false;
    paths.push([...path, REFERENCE_KEY]);
    return true;
  });
  return paths;
}

/** How many reference objects the value holds (a reference's own payload is not walked). */
export function countReferences(value: unknown): number {
  return referencePaths(value).length;
}

/** Whether the value holds the not-recorded statement anywhere. */
export function hasUnrecorded(value: unknown): boolean {
  let found = false;
  walk(value, (node) => {
    if (isMarker(node, UNRECORDED_KEY)) found = true;
    return found;
  });
  return found;
}

type View = 'recorded' | 'resolved';

const VIEW_OPTIONS = [
  { value: 'recorded', label: 'As recorded' },
  { value: 'resolved', label: 'Resolved' },
] as const;

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-2)',
  flexWrap: 'wrap',
};

const noteStyle: CSSProperties = { margin: 0, fontSize: 'var(--tai-text-sm)' };

const errorPanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-err-text)',
  background: 'var(--tai-color-err-tint)',
  color: 'var(--tai-color-err-text)',
};

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** True when the failure is a 502: a referenced value the backend does not hold. */
function isMissingReference(error: unknown): boolean {
  return error instanceof ApiError && error.status === 502;
}

type Field = Parameters<ApiClient['getResolvedSpanValue']>[2];

function Resolved({
  traceId,
  spanId,
  field,
  label,
  references,
  onShowRecorded,
}: {
  readonly traceId: string;
  readonly spanId: string;
  readonly field: Field;
  readonly label: string;
  readonly references: number;
  readonly onShowRecorded: () => void;
}): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: resolvedKey(traceId, spanId, field),
    queryFn: ({ signal }) => api.getResolvedSpanValue(traceId, spanId, field, {}, signal),
  });
  const treeRef = useRef<HTMLDivElement>(null);
  const loaded = query.isSuccess;
  useEffect(() => {
    if (loaded) treeRef.current?.focus();
  }, [loaded]);

  if (query.isPending) {
    return (
      <div className="tai-stack tai-stack-2">
        <Skeleton height={160} />
        <p className="tai-muted" style={noteStyle}>
          Opening references…
        </p>
      </div>
    );
  }
  if (query.isError) {
    const missing = isMissingReference(query.error);
    return (
      <div role="alert" style={errorPanelStyle}>
        <span style={{ whiteSpace: 'pre-wrap' }}>
          {missing
            ? `A referenced value is missing from the monitoring backend: ${errorMessage(query.error)}`
            : `Could not open the references: ${errorMessage(query.error)}`}
        </span>
        {missing ? (
          <Button onClick={onShowRecorded}>Show as recorded</Button>
        ) : (
          <Button onClick={() => void query.refetch()}>Retry</Button>
        )}
      </div>
    );
  }
  return (
    <div className="tai-stack tai-stack-2">
      <div ref={treeRef} tabIndex={-1} data-testid="resolved-tree">
        <JsonTree data={query.data.value} label={label} />
      </div>
      <p className="tai-muted" style={noteStyle}>
        Full value assembled from {plural(references, 'reference')}.
      </p>
    </div>
  );
}

export function SpanValueSection({
  traceId,
  spanId,
  field,
  label,
  value,
  treeLabel,
}: {
  readonly traceId: string;
  readonly spanId: string;
  readonly field: Field;
  readonly label: string;
  readonly value: unknown;
  /** The tree's accessible name; defaults to `label`. */
  readonly treeLabel?: string;
}): ReactNode {
  const [view, setView] = useState<View>('recorded');
  const paths = useMemo(() => referencePaths(value), [value]);
  const references = paths.length;
  const name = treeLabel ?? label;

  return (
    <div className="tai-stack tai-stack-2">
      <span className="tai-label">{label}</span>
      {references > 0 ? (
        <div style={toolbarStyle}>
          <p className="tai-muted" style={noteStyle}>
            Recorded with {plural(references, 'reference')} to other steps.
          </p>
          <RadioGroup
            variant="segmented"
            orientation="horizontal"
            aria-label={`${label} view`}
            options={VIEW_OPTIONS}
            value={view}
            onValueChange={(next) => {
              setView(next as View);
            }}
          />
        </div>
      ) : null}
      {references > 0 && view === 'resolved' ? (
        <Resolved
          traceId={traceId}
          spanId={spanId}
          field={field}
          label={name}
          references={references}
          onShowRecorded={() => {
            setView('recorded');
          }}
        />
      ) : (
        // A value with references keeps the tree's depth default and opens the path to
        // every reference object, so each shows its `$tai42_ref` key, span id, field and
        // pointer as recorded at any depth the walk reaches; a value without references
        // opens collapsed.
        <JsonTree
          data={value}
          defaultExpanded={references > 0 ? undefined : false}
          openPaths={paths}
          label={name}
        />
      )}
      {hasUnrecorded(value) ? (
        <p className="tai-muted" style={noteStyle}>
          Some values were not recorded (monitoring was off when those steps ran).
        </p>
      ) : null}
    </div>
  );
}
