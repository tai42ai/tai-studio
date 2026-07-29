/**
 * The COMPOSE dialog: pick a base agent → author the composable spec fields
 * (`system_prompt`, `tool_names`, `presets`, `subagents`, plus any schema-driven
 * extras) into a `fixed_kwargs`, then create a named, tagged, versioned preset over
 * the base agent's run tool. The `presets`/`subagents` fields hold INLINE
 * self-contained objects; the preset picker EXPANDS a stored preset into an inline
 * `PresetSpec` object, never a stored-name reference.
 *
 * SAFETY: a spec carries arbitrary operator-authored prompt/tool/agent names, all
 * rendered as ESCAPED text through the DS components (React escapes them) — never
 * an HTML sink. Pinned by a test.
 */
import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AgentSummary, CreatePresetBody } from '@tai42/api-client';
import {
  Button,
  Checkbox,
  Dialog,
  ErrorState,
  Field,
  SchemaEditor,
  SchemaForm,
  Select,
  Spinner,
  TagsInput,
  TextInput,
  Textarea,
  defaultValueForSchema,
  errorMessage,
  toolsListKey,
  useApi,
  validateAgainstSchema,
  type JsonSchema,
  type SchemaEditorChange,
  type SchemaFormErrors,
} from '@tai42/studio-sdk';

import { authoredPresetsKey, authoredToolTagsKey, authoredToolsKey } from './keys';
import type { InlinePresetSpec, InlineSubAgentSpec } from './authoring-types';
import {
  ALL_SPEC_FIELDS,
  RESPONSE_FORMAT_FIELD,
  SCHEMA_FORM_EXTRA_FIELDS,
  schemaProps,
} from './authoring-schema';
import { MultiToolPicker } from './MultiToolPicker';
import { PresetSpecEditor } from './PresetSpecEditor';
import { SubAgentComposer } from './SubAgentComposer';

/** Whether a schema node declares something the auto-form can actually render. */
function isRenderable(node: JsonSchema): boolean {
  return (
    node.type !== undefined ||
    node.enum !== undefined ||
    node.anyOf !== undefined ||
    node.oneOf !== undefined ||
    node.$ref !== undefined
  );
}

function hasField(schema: JsonSchema, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(schemaProps(schema), field);
}

/**
 * Build the sub-schema of the `SchemaForm`-authored extra spec fields (`strategy`)
 * the agent declares AND the auto-form can render. A field the agent leaves untyped
 * (e.g. a permissive `{default: null}`) is not renderable, so it is omitted rather
 * than shown as a broken "unsupported field" control — it simply stays un-baked (a
 * valid, optional choice), and the server is the authority. `response_format` is NOT
 * here: it is a raw JSON Schema authored by the dedicated `SchemaEditor` instead.
 */
function extraSpecSchema(agentSchema: JsonSchema): JsonSchema | null {
  const props = schemaProps(agentSchema);
  const picked: Record<string, JsonSchema> = {};
  for (const field of SCHEMA_FORM_EXTRA_FIELDS) {
    const node = props[field];
    if (node !== undefined && isRenderable(node)) picked[field] = node;
  }
  if (Object.keys(picked).length === 0) return null;
  // Spread the base schema so its `$defs` document rides along — a picked field may
  // be (or contain) a `$ref` the form/seed resolve against the root. `required` is
  // reset: these extra fields are optional (baked only when set), and the base's own
  // required list must not ride along and demand unrendered fields.
  return { ...agentSchema, type: 'object', properties: picked, required: [] };
}

/**
 * The base agent's renderable top-level fields that are NOT part of the curated
 * spec vocabulary (`ALL_SPEC_FIELDS`) — the arbitrary tuning knobs a `spec_runnable`
 * agent may declare (e.g. a bounded step budget). Each is bakeable server-side, so
 * the compose dialog offers them as an OPT-IN checklist: an unchecked field is
 * never baked and stays a run-time input; a checked one is baked into the agent's
 * fixed identity. A field the auto-form cannot render is omitted (the server stays
 * the authority), mirroring `extraSpecSchema`.
 */
