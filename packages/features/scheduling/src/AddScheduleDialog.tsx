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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  ErrorState,
  Spinner,
  StateBindingSection,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { StateBinding } from '@tai42/api-client';

import { schedulesKey } from './keys';
import {
  buildScheduleBody,
  parseKwargs,
  validateScheduleForm,
  type ScheduleBody,
  type ScheduleMode,
} from './schedule-form';
import { useScheduleTools } from './use-schedule-tools';
import { useScheduleBinding } from './use-schedule-binding';
import { useScheduleSubject } from './use-schedule-subject';
import { ScheduleFields } from './ScheduleFields';
import { ScheduleSpecFields } from './ScheduleSpecFields';
import { SubjectSection } from './SubjectSection';

export function AddScheduleDialog({ onClose }: { onClose: () => void }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [tool, setTool] = useState<string | null>(null);
  const [kwargs, setKwargs] = useState('{}');
  const [mode, setMode] = useState<ScheduleMode>('crontab');
  const [interval, setInterval] = useState('');
  const [cron, setCron] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [kwargsError, setKwargsError] = useState<string | null>(null);
  // The optional door-layer state binding applied around every fire of this schedule.
  const [stateBinding, setStateBinding] = useState<StateBinding | null>(null);

  const { toolsQuery, excludeToolNames, badgesByTool, displayNames } = useScheduleTools();
  const { bindingProps } = useScheduleBinding(tool);
  const subject = useScheduleSubject();

  const add = useMutation({
    mutationFn: (body: ScheduleBody) => api.addSchedule(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: schedulesKey });
      onClose();
    },
  });

  const { nameMissing, toolMissing, intervalInvalid, cronMissing, intervalValue } =
    validateScheduleForm({ name, tool, mode, interval, cron });

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    setKwargsError(null);
    subject.setError(null);

    const kwargsResult = parseKwargs(kwargs);
    if (!kwargsResult.ok) {
      setKwargsError(kwargsResult.message);
      return;
    }
    if (nameMissing || toolMissing || intervalInvalid || cronMissing || tool === null) return;

    const built = buildScheduleBody(
      {
        tool,
        name,
        mode,
        intervalValue,
        cron,
        subjectTarget: subject.target,
        subjectKind: subject.kind,
        subjectKey: subject.key,
        stateBinding,
      },
      kwargsResult.value,
    );
    if (!built.ok) {
      subject.setError(built.subjectError);
      return;
    }
    add.mutate(built.body);
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
    subject,
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
        <ScheduleFields
          name={name}
          setName={setName}
          tool={tool}
          setTool={setTool}
          kwargs={kwargs}
          setKwargs={setKwargs}
          submitted={submitted}
          nameMissing={nameMissing}
          toolMissing={toolMissing}
          kwargsError={kwargsError}
          toolsQuery={toolsQuery}
          excludeToolNames={excludeToolNames}
          displayNames={displayNames}
          badgesByTool={badgesByTool}
        />

        <ScheduleSpecFields
          mode={mode}
          setMode={setMode}
          interval={interval}
          setInterval={setInterval}
          cron={cron}
          setCron={setCron}
          submitted={submitted}
          intervalInvalid={intervalInvalid}
          cronMissing={cronMissing}
        />

        <SubjectSection
          open={subject.open}
          onToggle={() => {
            subject.setOpen((open) => !open);
          }}
          target={subject.target}
          onTargetChange={subject.setTarget}
          kind={subject.kind}
          onKindChange={subject.setKind}
          subjectKey={subject.key}
          onKeyChange={subject.setKey}
          error={subject.error}
          targetOptions={subject.targetOptions}
        />

        <StateBindingSection value={stateBinding} onChange={setStateBinding} {...bindingProps} />

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
