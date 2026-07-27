/**
 * The ADD-SCHEDULE dialog. The operator names the schedule, picks the tool to run
 * (shared `ToolPicker`, fed by `listTools`), supplies the tool's kwargs as JSON,
 * and chooses a schedule spec — either an INTERVAL (seconds) or a CRONTAB string.
 *
 * The kwargs JSON is validated CLIENT-SIDE before submit: bad JSON (or a non-object
 * payload) blocks the request with a visible message rather than being sent. On a
 * valid submit the dialog posts through `addSchedule`, mapping the picked tool and
 * parsed kwargs into the skeleton's `{tool_name, tool_kwargs, schedule_kwargs}`
 * body; the schedule spec rides in `schedule_kwargs.backend_schedule` (the interval
 * number or the cron string) alongside `backend_schedule_name` (the name).
 *
 * The crontab spec is entered as a single validated cron STRING field rather than a
 * visual cron builder: the string is the exact value the skeleton expects, so it is
 * passed straight through without an intermediate builder to translate.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  ErrorState,
  Field,
  NumberInput,
  RadioGroup,
  Spinner,
  Textarea,
  TextInput,
  ToolPicker,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { scheduleToolsKey, schedulesKey } from './keys';

type ScheduleMode = 'interval' | 'crontab';

const MODE_OPTIONS = [
  { value: 'interval', label: 'Interval' },
  { value: 'crontab', label: 'Crontab' },
] as const;

/**
 * Parse the kwargs textarea into a JSON object. A blank field means "no kwargs"
 * (`{}`). Anything that is not a JSON object (array, scalar, malformed) is a
 * validation failure carrying a human message — never silently coerced.
 */
function parseKwargs(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { ok: false, message: `Kwargs must be valid JSON: ${errorMessage(error)}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'Kwargs must be a JSON object.' };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function AddScheduleDialog({ onClose }: { onClose: () => void }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const toolsQuery = useQuery({ queryKey: scheduleToolsKey, queryFn: () => api.listTools() });

  const [name, setName] = useState('');
  const [tool, setTool] = useState<string | null>(null);
  const [kwargs, setKwargs] = useState('{}');
  const [mode, setMode] = useState<ScheduleMode>('crontab');
  const [interval, setInterval] = useState('');
  const [cron, setCron] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [kwargsError, setKwargsError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: (body: {
      tool_name: string;
      tool_kwargs: Record<string, unknown>;
      schedule_kwargs: Record<string, unknown>;
    }) => api.addSchedule(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: schedulesKey });
      onClose();
    },
  });

  const nameMissing = name.trim() === '';
  const toolMissing = tool === null || tool === '';
  const intervalValue = Number(interval);
  const intervalInvalid =
    mode === 'interval' &&
    (interval.trim() === '' || !Number.isFinite(intervalValue) || intervalValue <= 0);
  const cronMissing = mode === 'crontab' && cron.trim() === '';

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    setKwargsError(null);

    const kwargsResult = parseKwargs(kwargs);
    if (!kwargsResult.ok) {
      setKwargsError(kwargsResult.message);
      return;
    }
    if (nameMissing || toolMissing || intervalInvalid || cronMissing) return;

    const backendSchedule: number | string = mode === 'interval' ? intervalValue : cron.trim();
    add.mutate({
      tool_name: tool,
      tool_kwargs: kwargsResult.value,
      schedule_kwargs: {
        backend_schedule: backendSchedule,
        backend_schedule_name: name.trim(),
      },
    });
  }, [
    add,
    cron,
    cronMissing,
    intervalInvalid,
    intervalValue,
    kwargs,
    mode,
    name,
    nameMissing,
    tool,
    toolMissing,
  ]);

  return (
    <Dialog
      title="Add schedule"
      description="Create a new scheduled task."
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <Field label="Name" error={submitted && nameMissing ? 'A name is required.' : undefined}>
          <TextInput
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="nightly-report"
          />
        </Field>

        {toolsQuery.isError ? (
          <ErrorState
            message={errorMessage(toolsQuery.error)}
            onRetry={() => void toolsQuery.refetch()}
          />
        ) : (
          <Field label="Tool" error={submitted && toolMissing ? 'A tool is required.' : undefined}>
            <ToolPicker
              toolNames={toolsQuery.data ?? []}
              value={tool}
              onChange={setTool}
              disabled={toolsQuery.isPending}
              placeholder={toolsQuery.isPending ? 'Loading tools…' : 'Select a tool…'}
            />
          </Field>
        )}

        <Field
          label="Tool kwargs (JSON)"
          description="A JSON object passed to the tool. Leave as {} for none."
          error={kwargsError ?? undefined}
        >
          <Textarea
            value={kwargs}
            onChange={(event) => {
              setKwargs(event.target.value);
            }}
            style={{ fontFamily: 'var(--tai-font-mono)', minHeight: '6rem' }}
          />
        </Field>

        <Field label="Schedule type" group>
          <RadioGroup
            options={MODE_OPTIONS}
            value={mode}
            onValueChange={(value) => {
              setMode(value as ScheduleMode);
            }}
          />
        </Field>

        {mode === 'interval' ? (
          <Field
            label="Interval (seconds)"
            error={submitted && intervalInvalid ? 'Enter a positive number of seconds.' : undefined}
          >
            <NumberInput
              value={interval}
              min={0}
              step="any"
              onChange={(event) => {
                setInterval(event.target.value);
              }}
              placeholder="60"
            />
          </Field>
        ) : (
          <Field
            label="Cron expression"
            description="A cron expression, e.g. 0 2 * * * (min hour day-of-month month day-of-week)."
            error={submitted && cronMissing ? 'A cron expression is required.' : undefined}
          >
            <TextInput
              value={cron}
              onChange={(event) => {
                setCron(event.target.value);
              }}
              placeholder="0 2 * * *"
              style={{ fontFamily: 'var(--tai-font-mono)' }}
            />
          </Field>
        )}

        {add.isError ? <ErrorState message={errorMessage(add.error)} /> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={add.isPending}>
            {add.isPending ? <Spinner label="Creating schedule" /> : null}
            Create schedule
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
