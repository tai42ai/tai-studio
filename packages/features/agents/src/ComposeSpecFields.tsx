/**
 * The compose dialog's spec fields, shown once a base agent is chosen: the curated
 * spec vocabulary the base declares — system prompt, tools, inline presets, inline
 * sub-agents, the `SchemaForm`-authored strategy, and the raw-schema response format.
 *
 * A tool/preset read the pickers depend on renders a loud `ErrorState` instead of an
 * enabled empty control ("nothing to choose" and "the read failed" must never be the
 * same screen); a 403 on the tools list is not such a failure, as the tool pickers
 * then take a typed name. A tags failure degrades the group to flat mode and the
 * search to tool names only, but is stated, never silently ungrouped; the search's
 * loss is named only while a picker draws its search.
 */
import {
  defaultValueForSchema,
  errorMessage,
  ErrorState,
  Field,
  type JsonSchema,
  SchemaEditor,
  type SchemaEditorDraft,
  SchemaForm,
  Textarea,
  TOOL_SEARCH_NAMES_ONLY_NOTE,
} from '@tai42/studio-sdk';
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useState } from 'react';

import { hasField } from './authoring-schema';
import type { InlinePresetSpec, InlineSubAgentSpec } from './authoring-types';
import { addToolSearchShown, MultiToolPicker } from './MultiToolPicker';
import { PresetSpecEditor } from './PresetSpecEditor';
import { SubAgentComposer } from './SubAgentComposer';
import type { ComposeAgentData } from './useComposeAgentData';

/** The authored spec-field values, read by the dialog's submit. */
export interface ComposeSpecHandle {
  readonly systemPrompt: string;
  readonly toolNames: string[];
  readonly presets: InlinePresetSpec[];
  readonly subagents: InlineSubAgentSpec[];
  readonly extraSpec: unknown;
}

function SystemPromptField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <Field label="System prompt">
      <Textarea
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder="You are a helpful assistant."
      />
    </Field>
  );
}

/**
 * A failed tags read: the pickers lose their grouping and their description search; the
 * search's loss is named while a picker draws its search.
 */
function tagsReadFailedMessage(error: unknown, searchShown: boolean): string {
  const failure = `Could not load tool tags and descriptions: ${errorMessage(error)}.`;
  return searchShown ? `${failure} ${TOOL_SEARCH_NAMES_ONLY_NOTE}` : failure;
}

function ToolsField({
  data,
  value,
  onChange,
}: {
  readonly data: ComposeAgentData;
  readonly value: string[];
  readonly onChange: (value: string[]) => void;
}): ReactNode {
  const { tagsQuery } = data;
  return (
    <Field label="Tools" description="The tools this agent may call." group>
      {/* A tags failure must not take down tool picking: the picker keeps its flat
          mode, searches tool names only, and the failure is stated rather than
          silently ungrouping. */}
      {tagsQuery.isError ? (
        <ErrorState
          message={tagsReadFailedMessage(
            tagsQuery.error,
            addToolSearchShown(data.visibleToolsQuery, value),
          )}
          onRetry={() => void tagsQuery.refetch()}
        />
      ) : null}
      <MultiToolPicker
        query={data.visibleToolsQuery}
        tagsByTool={data.tagsByTool}
        displayNames={data.displayNames}
        toolDescriptions={data.toolDescriptions}
        value={value}
        onChange={onChange}
        idPrefix="compose-tools"
      />
    </Field>
  );
}

function PresetsField({
  data,
  value,
  onChange,
}: {
  readonly data: ComposeAgentData;
  readonly value: InlinePresetSpec[];
  readonly onChange: (value: InlinePresetSpec[]) => void;
}): ReactNode {
  const { presetsQuery } = data;
  return (
    <Field
      label="Presets"
      description="Stored presets expand into inline, self-contained definitions."
      group
    >
      {presetsQuery.isError ? (
        <ErrorState
          message={errorMessage(presetsQuery.error)}
          onRetry={() => void presetsQuery.refetch()}
        />
      ) : (
        <PresetSpecEditor
          presetRecords={data.usablePresets}
          value={value}
          onChange={onChange}
          idPrefix="compose-presets"
        />
      )}
    </Field>
  );
}

