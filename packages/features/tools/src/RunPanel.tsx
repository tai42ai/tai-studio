/**
 * The RUN PANEL for a selected tool.
 *
 * PANEL-VS-AUTOFORM: a plugin may contribute a rich run panel for a specific
 * tool via `context.registerToolPanel`. `RunPanel` fetches the tool's params schema, then
 * consults the live plugin registry (`getContributions`): if a panel targets this
 * tool it is rendered with `ToolPanelProps`; OTHERWISE — the common case — the
 * schema-driven AUTO-FORM path runs.
 *
 * The auto-form seeds its value from `defaultValueForSchema`, renders the
 * `SchemaForm`, and on Run validates with `validateAgainstSchema` BEFORE calling
 * `runTool`. The run is a synchronous POST under a client timeout (see `run.ts`):
 * pending → a loud running state; success → the typed `ResultViewer`; a timeout →
 * a DISTINCT "still executing server-side" notice; any other failure → the
 * generic loud `ErrorState`.
 */
import { useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  ErrorState,
  SchemaForm,
  Skeleton,
  Spinner,
  defaultValueForSchema,
  errorMessage,
  useApi,
  useCanWrite,
  useCapabilities,
  validateAgainstSchema,
  type JsonSchema,
  type SchemaFormErrors,
  type ToolPanelProps,
} from '@tai42/studio-sdk';
import { getContributions } from '@tai42/studio-sdk/host';

