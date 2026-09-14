/**
 * The schedule-spec fields for the add-schedule dialog: the interval/crontab mode
 * radio and the interval-seconds or cron-string field the chosen mode reveals.
 */
import type { ReactNode } from 'react';
import { Field, NumberInput, RadioGroup, TextInput } from '@tai42/studio-sdk';

import { MODE_OPTIONS, type ScheduleMode } from './schedule-form';

export function ScheduleSpecFields({
  mode,
  setMode,
  interval,
  setInterval,
  cron,
  setCron,
  submitted,
  intervalInvalid,
  cronMissing,
}: {
  readonly mode: ScheduleMode;
  readonly setMode: (mode: ScheduleMode) => void;
  readonly interval: string;
  readonly setInterval: (value: string) => void;
  readonly cron: string;
  readonly setCron: (value: string) => void;
  readonly submitted: boolean;
  readonly intervalInvalid: boolean;
  readonly cronMissing: boolean;
}): ReactNode {
  return (
    <>
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
    </>
  );
}
