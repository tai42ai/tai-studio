/**
 * The SAVE-NEW-VERSION dialog. Pre-fills `fixed_kwargs` (JSON textarea),
 * `description` (text), `extensions` (the `ExtensionComboBuilder`), `output_schema`
 * (the `SchemaEditor`) and `state_binding` (the `StateBindingSection`) from the
 * preset's ACTIVE body, then sends ONLY the fields the user changed:
 *  - an untouched field is OMITTED (the route carries the active value forward);
 *  - extensions the user cleared are sent as an explicit `[]` (the route clears them);
 *  - an output schema the user cleared is sent as an explicit `null`;
 *  - a state binding the user removed is sent as an explicit `null` (the route clears
 *    it), and a set/edited one is sent verbatim; leaving it untouched carries the
 *    active binding forward.
 *  - an edited `description` sends its new value; an emptied one is rejected client
 *    side (loud inline error, submit blocked), mirroring the API's own rule (the
 *    route rejects an explicit empty description with a 422).
 * Submit is disabled until at least one field is dirty (an empty body is a loud 400).
 *
 * The active binding is not on the preset RECORD; it rides the current version body,
 * so the dialog reads the version list and prefills from the `is_current` row. The
 * base tool's input/output schemas and the states/templates catalogs feed the binding
 * editor's field pickers, exactly as the create form wires them.
 *
 * Overlay categorization tags are NOT a version field — they live in the tool_meta
 * overlay and are edited on the detail pane, not here. The per-version generic label
 * list is a separate feature, edited in the version-history panel.
 *
 * A successful save invalidates the list, this preset's detail + versions, and the
 * tools master list (the reload rebinds the live tool). A malformed `fixed_kwargs`
 * JSON blocks submit with the parser message; every 4xx renders verbatim.
 */
import { useEffect, useId, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PresetDetail,
  PresetExtensionElement,
  SavePresetVersionBody,
  StateBinding,
  ValidatePresetBody,
} from '@tai42/api-client';
import {
  Button,
  Dialog,
  ErrorState,
  ExtensionComboBuilder,
  Field,
  SchemaEditor,
  Spinner,
  StateBindingSection,
  TextInput,
  Textarea,
  errorMessage,
  fieldPathsFromSchema,
  statesCatalogFromList,
  templatesCatalogFromList,
  statesListKey,
  stateTemplatesKey,
  toolsListKey,
  useApi,
  type BindingSourceSchemas,
  type SchemaEditorChange,
} from '@tai42/studio-sdk';

import { jsonEqual, parseJsonObject } from './parse';
import { ValidateVerdict } from './verdict';
import { presetDetailKey, presetExtensionsKey, presetVersionsKey, presetsListKey } from './keys';