import { toolSchemaKey } from './keys';
import { toolRunsListKey } from './backgroundRunsCommon';
import { ResultViewer } from './ResultViewer';
import { RunTimeoutError, runToolWithTimeout } from './run';
import { BackgroundRuns } from './BackgroundRuns';

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const readOnlyNoteStyle: CSSProperties = {
  margin: 0,
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

/**
 * The two run doors, each a CONCRETE route so the projection can method-gate it. The
 * synchronous Run POSTs the admin-only `/api/run-tool`; Run in background POSTs
 * `/api/tool-runs`. The tool-selection gate (`projection.tools`) fills the whole registry
 * the moment EITHER door is projected, so it cannot tell the two apart — a scoped editor
 * reaches the panel via the background door yet the sync door 403s. Each button therefore
 * gates on its OWN door (projection ⊆ gate), independent of tool visibility.
 */
const RUN_TOOL_ROUTE = '/api/run-tool';
const TOOL_RUNS_ROUTE = '/api/tool-runs';

/** The distinct, loud "run still executing server-side" state (honest limit).
 * Deliberately NOT the generic `ErrorState`: a different heading, colour, and a
 * `do-not-retry` warning so the operator can tell a live run from a safe retry. */
function TimeoutNotice(): ReactNode {
  return (
    <div
      role="alert"
      data-testid="tool-run-timeout"
      style={{
        padding: 'var(--tai-space-4)',
        border: '1px solid var(--tai-color-warning)',
        borderRadius: 'var(--tai-radius-md)',
        color: 'var(--tai-color-text)',
        background: 'color-mix(in srgb, var(--tai-color-warning) 10%, var(--tai-color-surface))',
      }}
    >
      <strong style={{ color: 'var(--tai-color-warning)' }}>Run still executing server-side</strong>
      <p style={{ margin: 'var(--tai-space-2) 0 0', whiteSpace: 'pre-wrap' }}>
        This run is still executing on the server; a synchronous run&apos;s result cannot be
        retrieved once the client disconnects. For a long or interactive tool, use{' '}
        <strong>Run in background</strong> below — a background run survives a disconnect and its
        result is retrievable from the recent-runs list.
      </p>
      <p style={{ margin: 'var(--tai-space-2) 0 0', whiteSpace: 'pre-wrap' }}>
        Do not retry — the tool&apos;s side effects may still be completing.
      </p>
    </div>
  );
}

/** The schema-driven auto-form run path. Exported for direct unit testing. */
export function AutoFormRunPanel({
  toolName,
  schema,
  description,
}: {
  readonly toolName: string;
  readonly schema: JsonSchema;
  readonly description?: string | null;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const { state } = useCapabilities();
  const [value, setValue] = useState<unknown>(() => defaultValueForSchema(schema));
  const [errors, setErrors] = useState<SchemaFormErrors | undefined>(undefined);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);

  // Projection ⊆ gate, per run door: the sync Run 403s unless the projection reaches
  // `POST /api/run-tool` (admin-only), the background Run unless it reaches
  // `POST /api/tool-runs`. Both fail closed while the projection is not ready.
  const canRunSync = useCanWrite(RUN_TOOL_ROUTE, 'POST');
  const canRunBackground = useCanWrite(TOOL_RUNS_ROUTE, 'POST');
  // Once ready, a caller reaching NEITHER door would 403 on every run: show a read-only
  // note instead of dead buttons. Before ready, both buttons render disabled (fail-safe).
  const ready = state.status === 'ready';
  const noRunDoor = ready && !canRunSync && !canRunBackground;

  const run = useMutation({
    mutationFn: (kwargs: Record<string, unknown>) => runToolWithTimeout(api, toolName, kwargs),
  });

  const background = useMutation({
    mutationFn: (kwargs: Record<string, unknown>) =>
      api.submitToolRun({ tool_name: toolName, arguments: kwargs }),
    onSuccess: (result) => {
      setActiveRunId(result.run_id);
      // Refetch the recent-runs list so the just-submitted run appears at once.
      // The list stops polling once every listed run is terminal, so a run
      // submitted into an empty or all-terminal list would otherwise never show
      // until the next manual refetch; invalidating restarts the poll now that a
      // running run is present.
      void queryClient.invalidateQueries({ queryKey: toolRunsListKey(toolName) });
    },
  });

  /** Validate the form and return the run-tool kwargs, or `null` when invalid.
   * run-tool kwargs must be an object; a non-object form root (scalar/array,
   * which SchemaForm supports) is never a valid kwargs map, so guard rather than
   * blindly cast. */
  const validatedKwargs = (): Record<string, unknown> | null => {
    const validation = validateAgainstSchema(schema, value);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return null;
    }
    setErrors(undefined);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  };

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    // Guard the door too, not only the button: a form submit (Enter) must not fire a run
    // the gate denies.
    if (!canRunSync) return;
    const kwargs = validatedKwargs();
    if (kwargs !== null) run.mutate(kwargs);
  };

  const onRunInBackground = (): void => {
    if (!canRunBackground) return;
    const kwargs = validatedKwargs();
    if (kwargs !== null) background.mutate(kwargs);
  };

  const timedOut = run.isError && run.error instanceof RunTimeoutError;

  return (
    <div style={stackStyle}>
      {description !== undefined && description !== null && description.length > 0 ? (
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>{description}</p>
      ) : null}

      <form onSubmit={onSubmit} style={stackStyle}>
        <SchemaForm schema={schema} value={value} onChange={setValue} errors={errors} />
        {noRunDoor ? (
          <p role="note" data-testid="run-read-only-note" style={readOnlyNoteStyle}>
            Running this tool is outside your access — it is shown read-only.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--tai-space-3)', flexWrap: 'wrap' }}>
            {ready && !canRunSync ? null : (
              <Button type="submit" variant="primary" disabled={!canRunSync || run.isPending}>
                {run.isPending ? <Spinner label="Running" /> : null}
                Run
              </Button>
            )}
            {ready && !canRunBackground ? null : (
              <Button
                type="button"
                variant="secondary"
                onClick={onRunInBackground}
                disabled={!canRunBackground || background.isPending}
              >
                {background.isPending ? <Spinner label="Submitting" /> : null}
                Run in background
              </Button>
            )}
          </div>
        )}
      </form>

      {background.isError ? <ErrorState message={errorMessage(background.error)} /> : null}

      {run.isPending ? (
        <div
          role="status"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}
        >
          <Spinner label="Running" />
          <span>Running — the tool is executing on the server.</span>
        </div>
      ) : null}

      {timedOut ? (
        <TimeoutNotice />
      ) : run.isError ? (
        <ErrorState message={errorMessage(run.error)} />
      ) : null}

      {run.isSuccess ? (
        <section style={stackStyle}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Result</h3>
          <ResultViewer result={run.data} />
        </section>
      ) : null}

      <BackgroundRuns toolName={toolName} activeRunId={activeRunId} />
    </div>
  );
}

export function RunPanel({ toolName }: { readonly toolName: string }): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: toolSchemaKey(toolName),
    queryFn: () => api.getToolSchema(toolName),
  });

  if (query.isPending) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <Skeleton height={24} width="40%" />
        <Skeleton height={120} />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const panel = getContributions().toolPanels.get(toolName);
  if (panel) {
    const PanelComponent = panel.component;
    const panelProps: ToolPanelProps = {
      toolName,
      schema: query.data.input,
      run: (args) => runToolWithTimeout(api, toolName, args),
    };
    return <PanelComponent {...panelProps} />;
  }

  return (
    <AutoFormRunPanel
      toolName={toolName}
      schema={query.data.input}
      description={query.data.description}
    />
  );
}
