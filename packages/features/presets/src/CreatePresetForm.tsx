/**
 * The CREATE-PRESET dialog off the list header.
 *
 *  1. `name` and `description` — both REQUIRED, and both gate submit (the API rejects
 *     an empty description with a 422, so the client mirrors that rule).
 *  2. `base_tool` — the shared `ToolPicker`, EXCLUDING existing non-conflicted preset
 *     names (a preset can never be another preset's base). The server stays the
 *     authority: a name that slips through is rejected with a loud 400/409.
 *  3. `fixed_kwargs` — a JSON textarea with a loud parse (a malformed body blocks
 *     submit and shows the parser message, never a silent empty bake).
 *  4. `tags` — free-text chips, written to the tool_meta overlay AFTER the create
 *     succeeds (not a create-body field). Drawn only when the caller may write the
 *     overlay; without that grant the create sends no tags.
 *  5. `extensions` — the `ExtensionComboBuilder`; OMITTED from the body when empty.
 *  6. the input schema, the input map, the output schema and the output map — each
 *     optional and OMITTED when unset. The pairing, compile and render rules are the
 *     server's; its verdict shows through the submit feedback and Validate.
 *
 * On success it invalidates the presets list AND the tools master list (a create
 * binds a live tool), closes, and navigates the detail to the new preset.
 */
import {
  apiRoutes,
  type PresetExtensionElement,
  type StateBinding,
  type TemplatedText,
} from '@tai42/api-client';
import {
  Dialog,
  Field,
  type SchemaEditorDraft,
  StateBindingSection,
  useCanWrite,
  useFeatureOff,
} from '@tai42/studio-sdk';
import { type ReactNode, type SyntheticEvent, useState } from 'react';

import { ExtensionsField } from './ExtensionsField';
import { PresetBaseToolField } from './PresetBaseToolField';
import { PresetEnrichmentErrors } from './PresetEnrichmentErrors';
import { PresetFormActions } from './PresetFormActions';
import { PresetIdentityFields } from './PresetIdentityFields';
import { PresetIoFields } from './PresetIoFields';
import { PresetKwargsEditor } from './PresetKwargsEditor';
import { PresetSubmitFeedback } from './PresetSubmitFeedback';
import { TagsInput } from './tags';
import { usePresetEnvKeys } from './usePresetEnvKeys';
import { usePresetMutations } from './usePresetMutations';
import { usePresetToolCatalog } from './usePresetToolCatalog';
import { useStateBindingSources } from './useStateBindingSources';

export function CreatePresetForm({ onClose }: { readonly onClose: () => void }): ReactNode {
  // The overlay tags input is HIDDEN when the tool_meta store is OFF: an author must
  // not type categorization tags that the OFF overlay would silently drop.
  const toolMetaOff = useFeatureOff('tool_meta');
  // The tags land through the overlay write after the create; a caller without that
  // grant is not offered the field, and the create sends no tags.
  const canWriteTags = useCanWrite(apiRoutes.patch_api_tool_meta_tools_tool_name.path, 'PATCH');
  const showTags = !toolMetaOff && canWriteTags;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [base, setBase] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [combos, setCombos] = useState<PresetExtensionElement[][]>([]);
  const [inputSchema, setInputSchema] = useState<SchemaEditorDraft>({
    schema: null,
    valid: true,
  });
  const [inputMap, setInputMap] = useState<TemplatedText | null>(null);
  const [outputSchema, setOutputSchema] = useState<SchemaEditorDraft>({
    schema: null,
    valid: true,
  });
  const [outputMap, setOutputMap] = useState<TemplatedText | null>(null);
  // The optional door-layer state binding applied around every run of this preset.
  const [stateBinding, setStateBinding] = useState<StateBinding | null>(null);
  const [kwargsText, setKwargsText] = useState('{}');
  const [kwargsError, setKwargsError] = useState<string | undefined>(undefined);
  // Whether the fixed-kwargs editor's rows are all valid; a half-edited row blocks submit.
  const [kwargsRowsValid, setKwargsRowsValid] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  // Whether the extension combos carry only known names; an unknown name blocks submit.
  const [extensionsValid, setExtensionsValid] = useState(true);

  const catalog = usePresetToolCatalog(base);
  // The secret-reference key list: an enrichment read gated on a picked base (like the
  // catalog's reads), fed to the kwargs editor; it fails closed to a bare variable input.
  const envKeys = usePresetEnvKeys(base !== null && base !== '');
  const binding = useStateBindingSources(base, outputSchema.schema);
  const {
    create,
    validate,
    canValidate,
    submit,
    runValidate,
    versioningDisabled,
    versioningRefusal,
  } = usePresetMutations({
    draft: {
      name,
      description,
      base,
      combos,
      kwargsText,
      inputSchema,
      inputMap,
      outputSchema,
      outputMap,
      stateBinding,
      extensionsValid,
      kwargsRowsValid,
    },
    tags: showTags ? tags : [],
    onClose,
    setKwargsError,
  });

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    submit();
  };

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
        <PresetIdentityFields
          name={name}
          onNameChange={setName}
          description={description}
          onDescriptionChange={setDescription}
          submitted={submitted}
        />

        <PresetBaseToolField
          catalog={catalog}
          base={base}
          onChange={setBase}
          submitted={submitted}
        />

        <PresetEnrichmentErrors catalog={catalog} base={base} />

        <PresetKwargsEditor
          hints={catalog.hints}
          value={kwargsText}
          onChange={setKwargsText}
          onValidityChange={setKwargsRowsValid}
          error={kwargsError}
          availableKeys={envKeys.availableKeys}
          keyPickingAvailable={envKeys.keyPickingAvailable}
          idPrefix="create-preset-kwargs"
        />

        {showTags ? (
          <Field label="Tags" description="Categorization labels for this preset.">
            <TagsInput value={tags} onChange={setTags} />
          </Field>
        ) : null}

        <ExtensionsField
          value={combos}
          onChange={setCombos}
          onValidityChange={setExtensionsValid}
        />

        <PresetIoFields
          inputSchema={inputSchema}
          onInputSchemaChange={setInputSchema}
          inputMap={inputMap}
          onInputMapChange={setInputMap}
          outputSchema={outputSchema}
          onOutputSchemaChange={setOutputSchema}
          outputMap={outputMap}
          onOutputMapChange={setOutputMap}
          inputSchemaDescription="An optional JSON Schema for what callers send. An input map needs one."
          outputSchemaDescription="An optional JSON Schema the preset enforces on its tool's structured output."
          templates={binding.templatedTextTemplates}
          idPrefix="create-preset"
        />

        <StateBindingSection value={stateBinding} onChange={setStateBinding} {...binding} />

        <PresetSubmitFeedback
          create={create}
          validate={validate}
          versioningDisabled={versioningDisabled}
          versioningRefusal={versioningRefusal}
        />

        <PresetFormActions
          onCancel={onClose}
          onValidate={runValidate}
          canValidate={canValidate}
          validatePending={validate.isPending}
          createPending={create.isPending}
          schemasValid={inputSchema.valid && outputSchema.valid}
          extensionsValid={extensionsValid}
          kwargsRowsValid={kwargsRowsValid}
          versioningDisabled={versioningDisabled}
        />
      </form>
    </Dialog>
  );
}
