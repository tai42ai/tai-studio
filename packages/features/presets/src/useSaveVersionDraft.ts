/**
 * The save-new-version draft: it seeds every field from the preset's ACTIVE body,
 * tracks which fields the user changed, and sends ONLY those (an untouched field is
 * omitted so the route carries it forward; a cleared extensions list / output schema
 * / state binding is sent as an explicit `[]` / `null`). The active binding is not on
 * the record — it rides the current version body, so it seeds asynchronously from the
 * version list and its dirtiness is gated on the seed so a pre-seed `null` never reads
 * as a user clear.
 */
import type {
  PresetDetail,
  PresetExtensionElement,
  SavePresetVersionBody,
  StateBinding,
  ValidatePresetBody,
} from '@tai42/api-client';
import { type SchemaEditorChange, toolsListKey, useApi } from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { presetDetailKey, presetsListKey, presetVersionsKey } from './keys';
import { jsonEqual, parseJsonObject } from './parse';

/** The seeded field state plus the per-field dirtiness the save/validate bodies read. */
function useVersionDraftState(detail: PresetDetail) {
  const api = useApi();
  const name = detail.name;

  // The active binding rides the current version body, so read the version list
  // (already cached by the version-history panel) and seed from the `is_current` row.
  const versionsQuery = useQuery({
    queryKey: presetVersionsKey(name),
    queryFn: ({ signal }) => api.listPresetVersions(name, signal),
  });
  const seedBinding = useMemo<StateBinding | null>(
    () => (versionsQuery.data ?? []).find((row) => row.is_current)?.body.state_binding ?? null,
    [versionsQuery.data],
  );
  const seedKwargsText = useMemo(() => JSON.stringify(detail.fixed_kwargs, null, 2), [detail]);
  const seedCombos = useMemo(() => detail.extensions.map((combo) => [...combo]), [detail]);

  const [kwargsText, setKwargsText] = useState(seedKwargsText);
  const [description, setDescription] = useState(detail.description);
  const [combos, setCombos] = useState<PresetExtensionElement[][]>(seedCombos);
  const [outputSchema, setOutputSchema] = useState<SchemaEditorChange>({
    schema: detail.output_schema,
    valid: true,
  });
  const [stateBinding, setStateBinding] = useState<StateBinding | null>(null);
  const [bindingSeeded, setBindingSeeded] = useState(false);
  const [kwargsError, setKwargsError] = useState<string | undefined>(undefined);
  const [extensionsValid, setExtensionsValid] = useState(true);
  useEffect(() => {
    if (versionsQuery.isSuccess && !bindingSeeded) {
      setStateBinding(seedBinding);
      setBindingSeeded(true);
    }
  }, [versionsQuery.isSuccess, bindingSeeded, seedBinding]);

  const parsed = parseJsonObject(kwargsText);
  const kwargsChanged = 'error' in parsed ? true : !jsonEqual(parsed.value, detail.fixed_kwargs);
  const descriptionChanged = description !== detail.description;
  // An EDITED description emptied to blank is rejected by the route (422); block it
  // client-side. An UNTOUCHED description is never validated — it carries forward.
  const descriptionInvalid = descriptionChanged && description.trim() === '';
  const extensionsChanged = !jsonEqual(combos, detail.extensions);
  const outputSchemaChanged = !jsonEqual(outputSchema.schema, detail.output_schema);
  // Compared only once the binding has seeded — a pre-seed `null` is not a clear.
  const stateBindingChanged = bindingSeeded && !jsonEqual(stateBinding, seedBinding);
  const dirty =
    kwargsChanged ||
    descriptionChanged ||
    extensionsChanged ||
    outputSchemaChanged ||
    stateBindingChanged;
  const canValidate =
    !('error' in parsed) && outputSchema.valid && extensionsValid && !descriptionInvalid;

  return {
    name,
    versionsQuery,
    kwargsText,
    setKwargsText,
    description,
    setDescription,
    combos,
    setCombos,
    outputSchema,
    setOutputSchema,
    stateBinding,
    setStateBinding,
    bindingSeeded,
    kwargsError,
    setKwargsError,
    extensionsValid,
    setExtensionsValid,
    parsed,
    kwargsChanged,
    descriptionChanged,
    descriptionInvalid,
    extensionsChanged,
    outputSchemaChanged,
    stateBindingChanged,
    dirty,
    canValidate,
  };
}

/** The seeded draft state plus the save/validate mutations and their submit handlers. */
export type SaveVersionDraft = ReturnType<typeof useSaveVersionDraft>;

export function useSaveVersionDraft(detail: PresetDetail, onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  const draft = useVersionDraftState(detail);
  const { name, parsed } = draft;

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
  // description forward, so the draft sends only the MERGED editable fields plus name.
  const validate = useMutation({
    mutationFn: (body: ValidatePresetBody) => api.validatePreset(body),
  });
  const resetValidate = validate.reset;

  const draftSignature = JSON.stringify({
    kwargsText: draft.kwargsText,
    description: draft.description,
    combos: draft.combos,
    outputSchema: draft.outputSchema.schema,
    stateBinding: draft.stateBinding,
  });
  useEffect(() => {
    resetValidate();
  }, [draftSignature, resetValidate]);

  const submit = (): void => {
    if (!draft.dirty) return;
    if (!draft.outputSchema.valid || !draft.extensionsValid || draft.descriptionInvalid) return;
    if ('error' in parsed) {
      draft.setKwargsError(parsed.error);
      return;
    }
    draft.setKwargsError(undefined);
    save.mutate(changedFields(draft));
  };

  const runValidate = (): void => {
    if ('error' in parsed) {
      draft.setKwargsError(parsed.error);
      return;
    }
    draft.setKwargsError(undefined);
    validate.mutate({
      name,
      fixed_kwargs: parsed.value,
      // Mirror the write: a changed description is sent, an untouched one omitted.
      ...(draft.descriptionChanged ? { description: draft.description.trim() } : {}),
      // An empty list means "no combos", read under save-version (edit) semantics.
      extensions: draft.combos,
      output_schema: draft.outputSchema.schema,
      // Send the edited binding (null when cleared) only when it changed.
      ...(draft.stateBindingChanged ? { state_binding: draft.stateBinding } : {}),
    });
  };

  return { ...draft, save, validate, submit, runValidate };
}

/** The save body carrying ONLY the fields the user changed (kwargs already parsed OK). */
function changedFields(draft: ReturnType<typeof useVersionDraftState>): SavePresetVersionBody {
  const kwargs = 'error' in draft.parsed ? {} : draft.parsed.value;
  return {
    ...(draft.kwargsChanged ? { fixed_kwargs: kwargs } : {}),
    // A changed description sends its trimmed value; an untouched one is omitted.
    ...(draft.descriptionChanged ? { description: draft.description.trim() } : {}),
    // A cleared builder sends an explicit `[]`; the route clears the combos.
    ...(draft.extensionsChanged ? { extensions: draft.combos } : {}),
    // An untouched schema carries forward (omitted); an explicit clear sends `null`.
    ...(draft.outputSchemaChanged ? { output_schema: draft.outputSchema.schema } : {}),
    // An untouched binding carries forward (omitted); a removed one sends `null`.
    ...(draft.stateBindingChanged ? { state_binding: draft.stateBinding } : {}),
  };
}
