/**
 * The schema-driven run form's state and both run doors. The synchronous Run POSTs the
 * admin-only `/api/run-tool` under a client timeout; Run in background POSTs
 * `/api/tool-runs`. Each door gates on its OWN concrete route (projection ⊆ gate),
 * independent of tool visibility, and fails closed while the projection is not ready.
 */
import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  defaultValueForSchema,
  isFeatureDisabled,
  useApi,
  useCanWrite,
  useCapabilities,
  validateAgainstSchema,
  type JsonSchema,
  type SchemaFormErrors,
} from '@tai42/studio-sdk';

import { toolRunsListKey } from './backgroundRunsCommon';
import { RunTimeoutError, runToolWithTimeout } from './run';

/** The synchronous Run door — admin-only. */
const RUN_TOOL_ROUTE = '/api/run-tool';
/** The background Run door. */
const TOOL_RUNS_ROUTE = '/api/tool-runs';

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

  const canRunSync = useCanWrite(RUN_TOOL_ROUTE, 'POST');
  const canRunBackground = useCanWrite(TOOL_RUNS_ROUTE, 'POST');
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
      // Restart the recent-runs poll now that a running run is present.
      void queryClient.invalidateQueries({ queryKey: toolRunsListKey(toolName) });
    },
  });

  /** Validate the form and return the run-tool kwargs, or `null` when invalid. A
   * non-object form root (scalar/array) is never a valid kwargs map, so guard. */
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
    // Guard the door too, not only the button: a form submit (Enter) must not fire a
    // run the gate denies.
    if (!canRunSync) return;
    const kwargs = validatedKwargs();
    if (kwargs !== null) run.mutate(kwargs);
  };

  const onRunInBackground = (): void => {
    if (!canRunBackground) return;
    const kwargs = validatedKwargs();
    if (kwargs !== null) background.mutate(kwargs);
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
  };
}
