/**
 * The SAVE-NEW-VERSION dialog. Pre-fills every field from the preset's ACTIVE body
 * and sends ONLY the fields the user changed (an untouched field is omitted so the
 * route carries the active value forward; a cleared extensions list is an explicit
 * `[]`, a cleared output schema / removed binding an explicit `null`). Submit is
 * disabled until at least one field is dirty. The seed/dirty/mutation logic lives in
 * {@link useSaveVersionDraft}; this composes the fields.
 *
 * The active binding is not on the RECORD; it rides the current version body, so the
 * dialog reads the version list and prefills from the `is_current` row. A failed
 * version read withholds the binding editor behind a loud error rather than showing it
 * empty (which would read as "no binding").
 */
import type { PresetDetail } from '@tai42/api-client';
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  Field,
  SchemaEditor,
  Spinner,
  StateBindingSection,
  Textarea,
  TextInput,
} from '@tai42/studio-sdk';
import type { ReactNode, SyntheticEvent } from 'react';

import { ExtensionsField } from './ExtensionsField';
import { useSaveVersionDraft } from './useSaveVersionDraft';
import { useStateBindingSources } from './useStateBindingSources';
import { ValidateVerdict } from './verdict';

export function SaveVersionDialog({
  detail,
  onClose,
}: {
  readonly detail: PresetDetail;
  readonly onClose: () => void;
}): ReactNode {
  const draft = useSaveVersionDraft(detail, onClose);
  const binding = useStateBindingSources(detail.base_tool, draft.outputSchema.schema);
  const { save, validate, versionsQuery, bindingSeeded, dirty, descriptionInvalid, canValidate } =
    draft;

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    draft.submit();
  };

  return (
    <Dialog
      title={`Save version — ${detail.name}`}
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
          error={draft.kwargsError}
        >
          <Textarea
            value={draft.kwargsText}
            onChange={(event) => {
              draft.setKwargsText(event.target.value);
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
            value={draft.description}
            onChange={(event) => {
              draft.setDescription(event.target.value);
            }}
            aria-required
          />
        </Field>

        <ExtensionsField
          value={draft.combos}
          onChange={draft.setCombos}
          onValidityChange={draft.setExtensionsValid}
        />

        <SchemaEditor
          value={draft.outputSchema.schema}
          onChange={draft.setOutputSchema}
          requireTitle={false}
          label="Output schema"
          description="The JSON Schema enforced on this tool's structured output. Clear it to drop the schema; leave it to carry the current one forward."
          idPrefix="save-version-output-schema"
        />

        {/* The active binding rides the current version body; a failed version read
            leaves it unseedable, so the editor is withheld behind a loud error with
            retry rather than shown empty. The section mounts only once seeded, so its
            disclosure opens correctly when the active binding is non-empty. */}
        {versionsQuery.isError ? (
          <ErrorState
            message={errorMessage(versionsQuery.error)}
            onRetry={() => void versionsQuery.refetch()}
          />
        ) : bindingSeeded ? (
          <StateBindingSection
            value={draft.stateBinding}
            onChange={draft.setStateBinding}
            {...binding}
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
          <Button
            type="button"
            onClick={draft.runValidate}
            disabled={!canValidate || validate.isPending}
          >
            {validate.isPending ? <Spinner label="Validating draft" /> : null}
            Validate
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={
              save.isPending ||
              !dirty ||
              !draft.outputSchema.valid ||
              !draft.extensionsValid ||
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
