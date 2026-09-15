/**
 * The create-preset mutations and their submit orchestration: the create (with its
 * post-create overlay-tag write) and the dry-run validate, the "clear the verdict on
 * any edit" reset, the shared body build (with the loud kwargs parse), and the
 * versioning-off derivation. Both writes hit the same versioning store, so once
 * either reveals it off the other is certain to refuse too.
 */
import type { CreatePresetBody, PresetExtensionElement, StateBinding } from '@tai42/api-client';
import {
  isFeatureDisabled,
  type SchemaEditorChange,
  toolsListKey,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { presetsListKey } from './keys';
import { parseJsonObject } from './parse';
import { buildCreatePresetBody } from './preset-body';

/** The editable create-form values the submit/validate bodies are built from. */
export interface CreateDraft {
  readonly name: string;
  readonly description: string;
  readonly base: string | null;
  readonly combos: PresetExtensionElement[][];
  readonly kwargsText: string;
  readonly outputSchema: SchemaEditorChange;
  readonly stateBinding: StateBinding | null;
  readonly extensionsValid: boolean;
}

/** The create/validate mutations plus the submit handlers and versioning-off state. */
export type PresetMutations = ReturnType<typeof usePresetMutations>;

/**
 * Build the create body, or `null` when `fixed_kwargs` does not parse (the parser
 * message is surfaced on the field via `setKwargsError`). Shared by submit + validate.
 */
function buildDraftBody(
  draft: CreateDraft,
  parsed: ReturnType<typeof parseJsonObject>,
  setKwargsError: (message: string | undefined) => void,
): CreatePresetBody | null {
  if ('error' in parsed) {
    setKwargsError(parsed.error);
    return null;
  }
  setKwargsError(undefined);
  return buildCreatePresetBody({
    name: draft.name,
    base: draft.base,
    description: draft.description,
    fixedKwargs: parsed.value,
    combos: draft.combos,
    outputSchema: draft.outputSchema.schema,
    stateBinding: draft.stateBinding,
  });
}

/** The submit/validate gates: which required fields are missing, and whether a validate can run. */
function draftGates(draft: CreateDraft, parsed: ReturnType<typeof parseJsonObject>) {
  const nameMissing = draft.name.trim() === '';
  const baseMissing = draft.base === null || draft.base === '';
  const descriptionMissing = draft.description.trim() === '';
  // A parseable, structurally-valid draft (submit adds no dirtiness gate for a create).
  const canValidate =
    !nameMissing &&
    !baseMissing &&
    draft.outputSchema.valid &&
    draft.extensionsValid &&
    !('error' in parsed);
  return { nameMissing, baseMissing, descriptionMissing, canValidate };
}

export function usePresetMutations({
  draft,
  tags,
  onClose,
  setKwargsError,
}: {
  readonly draft: CreateDraft;
  readonly tags: string[];
  readonly onClose: () => void;
  readonly setKwargsError: (message: string | undefined) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useAppNavigate();

  const create = useMutation({
    mutationFn: async (body: CreatePresetBody) => {
      const record = await api.createPreset(body);
      // Overlay categorization tags are NOT a create-body field — they live in the
      // tool_meta overlay, writable only once the preset's live tool exists. Sequenced
      // after the create so a failed tag write surfaces loudly through the create error
      // state; skipped when the author entered none (an empty merge-patch is rejected).
      // A store-off refusal (501 `tool-meta-not-configured`) is the ONE exception: the
      // preset was created and OFF is a state, not an error.
      if (tags.length > 0) {
        try {
          await api.upsertToolMeta(record.name, { tags });
        } catch (err) {
          if (!isFeatureDisabled(err)) throw err;
        }
      }
      return record;
    },
    onSuccess: (record) => {
      void queryClient.invalidateQueries({ queryKey: presetsListKey });
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
      onClose();
      navigate('presets', { preset: record.name });
    },
  });

  // The dry-run validate door: the SAME pre-store verdict create would run, without a
  // write. Its result is cleared on any further edit (a stale verdict lies).
  const validate = useMutation({
    mutationFn: (body: CreatePresetBody) => api.validatePreset(body),
  });
  const resetValidate = validate.reset;

  const parsed = parseJsonObject(draft.kwargsText);
  const { nameMissing, baseMissing, descriptionMissing, canValidate } = draftGates(draft, parsed);

  // Tags are NOT in the signature: they do not ride the create/validate body (they
  // land in the overlay post-create), so editing them must not clear a verdict.
  const draftSignature = JSON.stringify({
    name: draft.name,
    description: draft.description,
    base: draft.base,
    combos: draft.combos,
    kwargsText: draft.kwargsText,
    outputSchema: draft.outputSchema.schema,
    stateBinding: draft.stateBinding,
  });
  useEffect(() => {
    resetValidate();
  }, [draftSignature, resetValidate]);

  const submit = (): void => {
    // Name, base, AND description each gate the create (an empty description 422s).
    if (nameMissing || baseMissing || descriptionMissing) return;
    if (!draft.outputSchema.valid || !draft.extensionsValid) return;
    const body = buildDraftBody(draft, parsed, setKwargsError);
    if (body !== null) create.mutate(body);
  };

  const runValidate = (): void => {
    const body = buildDraftBody(draft, parsed, setKwargsError);
    if (body !== null) validate.mutate(body);
  };

  // Create and validate both write to the versioning store: once either reveals it off
  // (501 `versioning-not-configured`) the other is certain to refuse too.
  const versioningRefusal = [create.error, validate.error].find(isFeatureDisabled);
  const versioningDisabled = versioningRefusal !== undefined;

  return {
    create,
    validate,
    canValidate,
    submit,
    runValidate,
    versioningDisabled,
    versioningRefusal,
  };
}
