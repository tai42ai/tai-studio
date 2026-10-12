/**
 * The ADD-SCHEDULE dialog. The operator names the schedule, picks the tool to run
 * (shared `ToolPicker`, fed by the tool tags the server serves as `schedulable`),
 * supplies the tool's kwargs as JSON, and chooses a schedule spec — either an INTERVAL
 * (seconds) or a CRONTAB expression.
 *
 * The kwargs JSON is validated CLIENT-SIDE before submit: bad JSON (or a non-object
 * payload) blocks the request with a visible message rather than being sent. On a
 * valid submit the dialog posts the served `ScheduleCreate` body through `addSchedule`:
 * the picked BASE tool, its kwargs, the typed cadence (`{kind: 'interval', every}` or
 * the five crontab fields) and the schedule name; the server resolves the backend's
 * schedule vehicle.
 *
 * The crontab spec is entered as a single cron expression field rather than a visual
 * cron builder; it is split into its five fields (a sixth leading seconds field is
 * dropped), and an expression of any other length is a field error.
 */
import type { StateBinding } from '@tai42/api-client';
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  Spinner,
  StateBindingSection,
  SubjectSection,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useState } from 'react';

import { schedulesKey } from './keys';
import {
  buildScheduleBody,
  hasFieldError,
  parseKwargs,
  type ScheduleBody,
  type ScheduleMode,
  validateScheduleForm,
} from './schedule-form';
import { ScheduleContractSection } from './ScheduleContractSection';
import { ScheduleFields } from './ScheduleFields';
import { ScheduleSpecFields } from './ScheduleSpecFields';
import { useScheduleBinding } from './use-schedule-binding';
import { useScheduleContract } from './use-schedule-contract';
import { useScheduleExecutionKeys } from './use-schedule-execution-key';
import { useScheduleSubject } from './use-schedule-subject';
import { useScheduleTools } from './use-schedule-tools';

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
  // The execution key + the four door-contract jqs a parkable-driving schedule carries.
  const contract = useScheduleContract();

  const { toolsQuery, toolNames, excludeToolNames, badgesByTool, displayNames } =
    useScheduleTools();
  const { bindingProps, templatedTextTemplates } = useScheduleBinding(tool);
  const keysQuery = useScheduleExecutionKeys();
  const subject = useScheduleSubject();

  const add = useMutation({
    mutationFn: (body: ScheduleBody) => api.addSchedule(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: schedulesKey });
      onClose();
    },
  });

  const validation = validateScheduleForm({ name, tool, mode, interval, cron });

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    setKwargsError(null);
    contract.setExecutionKeyError(null);
    subject.setError(null);

    const kwargsResult = parseKwargs(kwargs);
    if (!kwargsResult.ok) {
      setKwargsError(kwargsResult.message);
      return;
    }
    if (hasFieldError(validation) || tool === null) return;

    const built = buildScheduleBody(
      {
        tool,
        name,
        mode,
        intervalValue: validation.intervalValue,
        cron,
        subjectTarget: subject.target,
        subjectKind: subject.kind,
        subjectKey: subject.key,
        stateBinding,
        executionKey: contract.executionKey,
        contract: contract.contract,
      },
      kwargsResult.value,
    );
    if (!built.ok) {
      // A cron expression of the wrong length is a field error caught above, so only the
      // subject and the execution key reach here.
      if (built.field === 'subject') subject.setError(built.message);
      else if (built.field === 'executionKey') contract.setExecutionKeyError(built.message);
      return;
    }
    add.mutate(built.body);
  }, [add, contract, cron, kwargs, mode, name, stateBinding, subject, tool, validation]);

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
          nameMissing={validation.nameMissing}
          toolMissing={validation.toolMissing}
          kwargsError={kwargsError}
          toolsQuery={toolsQuery}
          toolNames={toolNames}
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
          intervalInvalid={validation.intervalInvalid}
          cronMissing={validation.cronMissing}
          cronInvalid={validation.cronInvalid}
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
          caption="Key this schedule’s state writes to a subject; leave blank for none."
          targetPlaceholder="Choose a conversation target"
          subjectKeyDescription="A literal key; a schedule fires with no payload to derive one."
        />

        <ScheduleContractSection
          contract={contract}
          keysQuery={keysQuery}
          templatedTextTemplates={templatedTextTemplates}
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
