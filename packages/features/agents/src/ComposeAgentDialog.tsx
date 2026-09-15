/**
 * The COMPOSE dialog: pick a base agent → author the composable spec fields
 * (`system_prompt`, `tool_names`, `presets`, `subagents`, plus any schema-driven
 * extras) into a `fixed_kwargs`, then create a named, versioned preset over the base
 * agent's run tool. The `presets`/`subagents` fields hold INLINE self-contained
 * objects; the preset picker EXPANDS a stored preset into an inline `PresetSpec`
 * object, never a stored-name reference.
 *
 * `name` and `description` are both REQUIRED and gate submit — the API rejects a
 * create with an empty description (422), so an empty one blocks here like a missing
 * name. The tags entered here are NOT part of the create body: overlay
 * categorization tags live in the tool_meta overlay, written AFTER the create
 * succeeds, once the composed agent's live tool exists to carry them.
 *
 * SAFETY: a spec carries arbitrary operator-authored prompt/tool/agent names, all
 * rendered as ESCAPED text through the DS components (React escapes them) — never an
 * HTML sink. Pinned by a test.
 */
import type { AgentSummary } from '@tai42/api-client';
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  Field,
  type JsonSchema,
  type SchemaEditorChange,
  Select,
  Spinner,
} from '@tai42/studio-sdk';
import { type ReactNode, type SyntheticEvent, useMemo, useRef, useState } from 'react';

import { extraSpecSchema, hasField, RESPONSE_FORMAT_FIELD } from './authoring-schema';
import { buildCreateBody } from './compose-body';
import { ComposeFallbackFields, type ComposeFallbackHandle } from './ComposeFallbackFields';
import { ComposeIdentityFields } from './ComposeIdentityFields';
import { ComposeSpecFields, type ComposeSpecHandle } from './ComposeSpecFields';
import { useComposeAgentData } from './useComposeAgentData';
import { useCreateComposedAgent } from './useCreateComposedAgent';

export function ComposeAgentDialog({
  agents,
  onClose,
}: {
  readonly agents: readonly AgentSummary[];
  readonly onClose: () => void;
}): ReactNode {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseName, setBaseName] = useState('');
  const [responseFormat, setResponseFormat] = useState<SchemaEditorChange>({
    schema: null,
    valid: true,
  });
  const [tags, setTags] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const specRef = useRef<ComposeSpecHandle>(null);
  const fallbackRef = useRef<ComposeFallbackHandle>(null);

  const baseAgent = agents.find((agent) => agent.name === baseName) ?? null;
  const baseSchema: JsonSchema = useMemo(() => baseAgent?.input_schema ?? {}, [baseAgent]);
  const extraSchema = useMemo(
    () => (baseAgent ? extraSpecSchema(baseSchema) : null),
    [baseAgent, baseSchema],
  );
  const hasResponseFormat = baseAgent !== null && hasField(baseSchema, RESPONSE_FORMAT_FIELD);

  const data = useComposeAgentData(baseAgent, baseSchema);
  const create = useCreateComposedAgent(tags, onClose);

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    // Base, name, AND description each gate the create (an empty description 422s).
    if (baseAgent === null || name.trim() === '' || description.trim() === '') return;
    // A tool/preset read the spec fields depend on is in error; a bad response_format
    // fails its lint; an unset checked bake field is invalid — each blocks submit.
    if (data.readFailed || (hasResponseFormat && !responseFormat.valid)) return;
    const fallback = fallbackRef.current;
    if (fallback && !fallback.validate()) return;
    const spec = specRef.current;
    if (spec === null) return;
    create.mutate(
      buildCreateBody({
        name,
        description,
        baseAgent,
        baseSchema,
        ...spec,
        extraSchema,
        hasResponseFormat,
        responseFormatSchema: responseFormat.schema,
        checkedFallbacks: fallback?.checkedFallbacks ?? new Set<string>(),
        fallbackValue: fallback?.fallbackValue ?? {},
      }),
    );
  };

  return (
    <Dialog
      title="Compose an agent"
      description="Bake a prompt, tools, presets, sub-agents, and any fixed inputs over a base agent into a named, tagged, versioned agent."
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <form onSubmit={onSubmit} className="tai-stack">
        <ComposeIdentityFields
          name={name}
          onNameChange={setName}
          description={description}
          onDescriptionChange={setDescription}
          tags={tags}
          onTagsChange={setTags}
          toolMetaOff={data.toolMetaOff}
          submitted={submitted}
        />

        <Field
          label="Base agent"
          error={submitted && baseAgent === null ? 'A base agent is required.' : undefined}
        >
          <Select
            options={agents.map((agent) => ({
              value: agent.name,
              label: agent.description ? `${agent.name} — ${agent.description}` : agent.name,
            }))}
            value={baseName}
            onValueChange={(next) => {
              setBaseName(next);
              // Reset the response-format editor in the SAME update as the base switch,
              // so its base-keyed remount seeds from the cleared value.
              setResponseFormat({ schema: null, valid: true });
            }}
            placeholder="Select a base agent…"
          />
        </Field>

        {baseAgent !== null ? (
          <>
            <ComposeSpecFields
              ref={specRef}
              data={data}
              baseSchema={baseSchema}
              baseName={baseName}
              extraSchema={extraSchema}
              hasResponseFormat={hasResponseFormat}
              responseFormat={responseFormat}
              onResponseFormatChange={setResponseFormat}
            />
            <ComposeFallbackFields
              ref={fallbackRef}
              baseAgent={baseAgent}
              baseSchema={baseSchema}
            />
          </>
        ) : null}

        {create.isError ? <ErrorState message={errorMessage(create.error)} /> : null}

        <div className="tai-dialog-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={
              create.isPending || data.readFailed || (hasResponseFormat && !responseFormat.valid)
            }
          >
            {create.isPending ? <Spinner label="Composing agent" /> : null}
            Compose agent
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
