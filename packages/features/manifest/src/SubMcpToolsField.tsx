/**
 * The multi-select tools fieldset for the create-sub-MCP form: a filter box over a
 * scrollable checkbox list of the available tools, with the loading/error/empty
 * branches. Each tool reads its display label (`Display (raw)`), and the filter keeps
 * the tools whose label contains the typed text; a ticked tool the filter hides stays
 * ticked.
 */
import {
  Checkbox,
  EmptyState,
  errorMessage,
  ErrorState,
  Field,
  matchesSearch,
  Skeleton,
  TextInput,
  toolDisplayLabel,
  useToolDisplayNames,
} from '@tai42/studio-sdk';
import { type ReactNode, useState } from 'react';

/** The minimal tools-list query shape this fieldset reads. */
interface ToolsQueryLike {
  readonly data: readonly string[] | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly refetch: () => unknown;
}

export function SubMcpToolsField({
  toolsQuery,
  selected,
  toolsError,
  onToggle,
}: {
  readonly toolsQuery: ToolsQueryLike;
  readonly selected: readonly string[];
  readonly toolsError: string | undefined;
  readonly onToggle: (tool: string, checked: boolean) => void;
}): ReactNode {
  return (
    <fieldset
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tai-space-2)',
      }}
    >
      <legend style={{ padding: 0, fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>Tools</legend>
      <p
        style={{
          margin: 0,
          fontSize: 'var(--tai-text-sm)',
          color: 'var(--tai-color-text-muted)',
        }}
      >
        Choose the tools this sub-MCP exposes.
      </p>
      {toolsQuery.isPending ? (
        <Skeleton height={80} />
      ) : toolsQuery.isError ? (
        <ErrorState
          message={errorMessage(toolsQuery.error)}
          onRetry={() => void toolsQuery.refetch()}
        />
      ) : (toolsQuery.data ?? []).length === 0 ? (
        <EmptyState title="No tools available" description="There are no tools to expose yet." />
      ) : (
        <ToolChecklist tools={toolsQuery.data ?? []} selected={selected} onToggle={onToggle} />
      )}
      {toolsError !== undefined ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 'var(--tai-text-sm)',
            color: 'var(--tai-color-err-text)',
          }}
        >
          {toolsError}
        </p>
      ) : null}
    </fieldset>
  );
}

/** The filter box and the checkbox list it narrows. */
function ToolChecklist({
  tools,
  selected,
  onToggle,
}: {
  readonly tools: readonly string[];
  readonly selected: readonly string[];
  readonly onToggle: (tool: string, checked: boolean) => void;
}): ReactNode {
  const names = useToolDisplayNames();
  const [filter, setFilter] = useState('');
  const shown = tools
    .map((tool) => ({ tool, label: toolDisplayLabel(names, tool) }))
    .filter(({ label }) => matchesSearch(filter, label));
  return (
    <>
      <Field label="Filter tools">
        <TextInput
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
          }}
          onKeyDown={(event) => {
            // The filter narrows the list; Enter in it never submits the enclosing form.
            if (event.key === 'Enter') event.preventDefault();
          }}
        />
      </Field>
      <div
        style={{
          border: '1px solid var(--tai-color-border)',
          borderRadius: 'var(--tai-radius-md)',
          padding: 'var(--tai-space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--tai-space-2)',
          maxHeight: '16rem',
          overflowY: 'auto',
        }}
      >
        {shown.length === 0 ? (
          <p role="status" className="tai-status" style={{ margin: 0 }}>
            No tool matches “{filter.trim()}”.
          </p>
        ) : (
          shown.map(({ tool, label }) => (
            <Checkbox
              key={tool}
              label={label}
              checked={selected.includes(tool)}
              onCheckedChange={(checked) => {
                onToggle(tool, checked);
              }}
            />
          ))
        )}
      </div>
    </>
  );
}
