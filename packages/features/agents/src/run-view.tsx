/**
 * The streaming-run engine + the shared SSE run view, factored out so BOTH the
 * plain-agent run and the authored-agent run import it one-directionally (no
 * feature-internal import cycle).
 *
 * STREAMING: `useStreamRun` opens an authed run stream over the api-client's
 * fetch + ReadableStream parser (never EventSource), folding parsed events into
 * state. A Stop button aborts the fetch — the server treats the disconnect as a
 * cancel, matching the contract. Errors surface loudly; nothing is swallowed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { ParsedAgentEvent } from '@tai42/api-client';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  ErrorState,
  JsonTree,
  PageHeader,
  SchemaForm,
  Stack,
  defaultValueForSchema,
  useApi,
  validateAgainstSchema,
} from '@tai42/studio-sdk';
import type { JsonSchema, SchemaFormErrors } from '@tai42/studio-sdk';

import { Timeline } from './timeline';

// -- streaming run hook ------------------------------------------------------

type RunStatus = 'idle' | 'running' | 'done' | 'error' | 'stopped';

interface RunState {
  readonly events: ParsedAgentEvent[];
  readonly status: RunStatus;
  readonly error: string | null;
}

export interface AgentRun extends RunState {
  readonly running: boolean;
  start: (input: unknown) => void;
  stop: () => void;
}

/** Opens one streaming run: the caller's POST body is `input`. */
export type StreamOpener = (
  input: unknown,
  signal: AbortSignal,
) => Promise<AsyncGenerator<ParsedAgentEvent>>;

/** Fold one parsed event into the run state, settling on a terminal frame. */
function reduceEvent(prev: RunState, parsed: ParsedAgentEvent): RunState {
  const events = [...prev.events, parsed];
  if (parsed.known && parsed.event.type === 'stream.end') {
    return { events, status: 'done', error: prev.error };
  }
  if (parsed.known && parsed.event.type === 'stream.error') {
    // A `stream.error` frame becomes a timeline `error` item, which solely owns
    // the message. `run.error` is left untouched — it is reserved for the
    // transport/catch path (non-2xx open / dropped connection), which yields no
    // timeline item — so the message renders exactly once.
    return { events, status: 'error', error: prev.error };
  }
  return { events, status: prev.status, error: prev.error };
}

/**
 * The streaming-run engine, parametrised by a `StreamOpener` so BOTH the plain
 * agent run (`POST /api/agents/{name}/runs`) and the authored agent run
 * (`POST /api/agents/authored/{name}/runs`) share one folding/abort/cleanup path.
 * `start` opens the stream and folds events in as they arrive; `stop` aborts the
 * fetch (closing the stream, which cancels the run server-side). The controller is
 * aborted on unmount so an abandoned view never keeps a run open.
 */
export function useStreamRun(open: StreamOpener): AgentRun {
  const [state, setState] = useState<RunState>({ events: [], status: 'idle', error: null });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    // A user Stop leaves a truncated transcript: settle 'stopped' so the badge
    // marks the run as deliberately halted rather than falling back to 'Ready',
    // which would read as a fresh, never-started run.
    setState((prev) => (prev.status === 'running' ? { ...prev, status: 'stopped' } : prev));
  }, []);

  const start = useCallback(
    (input: unknown) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ events: [], status: 'running', error: null });

      const consume = async (): Promise<void> => {
        try {
          const stream = await open(input, controller.signal);
          for await (const parsed of stream) {
            if (controller.signal.aborted) return;
            setState((prev) => reduceEvent(prev, parsed));
          }
          // Generator ended without a terminal frame: the backend emits one for
          // every in-process outcome, so its absence means the connection died
          // mid-run. Settle as an error, never a green "Finished". The message
          // lives on `run.error` (no timeline item) so it renders exactly once.
          setState((prev) =>
            prev.status === 'running'
              ? { ...prev, status: 'error', error: 'connection lost before the run finished' }
              : prev,
          );
        } catch (err) {
          if (controller.signal.aborted) return;
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      };

      void consume();
    },
    [open],
  );

  return { ...state, running: state.status === 'running', start, stop };
}

/** Drive one plain registered agent's streaming run. */
export function useAgentRun(agentName: string): AgentRun {
  const api = useApi();
  const open = useCallback<StreamOpener>(
    (input, signal) => api.streamAgentRun(agentName, input, signal),
    [api, agentName],
  );
  return useStreamRun(open);
}

