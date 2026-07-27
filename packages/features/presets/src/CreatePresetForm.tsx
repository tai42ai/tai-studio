/**
 * The CREATE-PRESET dialog off the list header.
 *
 *  1. `name` (required) and `description`.
 *  2. `base_tool` — the shared `ToolPicker` over `listTools()`, EXCLUDING existing
 *     non-conflicted preset names (a preset can never be another preset's base).
 *     The server stays the authority: a name that slips through is rejected with a
 *     loud 400/409, surfaced verbatim under the form.
 *  3. `fixed_kwargs` — a JSON textarea with a loud parse (a malformed body blocks
 *     submit and shows the parser message, never a silent empty bake). When the base
 *     tool's schema resolves its input field names are shown as a read-only hint.
 *  4. `tags` — free-text chips.
 *  5. `extensions` — the `ExtensionComboBuilder`; OMITTED from the body when empty
 *     (the route rejects an explicit `extensions: []`).
 *
 * On success it invalidates the presets list AND the tools master list (a create
 * binds a live tool), closes, and navigates the detail to the new preset.
 */
import { useEffect, useId, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePresetBody, PresetExtensionElement } from '@tai42/api-client';
import {
  Button,
  Dialog,
  ErrorState,
  ExtensionComboBuilder,
  Field,
  SchemaEditor,
  Spinner,
  Textarea,
  TextInput,
  ToolPicker,
  XCircleIcon,
  errorMessage,
  toolsListKey,
  useApi,
  useAppNavigate,
  type SchemaEditorChange,
} from '@tai42/studio-sdk';

import { TagsInput } from './tags';
import { parseJsonObject } from './parse';
import { ValidateVerdict } from './verdict';
import {
  presetAgentsKey,
  presetExtensionsKey,
  presetSchemaKey,
  presetToolTagsKey,
  presetToolsKey,
  presetsListKey,
} from './keys';

/** The base tool's declared input field names, for the read-only kwargs hint. */
function inputFieldNames(input: Record<string, unknown> | undefined): string[] {
  const properties = input?.properties;
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) return [];
  return Object.keys(properties);
}

