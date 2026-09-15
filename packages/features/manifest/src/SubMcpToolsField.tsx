/**
 * The multi-select tools fieldset for the create-sub-MCP form: a scrollable
 * checkbox list of the available tools, with the loading/error/empty branches.
 */
import { Checkbox, EmptyState, errorMessage, ErrorState, Skeleton } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

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
          {(toolsQuery.data ?? []).map((tool) => (
            <Checkbox
              key={tool}
              label={tool}
              checked={selected.includes(tool)}
              onCheckedChange={(checked) => {
                onToggle(tool, checked);
              }}
            />
          ))}
        </div>
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
