/**
 * The RUN PANEL for a selected tool.
 *
 * PANEL-VS-AUTOFORM: a plugin may contribute a rich run panel for a specific tool via
 * `context.registerToolPanel`. `RunPanel` fetches the tool's params schema, then
 * consults the live plugin registry: if a panel targets this tool it is rendered with
 * `ToolPanelProps`; OTHERWISE — the common case — the schema-driven AUTO-FORM path runs.
 *
 * The auto-form seeds its value from the schema, renders the `SchemaForm`, and on Run
 * validates BEFORE calling `runTool`. The run is a synchronous POST under a client
 * timeout (see {@link useAutoFormRun}): pending → a loud running state; success → the
 * typed `ResultViewer`; a timeout → a DISTINCT "still executing server-side" notice;
 * any other failure → the generic loud `ErrorState`.
 */
import {
  Button,
  errorMessage,
  ErrorState,
  FeatureDisabled,
  featureDisabledMessage,
  type JsonSchema,
  SchemaForm,
  Skeleton,
  Spinner,
  SubjectSection,
  type ToolPanelProps,
  useApi,
} from '@tai42/studio-sdk';
import { getContributions } from '@tai42/studio-sdk/host';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { AsksList, ParkedNote } from './AsksList';
import { BackgroundRuns } from './BackgroundRuns';
import { toolSchemaKey } from './keys';
import { ResultViewer } from './ResultViewer';
import { runToolWithTimeout } from './run';
import { type AutoFormRun, useAutoFormRun } from './useAutoFormRun';

/** The distinct, loud "run still executing server-side" state (honest limit).
 * Deliberately NOT the generic `ErrorState`: a different heading, colour, and a
 * `do-not-retry` warning so the operator can tell a live run from a safe retry. */
function TimeoutNotice(): ReactNode {
  return (
    <div role="alert" data-testid="tool-run-timeout" className="tai-warn-state">
      <strong className="tai-status-warn">Run still executing server-side</strong>
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

/** The run doors: the read-only note when no door is reachable, else the Run / Run in
 * background buttons (each gated on its own door). */
function RunActions({ run }: { readonly run: AutoFormRun }): ReactNode {
  if (run.noRunDoor) {
    return (
      <p role="note" data-testid="run-read-only-note" className="tai-muted" style={{ margin: 0 }}>
        Running this tool is outside your access — it is shown read-only.
      </p>
    );
  }
  return (
    <div className="tai-row">
      {run.showSyncButton ? (
        <Button type="submit" variant="primary" disabled={!run.canRunSync || run.run.isPending}>
          {run.run.isPending ? <Spinner label="Running" /> : null}
          Run
        </Button>
      ) : null}
      {run.showBackgroundButton ? (
        <Button
          type="button"
          variant="secondary"
          onClick={run.onRunInBackground}
          disabled={!run.canRunBackground || run.background.isPending}
        >
          {run.background.isPending ? <Spinner label="Submitting" /> : null}
          Run in background
        </Button>
      ) : null}
    </div>
  );
}

/** The run outcome: a background-submit failure, the synchronous running state, a
 * timeout or generic error, and the typed result. */
function RunOutcome({ run }: { readonly run: AutoFormRun }): ReactNode {
  return (
    <>
      {run.background.isError ? (
        run.backgroundDisabled ? (
          <FeatureDisabled
            feature="Background runs"
            message={featureDisabledMessage(run.background.error)}
          />
        ) : (
          <ErrorState message={errorMessage(run.background.error)} />
        )
      ) : null}

      {run.run.isPending ? (
        <div role="status" className="tai-row">
          <Spinner label="Running" />
          <span>Running — the tool is executing on the server.</span>
        </div>
      ) : null}

      {run.timedOut ? (
        <TimeoutNotice />
      ) : run.run.isError ? (
        <ErrorState message={errorMessage(run.run.error)} />
      ) : null}

      {run.runView?.kind === 'result' ? (
        <section className="tai-stack">
          <h3 className="tai-card-title">Result</h3>
          <ResultViewer result={run.runView.result} />
        </section>
      ) : null}

      {run.runView?.kind === 'asks' ? <AsksList asks={run.runView.asks} /> : null}

      {run.runView?.kind === 'parked' ? <ParkedNote testId="run-parked-note" /> : null}
    </>
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
  const run = useAutoFormRun({ toolName, schema });

  return (
    <div className="tai-stack">
      {description !== undefined && description !== null && description.length > 0 ? (
        <p className="tai-muted" style={{ margin: 0 }}>
          {description}
        </p>
      ) : null}

      <form onSubmit={run.onSubmit} className="tai-stack">
        <SchemaForm schema={schema} value={run.value} onChange={run.setValue} errors={run.errors} />
        <SubjectSection
          open={run.subject.open}
          onToggle={() => {
            run.subject.setOpen((open) => !open);
          }}
          target={run.subject.target}
          onTargetChange={run.subject.setTarget}
          kind={run.subject.kind}
          onKindChange={run.subject.setKind}
          subjectKey={run.subject.key}
          onKeyChange={run.subject.setKey}
          error={run.subject.error}
          targetOptions={run.subject.targetOptions}
          caption="Track this run’s result on a conversation subject so a later run can pick it up."
          targetPlaceholder="No subject"
          subjectKeyDescription="A literal key within the subject family."
        />
        <RunActions run={run} />
      </form>

      <RunOutcome run={run} />

      <BackgroundRuns toolName={toolName} activeRunId={run.activeRunId} />
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
      <div className="tai-stack tai-stack-3">
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
