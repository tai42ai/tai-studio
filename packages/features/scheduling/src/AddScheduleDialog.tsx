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
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  ErrorState,
  Field,
  NumberInput,
  RadioGroup,
  Select,
  Spinner,
  StateBindingSection,
  Textarea,
  TextInput,
  ToolPicker,
  errorMessage,
  fieldPathsFromSchema,
  hiddenToolNames,
  statesCatalogFromList,
  templatesCatalogFromList,
  statesListKey,
  stateTemplatesKey,
  toolBadgesByName,
  useApi,
  useToolDisplayNames,
} from '@tai42/studio-sdk';
import type { StateBinding } from '@tai42/api-client';

import { scheduleToolMetaKey, scheduleToolTagsKey, scheduleToolsKey, schedulesKey } from './keys';

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
  const displayNames = useToolDisplayNames();

  const toolsQuery = useQuery({ queryKey: scheduleToolsKey, queryFn: () => api.listTools() });
  const tagsQuery = useQuery({ queryKey: scheduleToolTagsKey, queryFn: () => api.listToolTags() });
  const metaQuery = useQuery({ queryKey: scheduleToolMetaKey, queryFn: () => api.listToolMeta() });

  // Tools whose EFFECTIVE visibility is hidden (`overlay.hidden ?? plugin
  // declaration`) are kept out of the picker, the same tri-state rule the tools
  // screen applies to its list. Best-effort enrichment: a failed tags/meta read
  // leaves the set empty (the server stays the authority over what may be run).
  const hiddenNames = useMemo(
    () => hiddenToolNames(tagsQuery.data ?? [], metaQuery.data?.meta ?? []),
    [tagsQuery.data, metaQuery.data],
  );
  const excludeToolNames = useMemo(() => [...hiddenNames], [hiddenNames]);

  // The declared badges the picker shows beneath the SELECTED tool — native ∪ overlay,
  // the same union the tools screen renders. Informational only; a failed tags/meta
  // read leaves the map empty (no chips shown).
  const badgesByTool = useMemo(
    () => toolBadgesByName(tagsQuery.data ?? [], metaQuery.data?.meta ?? []),
    [tagsQuery.data, metaQuery.data],
  );

  const [name, setName] = useState('');
  const [tool, setTool] = useState<string | null>(null);
  const [kwargs, setKwargs] = useState('{}');
  const [mode, setMode] = useState<ScheduleMode>('crontab');
  const [interval, setInterval] = useState('');
  const [cron, setCron] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [kwargsError, setKwargsError] = useState<string | null>(null);

  // The optional state subject a scheduled fire carries: the target scope, the subject
  // kind, and a LITERAL key (a schedule fires with no payload, so the key is not a jq).
  const [subjectTarget, setSubjectTarget] = useState('');
  const [subjectKind, setSubjectKind] = useState('');
  const [subjectKey, setSubjectKey] = useState('');
  const [subjectError, setSubjectError] = useState<string | null>(null);
  // The Subject group is collapsed by default; its fields (and the targets read) mount
  // only when expanded, so the dialog's default shape is unchanged.
  const [subjectOpen, setSubjectOpen] = useState(false);
  // The optional door-layer state binding applied around every fire of this schedule.
  const [stateBinding, setStateBinding] = useState<StateBinding | null>(null);
  const bindingStatesQuery = useQuery({
    queryKey: statesListKey,
    queryFn: ({ signal }) => api.listStates(signal),
  });
  const bindingTemplatesQuery = useQuery({
    queryKey: stateTemplatesKey,
    queryFn: ({ signal }) => api.listStateTemplates(signal),
  });
  // The stored templates a binding's templated-text jq slots may reference by id.
  const authoredTemplatesQuery = useQuery({
    queryKey: ['templates', 'names'],
    queryFn: ({ signal }) => api.listTemplates(signal),
  });
  // The scheduled tool's schema feeds the binding editor's field pickers.
  const toolSchemaQuery = useQuery({
    queryKey: ['state-binding', 'tool-schema', tool],
    queryFn: ({ signal }) => api.getToolSchema(tool ?? '', signal),
    enabled: tool !== null && tool !== '',
  });
  // When the scheduled tool is a preset, its own binding is inherited (this door's
  // binding overrides it per state).
  const bindingPresetsQuery = useQuery({
    queryKey: ['state-binding', 'presets'],
    queryFn: ({ signal }) => api.listPresets(signal),
  });
  const toolIsPreset = bindingPresetsQuery.data?.some((p) => p.name === tool) ?? false;
  const toolVersionsQuery = useQuery({
    queryKey: ['state-binding', 'preset-versions', tool],
    queryFn: ({ signal }) => api.listPresetVersions(tool ?? '', signal),
    enabled: toolIsPreset && tool !== null && tool !== '',
  });
  const inheritedBinding =
    toolVersionsQuery.data?.find((v) => v.is_current)?.body.state_binding ?? null;

  const targetsQuery = useQuery({
    queryKey: ['schedules', 'conversation-targets'],
    queryFn: ({ signal }) => api.listConversationRoutes(signal),
    enabled: subjectOpen,
  });
  const targetOptions = (targetsQuery.data?.items ?? []).map((route) => ({
    value: `${route.target_kind}:${route.target_name}`,
    label: `${route.target_kind} · ${route.target_name}`,
  }));

  const add = useMutation({
    mutationFn: (body: {
      tool_name: string;
      tool_kwargs: Record<string, unknown>;
      schedule_kwargs: Record<string, unknown>;
      state_binding?: StateBinding | null;
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
    setSubjectError(null);

    const kwargsResult = parseKwargs(kwargs);
    if (!kwargsResult.ok) {
      setKwargsError(kwargsResult.message);
      return;
    }
    if (nameMissing || toolMissing || intervalInvalid || cronMissing) return;

    // The optional subject: either fully specified (target + kind + key) or omitted.
    const subjectTouched =
      subjectTarget !== '' || subjectKind.trim() !== '' || subjectKey.trim() !== '';
    const scheduleKwargs: Record<string, unknown> = {
      backend_schedule: mode === 'interval' ? intervalValue : cron.trim(),
      backend_schedule_name: name.trim(),
    };
    const toolKwargs: Record<string, unknown> = { ...kwargsResult.value };
    if (subjectTouched) {
      const separator = subjectTarget.indexOf(':');
      if (separator < 0 || subjectKind.trim() === '' || subjectKey.trim() === '') {
        setSubjectError('A subject needs a target, a kind, and a key.');
        return;
      }
      // `create_schedule` reads and validates the subject as an ordinary tool kwarg; the
      // worker stamps it as the fire's state context (never a schedule-kwarg / internal
      // reserved stamp).
      toolKwargs.subject = {
        target_kind: subjectTarget.slice(0, separator),
        target_name: subjectTarget.slice(separator + 1),
        kind: subjectKind.trim(),
        key: subjectKey.trim(),
      };
    }

    add.mutate({
      tool_name: tool,
      tool_kwargs: toolKwargs,
      schedule_kwargs: scheduleKwargs,
      // OMIT state_binding unless the author bound a state.
      ...(stateBinding !== null ? { state_binding: stateBinding } : {}),
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
    stateBinding,
    subjectKey,
    subjectKind,
    subjectTarget,
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
              excludeNames={excludeToolNames}
              displayNames={displayNames}
              badgesByTool={badgesByTool}
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

        <div>
          <button
            type="button"
            className="tai-btn tai-btn-ghost"
            aria-expanded={subjectOpen}
            onClick={() => {
              setSubjectOpen((open) => !open);
            }}
          >
            Subject (optional)
          </button>
          {subjectOpen ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--tai-space-3)',
                marginTop: 'var(--tai-space-3)',
              }}
            >
              <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
                Key this schedule&rsquo;s state writes to a subject; leave blank for none.
              </p>
              <Field label="Target">
                <Select
                  value={subjectTarget}
                  onValueChange={setSubjectTarget}
                  aria-label="Subject target"
                  placeholder="Choose a conversation target"
                  options={targetOptions}
                />
              </Field>
              <Field
                label="Subject kind"
                description="The subject family the state declares (e.g. person)."
              >
                <TextInput
                  value={subjectKind}
                  placeholder="e.g. person"
                  onChange={(event) => {
                    setSubjectKind(event.target.value);
                  }}
                />
              </Field>
              <Field
                label="Subject key"
                description="A literal key; a schedule fires with no payload to derive one."
              >
                <TextInput
                  value={subjectKey}
                  placeholder="e.g. a-42"
                  onChange={(event) => {
                    setSubjectKey(event.target.value);
                  }}
                />
              </Field>
              {subjectError !== null ? (
                <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
                  {subjectError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <StateBindingSection
          value={stateBinding}
          onChange={setStateBinding}
          statesCatalog={statesCatalogFromList(bindingStatesQuery.data ?? [])}
          templatesCatalog={templatesCatalogFromList(bindingTemplatesQuery.data ?? [])}
          templatedTextTemplates={{
            templates: (authoredTemplatesQuery.data ?? []).map((id) => ({ id })),
            loading: authoredTemplatesQuery.isPending,
            error: authoredTemplatesQuery.isError
              ? errorMessage(authoredTemplatesQuery.error)
              : undefined,
            onRetry: () => void authoredTemplatesQuery.refetch(),
          }}
          inherited={inheritedBinding}
          sources={{
            input: fieldPathsFromSchema(toolSchemaQuery.data?.input),
            output: fieldPathsFromSchema(toolSchemaQuery.data?.output),
            loading: tool !== null && tool !== '' && toolSchemaQuery.isPending,
            error: toolSchemaQuery.isError ? "Couldn't load the tool's fields." : undefined,
          }}
          loading={bindingStatesQuery.isPending || bindingTemplatesQuery.isPending}
          error={
            bindingStatesQuery.isError || bindingTemplatesQuery.isError
              ? errorMessage(bindingStatesQuery.error ?? bindingTemplatesQuery.error)
              : undefined
          }
        />

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