function fallbackFieldNames(agentSchema: JsonSchema): string[] {
  return Object.entries(schemaProps(agentSchema))
    .filter(([key, node]) => !ALL_SPEC_FIELDS.includes(key) && isRenderable(node))
    .map(([key]) => key);
}

/**
 * Build the object sub-schema over the CHECKED fallback fields (all required).
 * Spreads the base schema so its `$defs` document rides along — a picked field may
 * be a `$ref` (or contain one), which the form/validator resolve against the root.
 */
function subsetSchema(agentSchema: JsonSchema, checked: ReadonlySet<string>): JsonSchema | null {
  const picked: Record<string, JsonSchema> = {};
  for (const [key, node] of Object.entries(schemaProps(agentSchema))) {
    if (checked.has(key)) picked[key] = node;
  }
  if (Object.keys(picked).length === 0) return null;
  return { ...agentSchema, type: 'object', properties: picked, required: Object.keys(picked) };
}

export function ComposeAgentDialog({
  agents,
  onClose,
}: {
  readonly agents: readonly AgentSummary[];
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const toolsQuery = useQuery({ queryKey: authoredToolsKey, queryFn: () => api.listTools() });
  const tagsQuery = useQuery({ queryKey: authoredToolTagsKey, queryFn: () => api.listToolTags() });
  const presetsQuery = useQuery({
    queryKey: authoredPresetsKey,
    queryFn: () => api.listPresets(),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseName, setBaseName] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [presets, setPresets] = useState<InlinePresetSpec[]>([]);
  const [subagents, setSubagents] = useState<InlineSubAgentSpec[]>([]);
  const [extraSpec, setExtraSpec] = useState<unknown>({});
  const [responseFormat, setResponseFormat] = useState<SchemaEditorChange>({
    schema: null,
    valid: true,
  });
  const [tags, setTags] = useState<string[]>([]);
  const [checkedFallbacks, setCheckedFallbacks] = useState<ReadonlySet<string>>(() => new Set());
  const [fallbackValue, setFallbackValue] = useState<unknown>({});
  const [fallbackErrors, setFallbackErrors] = useState<SchemaFormErrors | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);

  const baseAgent = agents.find((agent) => agent.name === baseName) ?? null;
  const baseSchema: JsonSchema = useMemo(() => baseAgent?.input_schema ?? {}, [baseAgent]);
  // Memoised on the (stable) base agent so the seeding effect below does not see a
  // fresh object every render — that would loop `setExtraSpec` forever.
  const extraSchema = useMemo(
    () => (baseAgent ? extraSpecSchema(baseSchema) : null),
    [baseAgent, baseSchema],
  );
  // The non-spec renderable fields offered as an opt-in bake checklist, and the
  // subset schema over the currently-checked ones (drives the SchemaForm below).
  const fallbackNames = useMemo(
    () => (baseAgent ? fallbackFieldNames(baseSchema) : []),
    [baseAgent, baseSchema],
  );
  const fallbackSchema = useMemo(
    () => (baseAgent ? subsetSchema(baseSchema, checkedFallbacks) : null),
    [baseAgent, baseSchema, checkedFallbacks],
  );

  // A conflicted/quarantined preset is delete-only — it must NEVER seed a
  // composition — so the inline-preset picker offers only the non-conflicted rows.
  const usablePresets = useMemo(
    () => (presetsQuery.data ?? []).filter((record) => !record.conflicted),
    [presetsQuery.data],
  );

  // A failed read must never render as an enabled EMPTY picker: "the deployment
  // has nothing to choose" and "the read failed" would be the same screen, and the
  // operator would compose an agent with no tools believing there were none. Each
  // failed read replaces its control with a loud `ErrorState`, and a read the
  // rendered spec fields depend on blocks submit until it succeeds.
  const needsTools =
    baseAgent !== null && (hasField(baseSchema, 'tool_names') || hasField(baseSchema, 'subagents'));
  const needsPresets =
    baseAgent !== null && (hasField(baseSchema, 'presets') || hasField(baseSchema, 'subagents'));
  const readFailed = (needsTools && toolsQuery.isError) || (needsPresets && presetsQuery.isError);
  const retryReads = (): void => {
    if (toolsQuery.isError) void toolsQuery.refetch();
    if (presetsQuery.isError) void presetsQuery.refetch();
  };

  // Undefined when there are no native tags, so the ToolPicker stays in its flat
  // (non-grouped) mode rather than forcing a single "Untagged" cluster.
  const tagsByTool = useMemo(() => {
    const map: Record<string, readonly string[]> = {};
    for (const entry of tagsQuery.data ?? []) map[entry.name] = entry.tags;
    return Object.keys(map).length > 0 ? map : undefined;
  }, [tagsQuery.data]);

  // Re-seed the extra-spec form to the schema defaults whenever the base changes.
  useEffect(() => {
    setExtraSpec(extraSchema ? defaultValueForSchema(extraSchema) : {});
  }, [extraSchema]);

  // A new base agent has a different field set — clear the opt-in bake checklist.
  // (The response-format editor is cleared synchronously in the base picker's handler
  // so its base-keyed remount re-seeds from the cleared value, not stale text.)
  useEffect(() => {
    setCheckedFallbacks(new Set());
    setFallbackValue({});
    setFallbackErrors(undefined);
  }, [baseAgent]);

  const hasResponseFormat = baseAgent !== null && hasField(baseSchema, RESPONSE_FORMAT_FIELD);

  // Toggling a checklist field seeds (on check) or drops (on uncheck) its value, so
  // the SchemaForm below edits exactly the checked fields and an unchecked field
  // never carries a value into `fixed_kwargs`.
  const toggleFallback = (field: string, checked: boolean): void => {
    setCheckedFallbacks((prev) => {
      const next = new Set(prev);
      if (checked) next.add(field);
      else next.delete(field);
      return next;
    });
    setFallbackValue((prev: unknown) => {
      const obj: Record<string, unknown> =
        prev !== null && typeof prev === 'object' ? { ...(prev as Record<string, unknown>) } : {};
      const node = schemaProps(baseSchema)[field];
      if (checked && node) {
        // Resolve against the base schema so a `$ref`-typed field seeds correctly.
        const seed = defaultValueForSchema(
          { type: 'object', properties: { [field]: node } },
          baseSchema,
        ) as Record<string, unknown>;
        obj[field] = seed[field];
        return obj;
      }
      return Object.fromEntries(Object.entries(obj).filter(([key]) => key !== field));
    });
  };

  const create = useMutation({
    mutationFn: (body: CreatePresetBody) => api.createPreset(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authoredPresetsKey });
      // A composed agent binds a live preset-tool, so the shared registered-tool
      // master list must refetch for it to appear on the tools page without a
      // manual refresh.
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
      onClose();
    },
  });

  const nameMissing = name.trim() === '';
  const baseMissing = baseAgent === null;

  /** Assemble `fixed_kwargs` from only the spec fields the operator actually set. */
  function buildFixedKwargs(): Record<string, unknown> {
    const fixed: Record<string, unknown> = {};
    if (baseAgent === null) return fixed;
    if (hasField(baseSchema, 'system_prompt') && systemPrompt.trim() !== '') {
      fixed.system_prompt = systemPrompt;
    }
    if (hasField(baseSchema, 'tool_names') && toolNames.length > 0) fixed.tool_names = toolNames;
    if (hasField(baseSchema, 'presets') && presets.length > 0) fixed.presets = presets;
    if (hasField(baseSchema, 'subagents') && subagents.length > 0) fixed.subagents = subagents;
    // Extra schema-driven spec fields: bake only the non-null values the operator set.
    if (extraSchema && extraSpec !== null && typeof extraSpec === 'object') {
      for (const field of SCHEMA_FORM_EXTRA_FIELDS) {
        const val = (extraSpec as Record<string, unknown>)[field];
        if (val !== undefined && val !== null) fixed[field] = val;
      }
    }
    // The response format is a raw JSON Schema authored by the SchemaEditor; bake it
    // only when the operator actually set one (an empty editor leaves it un-baked).
    if (hasResponseFormat && responseFormat.schema !== null) {
      fixed[RESPONSE_FORMAT_FIELD] = responseFormat.schema;
    }
    // Opt-in fallback fields: bake exactly the CHECKED non-spec knobs. An unchecked
    // field is never baked and stays a run-time input on the run form.
    if (fallbackValue !== null && typeof fallbackValue === 'object') {
      for (const field of checkedFallbacks) {
        const val = (fallbackValue as Record<string, unknown>)[field];
        if (val !== undefined) fixed[field] = val;
      }
    }
    return fixed;
  }

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    if (baseAgent === null || nameMissing) return;
    // A tool/preset read the spec fields depend on is in error, so the pickers show
    // no choices this form could honestly submit.
    if (readFailed) return;
    // A non-empty response_format that fails parse/lint (e.g. a missing `title`)
    // blocks submit — the SchemaEditor shows the loud inline message.
    if (hasResponseFormat && !responseFormat.valid) return;
    // Every checked bake field must carry a valid value before submit — the subset
    // schema marks them all required, so an unset one blocks (loud, in-form errors).
    if (fallbackSchema) {
      const found = validateAgainstSchema(fallbackSchema, fallbackValue);
      setFallbackErrors(found);
      if (Object.keys(found).length > 0) return;
    }
    create.mutate({
      name: name.trim(),
      // The base tool is the agent's run tool, which the backend registers (and
      // resolves the preset's base_tool) under the agent's REGISTRATION name — which
      // can differ from its `tool_name`. Submit the registration name so authoring
      // works regardless of whether the two coincide.
      base_tool: baseAgent.name,
      description: description.trim(),
      fixed_kwargs: buildFixedKwargs(),
      tags,
    });
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
        <Field label="Name" error={submitted && nameMissing ? 'A name is required.' : undefined}>
          <TextInput
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="support_bot"
          />
        </Field>

        <Field label="Description">
          <TextInput
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            placeholder="A helpdesk agent"
          />
        </Field>

        <Field label="Tags" description="Categorization labels for this agent.">
          <TagsInput value={tags} onChange={setTags} />
        </Field>

        <Field
          label="Base agent"
          error={submitted && baseMissing ? 'A base agent is required.' : undefined}
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
              // so its base-keyed remount seeds from the cleared value — an effect would
              // run after the remount and leave the previous agent's schema on screen.
              setResponseFormat({ schema: null, valid: true });
            }}
            placeholder="Select a base agent…"
          />
        </Field>

        {baseAgent !== null ? (
          <div className="tai-stack" data-testid="compose-spec-fields">
            {hasField(baseSchema, 'system_prompt') ? (
              <Field label="System prompt">
                <Textarea
                  value={systemPrompt}
                  onChange={(event) => {
                    setSystemPrompt(event.target.value);
                  }}
                  placeholder="You are a helpdesk agent."
                />
              </Field>
            ) : null}

            {hasField(baseSchema, 'tool_names') ? (
              <Field label="Tools" description="The tools this agent may call." group>
                {toolsQuery.isError ? (
                  <ErrorState
                    message={errorMessage(toolsQuery.error)}
                    onRetry={() => void toolsQuery.refetch()}
                  />
                ) : (
                  <>
                    {/* A tags failure must not take down tool picking: the picker
                        keeps its flat mode and the failure is stated rather than
                        silently ungrouping the list. */}
                    {tagsQuery.isError ? (
                      <ErrorState
                        message={errorMessage(tagsQuery.error)}
                        onRetry={() => void tagsQuery.refetch()}
                      />
                    ) : null}
                    <MultiToolPicker
                      toolNames={toolsQuery.data ?? []}
                      tagsByTool={tagsByTool}
                      value={toolNames}
                      onChange={setToolNames}
                      disabled={toolsQuery.isPending}
                      idPrefix="compose-tools"
                    />
                  </>
                )}
              </Field>
            ) : null}

            {hasField(baseSchema, 'presets') ? (
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
                    presetRecords={usablePresets}
                    value={presets}
                    onChange={setPresets}
                    idPrefix="compose-presets"
                  />
                )}
              </Field>
            ) : null}

            {hasField(baseSchema, 'subagents') ? (
              <Field
                label="Sub-agents"
                description="Inline sub-agent specs this agent can delegate to."
                group
              >
                {toolsQuery.isError || presetsQuery.isError ? (
                  <ErrorState
                    message={errorMessage(
                      toolsQuery.isError ? toolsQuery.error : presetsQuery.error,
                    )}
                    onRetry={retryReads}
                  />
                ) : (
                  <>
                    {/* A tags failure must not take down sub-agent tool picking: the
                        composer's pickers keep their flat mode and the failure is
                        stated rather than silently ungrouping the list. */}
                    {tagsQuery.isError ? (
                      <ErrorState
                        message={errorMessage(tagsQuery.error)}
                        onRetry={() => void tagsQuery.refetch()}
                      />
                    ) : null}
                    <SubAgentComposer
                      toolNames={toolsQuery.data ?? []}
                      tagsByTool={tagsByTool}
                      presetRecords={usablePresets}
                      value={subagents}
                      onChange={setSubagents}
                    />
                  </>
                )}
              </Field>
            ) : null}

            {extraSchema !== null ? (
              <Field label="Strategy" group>
                <SchemaForm schema={extraSchema} value={extraSpec} onChange={setExtraSpec} />
              </Field>
            ) : null}

            {hasResponseFormat ? (
              <SchemaEditor
                value={responseFormat.schema}
                onChange={setResponseFormat}
                requireTitle
                label="Response format"
                description="A JSON Schema forcing the agent's structured output. A top-level title is required."
                idPrefix="compose-response-format"
                // Re-seed the editor when the base agent changes.
                key={baseName}
              />
            ) : null}

            {/* Each Checkbox owns its own id, so this group is NOT a single `Field`
                (that would share one id across every box); it is a labelled group. */}
            {fallbackNames.length > 0 ? (
              <div
                className="tai-stack-2"
                role="group"
                aria-labelledby="compose-fallback-heading"
                aria-describedby="compose-fallback-desc"
              >
                <span id="compose-fallback-heading" className="tai-label">
                  Fix additional inputs
                </span>
                <span id="compose-fallback-desc" className="tai-muted">
                  Checked fields are baked into the agent and cannot be set at run time.
                </span>
                <div className="tai-stack-2" data-testid="compose-fallback-fields">
                  {fallbackNames.map((field) => {
                    const description = schemaProps(baseSchema)[field]?.description;
                    return (
                      <Checkbox
                        key={field}
                        checked={checkedFallbacks.has(field)}
                        onCheckedChange={(next) => {
                          toggleFallback(field, next);
                        }}
                        label={description ? `${field} — ${description}` : field}
                      />
                    );
                  })}
                  {/* The subset form over the checked fields — each required. */}
                  {fallbackSchema !== null ? (
                    <SchemaForm
                      schema={fallbackSchema}
                      value={fallbackValue}
                      onChange={setFallbackValue}
                      errors={fallbackErrors}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
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
              create.isPending || readFailed || (hasResponseFormat && !responseFormat.valid)
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
