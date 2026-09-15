/**
 * The create-trigger-link form phase: topic + optional name + the execution key +
 * the "require an api key" toggle + the explicit expiry picker (no default) + an
 * optional per-link params JSON editor. Required fields nag on submit; an
 * unsatisfiable fire gate disables the mint. Every server failure surfaces loudly
 * inline.
 */
import {
  Button,
  Checkbox,
  errorMessage,
  ErrorState,
  Field,
  RadioGroup,
  Spinner,
  Textarea,
  TextInput,
} from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { ExecutionKeyPicker } from './ExecutionKeyPicker';
import { EXPIRY_OPTIONS, type ExpiryChoice } from './expiry';
import type { CreateTriggerLinkForm } from './useCreateTriggerLink';

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

export interface TriggerLinkFormProps {
  readonly form: CreateTriggerLinkForm;
  readonly onClose: () => void;
}

export function TriggerLinkForm({ form, onClose }: TriggerLinkFormProps): ReactNode {
  return (
    <form aria-label="Create trigger link" onSubmit={form.onSubmit} style={sectionStyle}>
      <Field
        label="Topic"
        description="The hook topic this link fires when scanned."
        error={form.submitted && form.topic.trim() === '' ? 'A topic is required.' : undefined}
      >
        <TextInput
          value={form.topic}
          placeholder="e.g. events.created"
          onChange={(event) => {
            form.setTopic(event.target.value);
          }}
        />
      </Field>
      <Field label="Name" description="Optional. A unique name is generated when left blank.">
        <TextInput
          value={form.name}
          placeholder="e.g. daily-digest"
          onChange={(event) => {
            form.setName(event.target.value);
          }}
        />
      </Field>
      <ExecutionKeyPicker
        value={form.executionKey}
        onValueChange={form.setExecutionKey}
        error={
          form.submitted && form.executionKey === '' ? 'An execution key is required.' : undefined
        }
      />
      <Checkbox
        label="Also require an api key"
        checked={form.requireApiKey}
        onCheckedChange={form.setRequireApiKey}
      />
      <Field
        label="Expiry"
        description="Pick when the link stops working. There is no default — choose one."
        error={form.submitted && form.expiryChoice === undefined ? 'Choose an expiry.' : undefined}
        group
      >
        <RadioGroup
          options={EXPIRY_OPTIONS}
          value={form.expiryChoice}
          onValueChange={(value) => {
            form.setExpiryChoice(value as ExpiryChoice);
          }}
        />
      </Field>
      {form.expiryChoice === 'custom' ? (
        <Field
          label="Custom expiry (seconds)"
          description="Whole seconds, greater than zero."
          error={form.expiryError ?? undefined}
        >
          <TextInput
            value={form.customSeconds}
            inputMode="numeric"
            placeholder="e.g. 1800"
            onChange={(event) => {
              form.setCustomSeconds(event.target.value);
            }}
          />
        </Field>
      ) : null}
      <Field
        label="Tool params (JSON)"
        description="Optional. Merged last into every fire — link params override the hook's static params. Blank means none."
        error={form.kwargsError ?? undefined}
      >
        <Textarea
          value={form.toolKwargs}
          rows={4}
          placeholder='{ "options": { "priority": "high" } }'
          onChange={(event) => {
            form.setToolKwargs(event.target.value);
          }}
        />
      </Field>
      {form.mutation.isError ? <ErrorState message={errorMessage(form.mutation.error)} /> : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-3)' }}>
        <Button type="button" onClick={onClose} disabled={form.mutation.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={form.mutation.isPending || form.unsatisfiable}
        >
          {form.mutation.isPending ? <Spinner label="Creating" /> : null}
          Create link
        </Button>
      </div>
    </form>
  );
}