export function CreatePresetForm({ onClose }: { readonly onClose: () => void }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useAppNavigate();

  const toolsQuery = useQuery({ queryKey: presetToolsKey, queryFn: () => api.listTools() });
  const presetsQuery = useQuery({ queryKey: presetsListKey, queryFn: () => api.listPresets() });
  const tagsQuery = useQuery({ queryKey: presetToolTagsKey, queryFn: () => api.listToolTags() });
  const extensionsQuery = useQuery({
    queryKey: presetExtensionsKey,
    queryFn: () => api.listExtensions(),
  });
  // ALL agents (not just spec-runnable) — the picker labels any agent run tool so an
  // author knows a base is an agent. An agent run tool is still a legal base.
  const agentsQuery = useQuery({ queryKey: presetAgentsKey, queryFn: () => api.listAgents() });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [base, setBase] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [combos, setCombos] = useState<PresetExtensionElement[][]>([]);
  const [outputSchema, setOutputSchema] = useState<SchemaEditorChange>({
    schema: null,
    valid: true,
  });
  const [kwargsText, setKwargsText] = useState('{}');
  const [kwargsError, setKwargsError] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);
  // Whether the extension combos carry only known names (Item 9). The builder reports
  // this; an unknown name blocks submit + validate.
  const [extensionsValid, setExtensionsValid] = useState(true);
  const extensionsLabelId = useId();
  const extensionsDescId = useId();

  // Agent run tools among the base options — their picker labels get a " (agent)"
  // suffix. Read from ALL agents (each summary carries its `tool_name`).
  const agentToolNames = useMemo(
    () => new Set((agentsQuery.data?.items ?? []).map((agent) => agent.tool_name)),
    [agentsQuery.data],
  );

  // A preset cannot be another preset's base: exclude every NON-conflicted preset
  // name (a conflicted row's name is either a foreign live tool — a valid base — or
  // unregistered, so it is never among the base options anyway).
  const excludeNames = useMemo(
    () => (presetsQuery.data ?? []).filter((row) => !row.conflicted).map((row) => row.name),
    [presetsQuery.data],
  );

  const tagsByTool = useMemo(() => {
    const map: Record<string, readonly string[]> = {};
    for (const entry of tagsQuery.data ?? []) map[entry.name] = entry.tags;
    return map;
  }, [tagsQuery.data]);

  const schemaQuery = useQuery({
    queryKey: presetSchemaKey(base ?? ''),
    queryFn: () => api.getToolSchema(base ?? ''),
    enabled: base !== null && base !== '',
  });

  const enrichmentFailed = tagsQuery.isError || agentsQuery.isError || schemaQuery.isError;
  const retryEnrichment = (): void => {
    if (tagsQuery.isError) void tagsQuery.refetch();
    if (agentsQuery.isError) void agentsQuery.refetch();
    if (schemaQuery.isError) void schemaQuery.refetch();
  };

  const create = useMutation({
    mutationFn: (body: CreatePresetBody) => api.createPreset(body),
    onSuccess: (record) => {
      void queryClient.invalidateQueries({ queryKey: presetsListKey });
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
      onClose();
      navigate('presets', { preset: record.name });
    },
  });

  // The dry-run validate door: the SAME pre-store verdict create would run, without a
  // write. Its result is cleared on any further edit (a stale verdict lies), driven by
  // the draft signature below.
  const validate = useMutation({
    mutationFn: (body: CreatePresetBody) => api.validatePreset(body),
  });
  const resetValidate = validate.reset;

  const nameMissing = name.trim() === '';
  const baseMissing = base === null || base === '';
  const parsed = parseJsonObject(kwargsText);
  const kwargsParses = !('error' in parsed);

  const draftSignature = JSON.stringify({
    name,
    description,
    base,
    tags,
    combos,
    kwargsText,
    outputSchema: outputSchema.schema,
  });
  useEffect(() => {
    resetValidate();
  }, [draftSignature, resetValidate]);

  // The full create draft, or `null` when `fixed_kwargs` does not parse (the parser
  // message is surfaced on the field). Shared by submit and validate so both send the
  // identical body.
  const buildBody = (): CreatePresetBody | null => {
    if ('error' in parsed) {
      setKwargsError(parsed.error);
      return null;
    }
    setKwargsError(undefined);
    return {
      name: name.trim(),
      base_tool: base ?? '',
      description: description.trim(),
      fixed_kwargs: parsed.value,
      tags,
      // OMIT extensions entirely when there are no combos — the route rejects an
      // explicit `extensions: []`.
      ...(combos.length > 0 ? { extensions: combos } : {}),
      // OMIT output_schema unless the author set one (a create carries none by default).
      ...(outputSchema.schema !== null ? { output_schema: outputSchema.schema } : {}),
    };
  };

  // The precondition both submit and validate share: a parseable, structurally-valid
  // draft. Submit has no extra dirtiness gate for a create.
  const canValidate =
    !nameMissing && !baseMissing && outputSchema.valid && extensionsValid && kwargsParses;

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    if (nameMissing || baseMissing) return;
    // A non-empty output schema that fails parse/lint, or an unknown extension name,
    // blocks submit — the inline messages already say why.
    if (!outputSchema.valid || !extensionsValid) return;
    const body = buildBody();
    if (body === null) return;
    create.mutate(body);
  };

  const onValidate = (): void => {
    const body = buildBody();
    if (body === null) return;
    validate.mutate(body);
  };

  const hints = inputFieldNames(schemaQuery.data?.input);

  return (
    <Dialog
      title="Create preset"
      description="Bind a base tool with fixed kwargs into a new named preset tool."
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        <Field label="Name" error={submitted && nameMissing ? 'A name is required.' : undefined}>
          <TextInput
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="paris_weather"
            aria-required
          />
        </Field>

        <Field label="Description">
          <TextInput
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            placeholder="Paris weather"
          />
        </Field>

        {toolsQuery.isError ? (
          <ErrorState
            message={errorMessage(toolsQuery.error)}
            onRetry={() => void toolsQuery.refetch()}
          />
        ) : presetsQuery.isError ? (
          // The base-tool exclusion list depends on the preset list — a failed load
          // is surfaced loudly, never a silently-empty exclusion.
          <ErrorState
            message={errorMessage(presetsQuery.error)}
            onRetry={() => void presetsQuery.refetch()}
          />
        ) : (
          <Field
            label="Base tool"
            error={submitted && baseMissing ? 'A base tool is required.' : undefined}
          >
            <ToolPicker
              toolNames={toolsQuery.data ?? []}
              value={base}
              onChange={setBase}
              disabled={toolsQuery.isPending}
              placeholder={toolsQuery.isPending ? 'Loading tools…' : 'Select a base tool…'}
              excludeNames={excludeNames}
              tagsByTool={tagsByTool}
              agentToolNames={agentToolNames}
            />
          </Field>
        )}

        {/* The base picker's and the kwargs hint's ENRICHMENT reads. Tags group the
            options; the agent list adds the " (agent)" suffix that is the only thing
            telling an author a base is an agent; the base tool's schema supplies the
            "Base tool inputs: …" hint. None is load-bearing, so a failure keeps the
            form usable — but it must never degrade SILENTLY, or an unlabelled,
            ungrouped picker and a hintless kwargs box read as the truth about the
            deployment. Each failed read gets its OWN line: joined into one string
            the sentences ran together. `.tai-field-error` is the published carrier
            for a wrapping message, so a 320 px viewport never widens on it, and each
            line carries the ERROR mark so the hue is never the only signal. */}
        {enrichmentFailed ? (
          <div role="alert" className="tai-stack tai-stack-2">
            {tagsQuery.isError ? (
              <p className="tai-field-error" style={{ margin: 0 }}>
                <XCircleIcon />
                {`Tag grouping is unavailable: ${errorMessage(tagsQuery.error)}`}
              </p>
            ) : null}
            {agentsQuery.isError ? (
              <p className="tai-field-error" style={{ margin: 0 }}>
                <XCircleIcon />
                {`Agent labelling is unavailable: ${errorMessage(agentsQuery.error)}`}
              </p>
            ) : null}
            {schemaQuery.isError ? (
              <p className="tai-field-error" style={{ margin: 0 }}>
                <XCircleIcon />
                {`Base tool input names are unavailable: ${errorMessage(schemaQuery.error)}`}
              </p>
            ) : null}
            <div>
              <Button type="button" onClick={retryEnrichment}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        <Field
          label="Fixed kwargs"
          description={
            hints.length > 0
              ? `A JSON object of values baked into the preset as fixed constants. Base tool inputs: ${hints.join(', ')}`
              : 'A JSON object of values baked into the preset as fixed constants.'
          }
          error={kwargsError}
        >
          <Textarea
            value={kwargsText}
            onChange={(event) => {
              setKwargsText(event.target.value);
            }}
            rows={5}
            aria-label="Fixed kwargs JSON"
            style={{ fontFamily: 'var(--tai-font-mono)' }}
          />
        </Field>

        <Field label="Tags" description="Categorization labels for this preset.">
          <TagsInput value={tags} onChange={setTags} />
        </Field>

        {/* A labelled GROUP, not a `Field`: the builder nests many checkboxes, and a
            single `Field` would hand them all one shared control id (breaking their
            label clicks). The label + description are associated by id. */}
        <div
          role="group"
          aria-labelledby={extensionsLabelId}
          aria-describedby={extensionsDescId}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
        >
          <span id={extensionsLabelId} style={{ fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>
            Extensions
          </span>
          <span
            id={extensionsDescId}
            style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}
          >
            Ordered extension combos applied to the preset tool.
          </span>
          {extensionsQuery.isError ? (
            <ErrorState
              message={errorMessage(extensionsQuery.error)}
              onRetry={() => void extensionsQuery.refetch()}
            />
          ) : (
            <ExtensionComboBuilder
              available={extensionsQuery.data ?? []}
              value={combos}
              onChange={setCombos}
              disabled={extensionsQuery.isPending}
              onValidityChange={setExtensionsValid}
              availableReady={extensionsQuery.isSuccess}
            />
          )}
        </div>

        <SchemaEditor
          value={outputSchema.schema}
          onChange={setOutputSchema}
          requireTitle={false}
          label="Output schema"
          description="An optional JSON Schema the preset enforces on its tool's structured output."
          idPrefix="create-preset-output-schema"
        />

        {create.isError ? <ErrorState message={errorMessage(create.error)} /> : null}

        {/* Dry-run verdict: a request failure (e.g. 503) is loud; otherwise the
            server's valid/invalid verdict renders — the invalid message verbatim. */}
        {validate.isError ? (
          <ErrorState message={errorMessage(validate.error)} />
        ) : validate.data !== undefined ? (
          <ValidateVerdict valid={validate.data.valid} error={validate.data.error} />
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onValidate} disabled={!canValidate || validate.isPending}>
            {validate.isPending ? <Spinner label="Validating draft" /> : null}
            Validate
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || !outputSchema.valid || !extensionsValid}
          >
            {create.isPending ? <Spinner label="Creating preset" /> : null}
            Create preset
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