/** Drive one AUTHORED agent's streaming run (the baked spec resolves server-side). */
export function useAuthoredAgentRun(agentName: string): AgentRun {
  const api = useApi();
  const open = useCallback<StreamOpener>(
    (input, signal) => api.streamAuthoredAgentRun(agentName, input, signal),
    [api, agentName],
  );
  return useStreamRun(open);
}

// -- shared run view ---------------------------------------------------------

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'Ready',
  running: 'Running…',
  done: 'Finished',
  error: 'Failed',
  stopped: 'Stopped',
};

/** The Badge tint each run status wears. */
const STATUS_VARIANT: Record<RunStatus, string> = {
  idle: 'neutral',
  running: 'neutral',
  done: 'success',
  error: 'danger',
  // A user Stop is neither success nor failure — a warning tint marks the
  // transcript as deliberately truncated.
  stopped: 'warning',
};

/**
 * The shared streaming-run view: a schema-driven input form, Run/Stop controls, a
 * loud transport-error banner, and the live event timeline. Reused by BOTH the
 * plain-agent run and the authored-agent run — the `run` engine, the input
 * `schema`, and (for authored runs) the read-only baked-field summary differ.
 */
export function StreamRunView({
  title,
  schema,
  run,
  onBack,
  backLabel,
  bakedFields,
  canRun = true,
}: {
  readonly title: string;
  readonly schema: JsonSchema;
  readonly run: AgentRun;
  readonly onBack: () => void;
  readonly backLabel: string;
  /** Read-only fixed (baked) fields shown above the input form (authored runs). */
  readonly bakedFields?: readonly { readonly key: string; readonly value: unknown }[];
  /** Whether the caller's projection reaches this run's POST door. `false` degrades the
   * view to read-only (no Run) — the plain-agent list is already projection-filtered, so
   * it defaults `true`; the authored run, whose door the projection cannot method-express,
   * threads its own gate. */
  readonly canRun?: boolean;
}): ReactNode {
  const [value, setValue] = useState<unknown>(() => defaultValueForSchema(schema));
  const [errors, setErrors] = useState<SchemaFormErrors | undefined>(undefined);

  const submit = (): void => {
    // Guard the door too, not only the button: a run must never fire when the gate denies it.
    if (!canRun) return;
    const found = validateAgainstSchema(schema, value);
    setErrors(found);
    if (Object.keys(found).length === 0) run.start(value);
  };

  return (
    <Stack>
      <div className="tai-row">
        <Button type="button" variant="ghost" onClick={onBack} aria-label={backLabel}>
          <ArrowLeftIcon />
          Back
        </Button>
      </div>
      <PageHeader
        eyebrow="Capabilities"
        title={title}
        actions={<Badge variant={STATUS_VARIANT[run.status]}>{STATUS_LABEL[run.status]}</Badge>}
      />

      <Card>
        <div className="tai-stack-2">
          {bakedFields && bakedFields.length > 0 ? (
            <div
              className="tai-stack-2"
              role="group"
              aria-labelledby="run-baked-heading"
              data-testid="run-baked-fields"
            >
              <span id="run-baked-heading" className="tai-muted">
                Baked fields (fixed at authoring; not editable here)
              </span>
              {bakedFields.map((field) => (
                <div key={field.key} data-testid="run-baked-field" data-field={field.key}>
                  <span className="tai-mono">{field.key}</span>
                  <JsonTree data={field.value} defaultExpanded={false} label={field.key} />
                </div>
              ))}
            </div>
          ) : null}
          <SchemaForm schema={schema} value={value} onChange={setValue} errors={errors} />
          <div className="tai-row">
            {canRun ? (
              <Button type="button" variant="primary" disabled={run.running} onClick={submit}>
                Run
              </Button>
            ) : (
              <span role="note" data-testid="run-read-only-note" className="tai-muted">
                Running this agent is outside your access — it is shown read-only.
              </span>
            )}
            {run.running ? (
              <Button
                type="button"
                variant="secondary"
                onClick={run.stop}
                aria-label="Stop the run"
              >
                Stop
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Only the transport/catch path sets `run.error` (a failed open or dropped
          connection produces no timeline item); a `stream.error` frame renders
          solely as a timeline `error` row, so the message is never doubled. */}
      {run.error !== null ? <ErrorState message={run.error} /> : null}
      <Timeline events={run.events} />
    </Stack>
  );
}
