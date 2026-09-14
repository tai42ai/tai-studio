/**
 * The register form's required identity block: name (with the overwrite notice when
 * the typed name hits another hook), topic, tool, the execution-key picker, and the
 * optional `tool_kwargs` JSON textarea. Required-field errors show only after a
 * submit attempt.
 */
import type { ReactNode } from 'react';
import { Field, Textarea, TextInput } from '@tai42/studio-sdk';

import type { HookFormFields } from './useHookFormFields';
import { ExecutionKeyPicker } from './ExecutionKeyPicker';

export interface HookIdentityFieldsProps {
  readonly fields: HookFormFields;
  readonly missing: {
    readonly name: boolean;
    readonly topic: boolean;
    readonly tool: boolean;
    readonly executionKey: boolean;
  };
  readonly replacesExisting: boolean;
  readonly trimmedName: string;
}

export function HookIdentityFields({
  fields,
  missing,
  replacesExisting,
  trimmedName,
}: HookIdentityFieldsProps): ReactNode {
  const { submitted } = fields;
  return (
    <>
      <Field label="Name" error={submitted && missing.name ? 'A name is required.' : undefined}>
        <TextInput
          value={fields.name}
          placeholder="e.g. notify-on-event"
          onChange={(event) => {
            fields.setName(event.target.value);
          }}
        />
      </Field>
      {replacesExisting ? (
        <p role="status" style={{ margin: 0, color: 'var(--tai-color-warning)' }}>
          Replaces the existing hook <strong>{trimmedName}</strong> — its current registration is
          overwritten.
        </p>
      ) : null}
      <Field label="Topic" error={submitted && missing.topic ? 'A topic is required.' : undefined}>
        <TextInput
          value={fields.topic}
          placeholder="e.g. events.created"
          onChange={(event) => {
            fields.setTopic(event.target.value);
          }}
        />
      </Field>
      <Field label="Tool" error={submitted && missing.tool ? 'A tool is required.' : undefined}>
        <TextInput
          value={fields.tool}
          placeholder="e.g. slack.post_message"
          onChange={(event) => {
            fields.setTool(event.target.value);
          }}
        />
      </Field>
      <ExecutionKeyPicker
        value={fields.executionKey}
        onValueChange={fields.setExecutionKey}
        error={submitted && missing.executionKey ? 'An execution key is required.' : undefined}
      />
      <Field
        label="Tool kwargs (JSON)"
        description="A JSON object of keyword arguments passed to the tool. Blank means none."
        error={fields.kwargsError ?? undefined}
      >
        <Textarea
          value={fields.toolKwargs}
          rows={4}
          placeholder='{ "channel": "ops" }'
          onChange={(event) => {
            fields.setToolKwargs(event.target.value);
          }}
        />
      </Field>
    </>
  );
}