export function SaveVersionDialog({
  detail,
  onClose,
}: {
  readonly detail: PresetDetail;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const name = detail.name;

  const extensionsQuery = useQuery({
    queryKey: presetExtensionsKey,
    queryFn: () => api.listExtensions(),
  });

  // The active binding is not on the record — it rides the current version body, so the
  // dialog reads the version list (already cached by the version-history panel) and seeds
  // from the `is_current` row. A failed read is surfaced loudly in the binding section.
  const versionsQuery = useQuery({
    queryKey: presetVersionsKey(name),
    queryFn: ({ signal }) => api.listPresetVersions(name, signal),
  });
  const seedBinding = useMemo<StateBinding | null>(
    () => (versionsQuery.data ?? []).find((row) => row.is_current)?.body.state_binding ?? null,
    [versionsQuery.data],
  );

  // The states + templates catalogs and the base tool's declared schemas feed the
  // binding editor's field pickers, mirroring the create form's wiring.
  const statesQuery = useQuery({
    queryKey: statesListKey,
    queryFn: ({ signal }) => api.listStates(signal),
  });
  const templatesQuery = useQuery({
    queryKey: stateTemplatesKey,
    queryFn: ({ signal }) => api.listStateTemplates(signal),
  });
  // The stored templates a binding's templated-text jq slots may reference by id.
  const authoredTemplatesQuery = useQuery({
    queryKey: ['templates', 'names'],
    queryFn: ({ signal }) => api.listTemplates(signal),
  });
  const baseSchemaQuery = useQuery({
    queryKey: ['state-binding', 'tool-schema', detail.base_tool],
    queryFn: ({ signal }) => api.getToolSchema(detail.base_tool, signal),
    enabled: detail.base_tool !== '',
  });

  const seedKwargsText = useMemo(() => JSON.stringify(detail.fixed_kwargs, null, 2), [detail]);
  // The active version's combos carry their author config verbatim; the config-aware
  // builder edits them directly, so no name-only projection or carry-forward is needed.
  const seedCombos = useMemo(() => detail.extensions.map((combo) => [...combo]), [detail]);

  const [kwargsText, setKwargsText] = useState(seedKwargsText);
  const [description, setDescription] = useState(detail.description);
  const [combos, setCombos] = useState<PresetExtensionElement[][]>(seedCombos);
  const [outputSchema, setOutputSchema] = useState<SchemaEditorChange>({
    schema: detail.output_schema,
    valid: true,
  });
  // The binding seeds asynchronously (from the version list, not the prop), so it is
  // seeded once via an effect. `bindingSeeded` gates its dirtiness check so the pre-seed
  // `null` is never mistaken for a user clear of a carried-forward binding.
  const [stateBinding, setStateBinding] = useState<StateBinding | null>(null);
  const [bindingSeeded, setBindingSeeded] = useState(false);
  useEffect(() => {
    if (versionsQuery.isSuccess && !bindingSeeded) {
      setStateBinding(seedBinding);
      setBindingSeeded(true);
    }
  }, [versionsQuery.isSuccess, bindingSeeded, seedBinding]);
  const [kwargsError, setKwargsError] = useState<string | undefined>(undefined);
  // Whether the extension combos carry only known names. An unknown name
  // blocks submit + validate.
  const [extensionsValid, setExtensionsValid] = useState(true);
  const extensionsLabelId = useId();
  const extensionsDescId = useId();

  const parsed = parseJsonObject(kwargsText);
  const kwargsParses = !('error' in parsed);
  const kwargsChanged = 'error' in parsed ? true : !jsonEqual(parsed.value, detail.fixed_kwargs);
  const descriptionChanged = description !== detail.description;
  // An EDITED description emptied to blank is rejected by the route (422), so the
  // client blocks it with a loud inline error rather than round-tripping a certain
  // failure. An UNTOUCHED description is never validated — it simply carries forward.
  const descriptionInvalid = descriptionChanged && description.trim() === '';
  const extensionsChanged = !jsonEqual(combos, detail.extensions);
  const outputSchemaChanged = !jsonEqual(outputSchema.schema, detail.output_schema);
  // Only compared once the binding has seeded from the version list — a pre-seed `null`
  // must not read as a clear of a carried-forward binding.
  const stateBindingChanged = bindingSeeded && !jsonEqual(stateBinding, seedBinding);
  const dirty =
    kwargsChanged ||
    descriptionChanged ||
    extensionsChanged ||
    outputSchemaChanged ||
    stateBindingChanged;

  const save = useMutation({
    mutationFn: (body: SavePresetVersionBody) => api.savePresetVersion(name, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: presetsListKey });
      void queryClient.invalidateQueries({ queryKey: presetDetailKey(name) });
      void queryClient.invalidateQueries({ queryKey: presetVersionsKey(name) });
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
      onClose();
    },
  });

  // The dry-run validate door in VERSION mode: the server carries base_tool +
  // description forward from the active body, so the draft sends only the MERGED
  // editable fields (seed + edits) plus `name`. The verdict clears on any edit.
  const validate = useMutation({
    mutationFn: (body: ValidatePresetBody) => api.validatePreset(body),
  });
  const resetValidate = validate.reset;

  const draftSignature = JSON.stringify({
    kwargsText,
    description,
    combos,
    outputSchema: outputSchema.schema,
    stateBinding,
  });
  useEffect(() => {
    resetValidate();
  }, [draftSignature, resetValidate]);

  // Validate is enabled whenever the form parses and the description is not an edited
  // blank — the submit precondition MINUS the dirtiness gate (a clean draft is
  // validatable even before any edit).
  const canValidate = kwargsParses && outputSchema.valid && extensionsValid && !descriptionInvalid;

  const onValidate = (): void => {
    if ('error' in parsed) {
      setKwargsError(parsed.error);
      return;
    }
    setKwargsError(undefined);
    validate.mutate({
      name,
      fixed_kwargs: parsed.value,
      // Mirror the write: a changed description is sent, an untouched one omitted so
      // the verdict is read under the same carry-forward semantics as the save.
      ...(descriptionChanged ? { description: description.trim() } : {}),
      // The config-aware builder carries each combo's author config verbatim; an
      // empty list means "no combos", read under save-version (edit) semantics.
      extensions: combos,
      output_schema: outputSchema.schema,
      // Mirror the write's binding sentinel: send the edited binding (null when cleared)
      // only when it changed, so an untouched one is validated as carried-forward.
      ...(stateBindingChanged ? { state_binding: stateBinding } : {}),
    });
  };

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (!dirty) return;
    // A non-empty output schema that fails parse/lint, an unknown extension name, or
    // an edited-blank description each blocks submit — the inline messages say why.
    if (!outputSchema.valid || !extensionsValid || descriptionInvalid) return;
    if ('error' in parsed) {
      setKwargsError(parsed.error);
      return;
    }
    setKwargsError(undefined);
    const body: SavePresetVersionBody = {
      ...(kwargsChanged ? { fixed_kwargs: parsed.value } : {}),
      // A changed description sends its trimmed value; an untouched one is omitted and
      // the route carries the active description forward.
      ...(descriptionChanged ? { description: description.trim() } : {}),
      // A cleared builder sends an explicit `[]`; the route clears the combos. The
      // config-aware builder carries each combo's author `config` verbatim, so the
      // edited value is sent as-is.
      ...(extensionsChanged ? { extensions: combos } : {}),
      // An untouched schema carries forward (omitted); an explicit clear sends `null`.
      ...(outputSchemaChanged ? { output_schema: outputSchema.schema } : {}),
      // An untouched binding carries forward (omitted); a removed one sends an explicit
      // `null` (the route clears it), a set/edited one sends the binding verbatim.
      ...(stateBindingChanged ? { state_binding: stateBinding } : {}),
    };
    save.mutate(body);
  };

  return (
    <Dialog
      title={`Save version — ${name}`}
      description="Author a new version. Only the fields you change are sent; the rest carry forward."
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        <Field
          label="Fixed kwargs"
          description="A JSON object baked into the preset as fixed constants."
          error={kwargsError}
        >
          <Textarea
            value={kwargsText}
            onChange={(event) => {
              setKwargsText(event.target.value);
            }}
            rows={6}
            aria-label="Fixed kwargs JSON"
            style={{ fontFamily: 'var(--tai-font-mono)' }}
          />
        </Field>

        <Field
          label="Description"
          description="The tool's LLM-facing description. Leave it unchanged to carry the active one forward."
          error={descriptionInvalid ? 'A description is required.' : undefined}
        >
          <TextInput
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            aria-required
          />
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
            Ordered extension sets applied to the preset tool.
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
          description="The JSON Schema enforced on this tool's structured output. Clear it to drop the schema; leave it to carry the current one forward."
          idPrefix="save-version-output-schema"
        />

        {/* The active binding rides the current version body; a failed version read
            leaves it unseedable, so the binding editor is withheld behind a loud error
            with retry rather than shown empty (which would read as "no binding"). The
            rest of the form still saves — an omitted binding carries the active one
            forward. The section is mounted only once the binding has seeded, so its
            disclosure opens correctly when the active binding is non-empty (its
            open/closed state is fixed at mount from the value it is first handed). */}
        {versionsQuery.isError ? (
          <ErrorState
            message={errorMessage(versionsQuery.error)}
            onRetry={() => void versionsQuery.refetch()}
          />
        ) : bindingSeeded ? (
          <StateBindingSection
            value={stateBinding}
            onChange={setStateBinding}
            statesCatalog={statesCatalogFromList(statesQuery.data ?? [])}
            templatesCatalog={templatesCatalogFromList(templatesQuery.data ?? [])}
            templatedTextTemplates={{
              templates: (authoredTemplatesQuery.data ?? []).map((id) => ({ id })),
              loading: authoredTemplatesQuery.isPending,
              error: authoredTemplatesQuery.isError
                ? errorMessage(authoredTemplatesQuery.error)
                : undefined,
              onRetry: () => void authoredTemplatesQuery.refetch(),
            }}
            sources={
              {
                input: fieldPathsFromSchema(baseSchemaQuery.data?.input),
                output: fieldPathsFromSchema(outputSchema.schema ?? baseSchemaQuery.data?.output),
                loading: baseSchemaQuery.isPending,
                error: baseSchemaQuery.isError ? "Couldn't load the tool's fields." : undefined,
              } satisfies BindingSourceSchemas
            }
            loading={statesQuery.isPending || templatesQuery.isPending}
            error={
              statesQuery.isError || templatesQuery.isError
                ? errorMessage(statesQuery.error ?? templatesQuery.error)
                : undefined
            }
          />
        ) : (
          <Spinner label="Loading state binding" />
        )}

        {save.isError ? <ErrorState message={errorMessage(save.error)} /> : null}

        {/* Dry-run verdict: a request failure is loud; otherwise the server's
            valid/invalid verdict renders — the invalid message verbatim. */}
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
            disabled={
              save.isPending ||
              !dirty ||
              !outputSchema.valid ||
              !extensionsValid ||
              descriptionInvalid
            }
          >
            {save.isPending ? <Spinner label="Saving version" /> : null}
            Save as new version
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
