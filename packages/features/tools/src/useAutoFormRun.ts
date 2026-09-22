/**
 * The schema-driven run form's state and both run doors. The synchronous Run POSTs the
 * admin-only `/api/run-tool` under a client timeout; Run in background POSTs
 * `/api/tool-runs`. Each door gates on its OWN concrete route (projection ⊆ gate),
 * independent of tool visibility, and fails closed while the projection is not ready.
 */
import type { StateSubject } from '@tai42/api-client';
import {
  buildSubject,
  defaultValueForSchema,
  isFeatureDisabled,
  type JsonSchema,
  type SchemaFormErrors,
  useApi,
  useCanWrite,
  useCapabilities,
  validateAgainstSchema,
} from '@tai42/studio-sdk';
import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useRef, useState } from 'react';

import { toolRunsListKey } from './backgroundRunsCommon';
import { RunTimeoutError, runToolWithTimeout } from './run';
import { readRunResult, type RunView } from './run-asks';
import { useRunSubject } from './use-run-subject';

/** The synchronous Run door — admin-only. */
const RUN_TOOL_ROUTE = '/api/run-tool';
/** The background Run door. */
const TOOL_RUNS_ROUTE = '/api/tool-runs';

/** Validate the form against the schema and return the run-tool kwargs, or `null` when
 * invalid (the field errors are set). A non-object form root (scalar/array) is never a
 * valid kwargs map, so it maps to an empty kwargs object. */
function validateKwargs(
  schema: JsonSchema,
  value: unknown,
  setErrors: (errors: SchemaFormErrors | undefined) => void,
): Record<string, unknown> | null {
  const validation = validateAgainstSchema(schema, value);
  if (Object.keys(validation).length > 0) {
    setErrors(validation);
    return null;
  }
  setErrors(undefined);
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Build the subject sub-form into the run's subject and stamp the ref, or surface a
 * partial-subject error (all three fields or none). Returns whether the run may fire. */
function stampRunSubject(
  subject: ReturnType<typeof useRunSubject>,
  ref: { current: StateSubject | null },
): boolean {
  const built = buildSubject({ target: subject.target, kind: subject.kind, key: subject.key });
  if (!built.ok) {
    subject.setError(built.message);
    return false;
  }
  subject.setError(null);
  ref.current = built.subject;
  return true;
}

export interface AutoFormRun {
  readonly value: unknown;
  readonly setValue: (value: unknown) => void;
  readonly errors: SchemaFormErrors | undefined;
  readonly run: UseMutationResult<unknown, Error, Record<string, unknown>>;
  readonly background: UseMutationResult<{ run_id: string }, Error, Record<string, unknown>>;
  readonly activeRunId: string | undefined;
  readonly canRunSync: boolean;
  readonly canRunBackground: boolean;
  readonly noRunDoor: boolean;
  readonly showSyncButton: boolean;
  readonly showBackgroundButton: boolean;
  readonly backgroundDisabled: boolean;
  readonly timedOut: boolean;
  readonly onSubmit: (event: SyntheticEvent) => void;
  readonly onRunInBackground: () => void;
  /** The optional-subject sub-form rendered as the panel's Subject section. */
  readonly subject: ReturnType<typeof useRunSubject>;
  /** The synchronous run's result, normalised to what the panel renders; `undefined`
   *  until a run resolves. */
  readonly runView: RunView | undefined;
}

export function useAutoFormRun({
  toolName,
  schema,
}: {
  readonly toolName: string;
  readonly schema: JsonSchema;
}): AutoFormRun {
  const api = useApi();
  const queryClient = useQueryClient();
  const { state } = useCapabilities();
  const [value, setValue] = useState<unknown>(() => defaultValueForSchema(schema));
  const [errors, setErrors] = useState<SchemaFormErrors | undefined>(undefined);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);

  const subject = useRunSubject();
  // The subject the LIVE run used, captured at submit so the run sends the subject that
  // was set when it fired even if the sub-form changes while the run is in flight.
  const runSubjectRef = useRef<StateSubject | null>(null);
  const [runView, setRunView] = useState<RunView | undefined>(undefined);

  const canRunSync = useCanWrite(RUN_TOOL_ROUTE, 'POST');
  const canRunBackground = useCanWrite(TOOL_RUNS_ROUTE, 'POST');
  const ready = state.status === 'ready';
  const noRunDoor = ready && !canRunSync && !canRunBackground;

  const run = useMutation({
    mutationFn: (kwargs: Record<string, unknown>) =>
      runToolWithTimeout(api, toolName, kwargs, runSubjectRef.current ?? undefined),
    onSuccess: (result) => {
      setRunView(readRunResult(result));
    },
  });

  const background = useMutation({
    mutationFn: (kwargs: Record<string, unknown>) =>
      api.submitToolRun({
        tool_name: toolName,
        arguments: kwargs,
        subject: runSubjectRef.current ?? undefined,
      }),
    onSuccess: (result) => {
      setActiveRunId(result.run_id);
      // Restart the recent-runs poll now that a running run is present.
      void queryClient.invalidateQueries({ queryKey: toolRunsListKey(toolName) });
    },
  });

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    // Guard the door too, not only the button: a form submit (Enter) must not fire a
    // run the gate denies.
    if (!canRunSync) return;
    const kwargs = validateKwargs(schema, value, setErrors);
    const subjectOk = stampRunSubject(subject, runSubjectRef);
    if (kwargs === null || !subjectOk) return;
    // A fresh run clears the previous run's result view.
    setRunView(undefined);
    run.mutate(kwargs);
  };

  const onRunInBackground = (): void => {
    if (!canRunBackground) return;
    const kwargs = validateKwargs(schema, value, setErrors);
    const subjectOk = stampRunSubject(subject, runSubjectRef);
    if (kwargs === null || !subjectOk) return;
    background.mutate(kwargs);
  };

  // The tool-run store is unconfigured: a background submit answered 501
  // `tool-runs-not-configured`. Hide the background door and show a muted OFF note.
  const backgroundDisabled = isFeatureDisabled(background.error);

  return {
    value,
    setValue,
    errors,
    run,
    background,
    activeRunId,
    canRunSync,
    canRunBackground,
    noRunDoor,
    showSyncButton: !(ready && !canRunSync),
    showBackgroundButton: !((ready && !canRunBackground) || backgroundDisabled),
    backgroundDisabled,
    timedOut: run.isError && run.error instanceof RunTimeoutError,
    onSubmit,
    onRunInBackground,
    subject,
    runView,
  };
}
