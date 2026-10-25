/** The tool-list editor for one MCP entry (`include` or `exclude`): removable token
 *  chips plus an add row that picks a discovered tool and, for `include`, stacks
 *  extensions into a composed `tool:ext[:ext]` token. */
import type { Extension } from '@tai42/api-client';
import type { ToolListQuery } from '@tai42/studio-sdk';
import {
  Badge,
  Button,
  CloseIcon,
  ErrorState,
  ExtensionPicker,
  ToolPicker,
  useToolDisplayNames,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { baseToolOf } from './mcp-config-parse';

const MUTED_TEXT = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
} as const;

/**
 * The MCP status read as the tool pickers use it: each mounted server's bound tools,
 * with the read's own state. A TanStack `UseQueryResult` of the status satisfies it.
 */
export interface BoundToolsRead {
  readonly data: { readonly bound: Readonly<Record<string, readonly string[]>> } | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly error: unknown;
  readonly refetch: () => unknown;
}

/** One server's discovered tools as a picker read: its bound names once the status loads. */
export function serverToolsQuery(read: BoundToolsRead, title: string | undefined): ToolListQuery {
  const bound = read.data?.bound;
  return {
    data: bound === undefined ? undefined : title === undefined ? [] : (bound[title] ?? []),
    isPending: read.isPending,
    isError: read.isError,
    isSuccess: read.isSuccess,
    error: read.error,
    refetch: () => {
      void read.refetch();
    },
  };
}

/** Whether a settled, successful read binds no tool to the server. */
function bindsNothing(query: ToolListQuery): boolean {
  return query.isSuccess && !query.isError && (query.data ?? []).length === 0;
}

/** The entry token the add row would add: the base tool, with its extension stack on a composer list. */
function composedToken(base: string | null, exts: readonly string[], composer: boolean): string {
  if (base === null || base === '') return '';
  return composer && exts.length > 0 ? [base, ...exts].join(':') : base;
}

/** One removable token chip (a composed `tool:ext[:ext]` string). */
function ToolChip({
  token,
  onRemove,
}: {
  readonly token: string;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--tai-space-1)' }}>
      <Badge variant="neutral">{token}</Badge>
      <Button
        type="button"
        variant="secondary"
        aria-label={`Remove ${token}`}
        onClick={onRemove}
        style={{ padding: '0 var(--tai-space-2)' }}
      >
        <CloseIcon />
      </Button>
    </span>
  );
}

/** The add row: select a discovered tool, optionally stack extensions (composer lists),
 *  and add the composed token. Owns the in-progress base/extension selection. */
function ToolAddRow({
  legend,
  values,
  discoveredTools,
  extensions,
  extensionsError,
  composer,
  idPrefix,
  onAdd,
}: {
  readonly legend: string;
  readonly values: readonly string[];
  readonly discoveredTools: ToolListQuery;
  readonly extensions: readonly Extension[];
  readonly extensionsError: string | undefined;
  readonly composer: boolean;
  readonly idPrefix: string;
  readonly onAdd: (token: string) => void;
}): ReactNode {
  const [base, setBase] = useState<string | null>(null);
  const [exts, setExts] = useState<readonly string[]>([]);
  // A discovered MCP tool may carry no overlay row yet, so the picker falls back to
  // the bare raw name; a mapped one shows its human display name.
  const displayNames = useToolDisplayNames();

  const token = composedToken(base, exts, composer);
  const duplicate = token !== '' && values.includes(token);

  const add = (): void => {
    if (token === '' || duplicate) return;
    onAdd(token);
    setBase(null);
    setExts([]);
  };

  // A loaded status that binds no tool to this server is a server state, not an
  // exhausted list: the server may be offline.
  if (bindsNothing(discoveredTools)) {
    return (
      <p style={MUTED_TEXT}>
        No discovered tools for this server yet — it may be offline. Existing entries above stay
        editable.
      </p>
    );
  }

  // `exclude` cannot list the same tool twice; `include` can (a base tool with
  // different extension stacks), so only the non-composer list excludes its picks.
  const excludeNames = composer ? undefined : values.map(baseToolOf);

  return (
    <>
      <ToolPicker
        query={discoveredTools}
        value={base}
        onChange={setBase}
        excludeNames={excludeNames}
        placeholder="Choose a tool…"
        aria-label={`${legend}: choose a tool`}
        idPrefix={`${idPrefix}-tool`}
        displayNames={displayNames}
        emptyNote="Every discovered tool for this server is already in this list."
        errorNote="This server's tools could not be read; the error is shown under Mounted servers. Existing entries above stay editable."
      />
      {composer ? (
        <>
          {extensionsError !== undefined ? (
            <ErrorState message={extensionsError} />
          ) : (
            <ExtensionPicker
              available={extensions}
              value={[...exts]}
              onChange={setExts}
              disabled={base === null || base === ''}
              idPrefix={`${idPrefix}-extensions`}
            />
          )}
          <p style={MUTED_TEXT}>
            New entry: <span style={{ fontFamily: 'var(--tai-font-mono)' }}>{token || '—'}</span>
          </p>
        </>
      ) : null}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={token === '' || duplicate}
        >
          Add to {legend.toLowerCase()}
        </Button>
        {duplicate ? (
          <span style={{ ...MUTED_TEXT, marginLeft: 'var(--tai-space-2)' }}>
            Already in the list.
          </span>
        ) : null}
      </div>
    </>
  );
}

/**
 * Editor for one tool list on an MCP entry (`include` or `exclude`). Existing
 * tokens render as removable chips — even ones no longer in the discovered set (a
 * server that is currently down), so the operator is never locked out of removing
 * their own config. The add row selects a discovered tool; the `include` list adds
 * an extension COMPOSER on top, stacking extensions into a `tool:ext[:ext]` token.
 */
export function ToolListEditor({
  legend,
  description,
  values,
  discoveredTools,
  extensions,
  extensionsError,
  composer,
  idPrefix,
  onChange,
}: {
  readonly legend: string;
  readonly description: string;
  readonly values: readonly string[];
  readonly discoveredTools: ToolListQuery;
  readonly extensions: readonly Extension[];
  readonly extensionsError: string | undefined;
  readonly composer: boolean;
  readonly idPrefix: string;
  readonly onChange: (next: string[]) => void;
}): ReactNode {
  const remove = (target: string): void => {
    onChange(values.filter((value) => value !== target));
  };

  return (
    <fieldset
      data-testid={idPrefix}
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tai-space-2)',
      }}
    >
      <legend style={{ padding: 0, fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>
        {legend}
      </legend>
      <p style={MUTED_TEXT}>{description}</p>

      {values.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-2)' }}>
          {values.map((value) => (
            <ToolChip
              key={value}
              token={value}
              onRemove={() => {
                remove(value);
              }}
            />
          ))}
        </div>
      ) : null}

      <ToolAddRow
        legend={legend}
        values={values}
        discoveredTools={discoveredTools}
        extensions={extensions}
        extensionsError={extensionsError}
        composer={composer}
        idPrefix={idPrefix}
        onAdd={(token) => {
          onChange([...values, token]);
        }}
      />
    </fieldset>
  );
}