function SubAgentsField({
  data,
  value,
  onChange,
}: {
  readonly data: ComposeAgentData;
  readonly value: InlineSubAgentSpec[];
  readonly onChange: (value: InlineSubAgentSpec[]) => void;
}): ReactNode {
  const { toolsQuery, toolsReadFailed, presetsQuery, tagsQuery } = data;
  const composerShown = !toolsReadFailed && !presetsQuery.isError;
  return (
    <Field
      label="Sub-agents"
      description="Inline sub-agent specs this agent can delegate to."
      group
    >
      {/* A tags failure must not take down sub-agent tool picking: the composer's
          pickers keep flat mode, search tool names only, and the failure is stated. */}
      {tagsQuery.isError ? (
        <ErrorState
          message={tagsReadFailedMessage(
            tagsQuery.error,
            composerShown &&
              value.some((spec) => addToolSearchShown(data.visibleToolsQuery, spec.tool_names)),
          )}
          onRetry={() => void tagsQuery.refetch()}
        />
      ) : null}
      {composerShown ? (
        <SubAgentComposer
          toolsQuery={data.visibleToolsQuery}
          tagsByTool={data.tagsByTool}
          displayNames={data.displayNames}
          toolDescriptions={data.toolDescriptions}
          presetRecords={data.usablePresets}
          value={value}
          onChange={onChange}
        />
      ) : (
        <ErrorState
          message={errorMessage(toolsReadFailed ? toolsQuery.error : presetsQuery.error)}
          onRetry={data.retryReads}
        />
      )}
    </Field>
  );
}

export const ComposeSpecFields = forwardRef<
  ComposeSpecHandle,
  {
    readonly data: ComposeAgentData;
    readonly baseSchema: JsonSchema;
    readonly baseName: string;
    readonly extraSchema: JsonSchema | null;
    readonly hasResponseFormat: boolean;
    readonly responseFormat: SchemaEditorDraft;
    readonly onResponseFormatChange: (value: SchemaEditorDraft) => void;
  }
>(function ComposeSpecFields(
  {
    data,
    baseSchema,
    baseName,
    extraSchema,
    hasResponseFormat,
    responseFormat,
    onResponseFormatChange,
  },
  ref,
): ReactNode {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [presets, setPresets] = useState<InlinePresetSpec[]>([]);
  const [subagents, setSubagents] = useState<InlineSubAgentSpec[]>([]);
  const [extraSpec, setExtraSpec] = useState<unknown>({});

  // Re-seed the extra-spec form to the schema defaults whenever the base changes.
  useEffect(() => {
    setExtraSpec(extraSchema ? defaultValueForSchema(extraSchema) : {});
  }, [extraSchema]);

  useImperativeHandle(ref, () => ({ systemPrompt, toolNames, presets, subagents, extraSpec }), [
    systemPrompt,
    toolNames,
    presets,
    subagents,
    extraSpec,
  ]);

  return (
    <div className="tai-stack" data-testid="compose-spec-fields">
      {hasField(baseSchema, 'system_prompt') ? (
        <SystemPromptField value={systemPrompt} onChange={setSystemPrompt} />
      ) : null}

      {hasField(baseSchema, 'tool_names') ? (
        <ToolsField data={data} value={toolNames} onChange={setToolNames} />
      ) : null}

      {hasField(baseSchema, 'presets') ? (
        <PresetsField data={data} value={presets} onChange={setPresets} />
      ) : null}

      {hasField(baseSchema, 'subagents') ? (
        <SubAgentsField data={data} value={subagents} onChange={setSubagents} />
      ) : null}

      {extraSchema !== null ? (
        <Field label="Strategy" group>
          <SchemaForm schema={extraSchema} value={extraSpec} onChange={setExtraSpec} />
        </Field>
      ) : null}

      {hasResponseFormat ? (
        <SchemaEditor
          value={responseFormat.schema}
          onChange={onResponseFormatChange}
          requireTitle
          label="Response format"
          description="A JSON Schema forcing the agent's structured output. A top-level title is required."
          idPrefix="compose-response-format"
          // Re-seed the editor when the base agent changes.
          key={baseName}
        />
      ) : null}
    </div>
  );
});
