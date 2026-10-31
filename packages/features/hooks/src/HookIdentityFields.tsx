/**
 * The register form's required identity block: name (with the overwrite notice when
 * the typed name hits another hook), topic, the tool picker (searchable, labelled with
 * display names, flagging a stored tool the deployment no longer lists), the
 * execution-key picker, and the
 * optional `tool_kwargs` JSON textarea. Required-field errors show only after a
 * submit attempt.
 */
import {
  type ExecutionKeyBinding,
  ExecutionKeyPicker,
  type ExecutionKeyQuery,
  Field,
  Textarea,
  TextInput,
  type ToolListQuery,
  ToolPicker,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { HookFormFields } from './useHookFormFields';

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
  /** The api-key list read the execution-key picker renders. */
  readonly keysQuery: ExecutionKeyQuery;
  /** The registered-tools read the tool picker offers. */
  readonly toolsQuery: ToolListQuery;
  /** The raw-name → display-name map the tool picker labels its options with. */
  readonly toolDisplayNames: Readonly<Record<string, string>>;
  /** The raw-name → declared-description map the tool picker draws and searches. */
  readonly toolDescriptions: Readonly<Record<string, string>>;
  /** How the form binds its key (`useExecutionKeyBinding()`). */
  readonly binding: ExecutionKeyBinding;
}

/** The flag the Tool picker puts on a stored tool the deployment no longer lists. */
export const TOOL_UNLISTED_LABEL = 'not registered';

export function HookIdentityFields({
  fields,
  missing,
  replacesExisting,
  trimmedName,
  keysQuery,
  toolsQuery,
  toolDisplayNames,
  toolDescriptions,
  binding,
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
        <p role="status" style={{ margin: 0, color: 'var(--tai-color-warn-text)' }}>
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
      <ToolPicker
        query={toolsQuery}
        value={fields.tool === '' ? null : fields.tool}
        onChange={fields.setTool}
        label="Tool"
        unlistedLabel={TOOL_UNLISTED_LABEL}
        displayNames={toolDisplayNames}
        toolDescriptions={toolDescriptions}
        error={submitted && missing.tool ? 'A tool is required.' : undefined}
        emptyNote="No tools are registered on this deployment."
      />
      <ExecutionKeyPicker
        query={keysQuery}
        binding={binding}
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
