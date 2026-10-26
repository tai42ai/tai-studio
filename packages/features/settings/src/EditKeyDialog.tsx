/**
 * The edit-key dialog: changes an existing key's description, scopes (or Full
 * access) and policy fields, refusing before sending what the server would refuse.
 * The user_id is fixed and shown read-only. A key holding the universal scope opens
 * with Full access chosen. Scopes are sent only when the choice differs from the one
 * the dialog opened with, so an edit that leaves them untouched keeps the stored set
 * (the server checks sent scopes against the caller's own).
 */
import type { ApiClient } from '@tai42/api-client';
import { Button, Dialog, errorMessage, ErrorState, Spinner, useApi } from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { FULL_ACCESS_SCOPE } from './api-keys-gating';
import { conditionWarningStyle, dialogActionsStyle, formStyle } from './api-keys-styles';
import { keyFormError, keyScopes } from './key-form-rules';
import type { KeyPayload } from './key-owner';
import { KeyFormFields } from './KeyFormFields';
import { tokensPayloadKey } from './keys';
import type { PolicyFields, PolicySeed } from './policy-data';
import { PolicySection } from './PolicySection';

export function EditKeyDialog({
  payload,
  onClose,
  scopeIds,
  publicId,
  fullAccessAvailable,
}: {
  readonly payload: KeyPayload;
  readonly onClose: () => void;
  readonly scopeIds: readonly string[];
  /** Whether the caller may grant Full access (the universal scope). */
  readonly fullAccessAvailable: boolean;
  /** The deployment's served public marker — never one of the key's scopes. */
  readonly publicId: string;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(payload.description);
  const storedScopes = payload.scopes ?? [];
  const storedFullAccess = storedScopes.includes(FULL_ACCESS_SCOPE);
  const [fullAccess, setFullAccess] = useState(storedFullAccess);
  const [initialSelected] = useState<ReadonlySet<string>>(
    () => new Set(storedScopes.filter((s) => s !== publicId && s !== FULL_ACCESS_SCOPE)),
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const fullAccessOffered = fullAccessAvailable || storedFullAccess;
  const [policyFields, setPolicyFields] = useState<PolicyFields>({});
  const [conditionTestFailed, setConditionTestFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const seed: PolicySeed = {
    policy_data: payload.policy_data,
    condition: payload.condition ?? null,
  };

  const mutation = useMutation({
    mutationFn: (body: Parameters<ApiClient['editApiKey']>[1]) =>
      api.editApiKey(payload.user_id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tokensPayloadKey });
      onClose();
    },
  });

  const submit = (): void => {
    // A failed condition Test does NOT block save — the server re-validates at
    // enforcement; a non-blocking warning next to Save is the only signal.
    setFormError(null);
    const scopes = keyScopes(fullAccess, selected);
    // An omitted condition keeps the stored one; an explicit `null` removes it.
    const condition =
      policyFields.condition === undefined ? seed.condition : policyFields.condition;
    const refusal = keyFormError({ description, scopes, condition, fullAccessOffered });
    if (refusal !== null) {
      setFormError(refusal);
      return;
    }
    const scopesTouched =
      fullAccess !== storedFullAccess || (!fullAccess && !sameScopes(selected, initialSelected));
    mutation.mutate({ description, ...(scopesTouched ? { scopes } : {}), ...policyFields });
  };

  return (
    <Dialog
      title="Edit API key"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={formStyle}>
        <KeyFormFields
          userId={payload.user_id}
          description={description}
          onDescriptionChange={setDescription}
          scopeIds={scopeIds}
          selected={selected}
          onSelectedChange={setSelected}
          fullAccess={fullAccess}
          // A key that already holds Full access always shows it, so it can be read and kept.
          fullAccessAvailable={fullAccessOffered}
          onFullAccessChange={setFullAccess}
        />
        <PolicySection
          idPrefix="edit-key"
          seed={seed}
          onChange={setPolicyFields}
          onConditionTestFailedChange={setConditionTestFailed}
        />
        {formError !== null ? (
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
            {formError}
          </p>
        ) : null}
        {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
      </div>
      {conditionTestFailed ? (
        <p role="status" style={conditionWarningStyle}>
          The condition failed its last test. You can still save — the server re-validates the
          condition at enforcement.
        </p>
      ) : null}
      <div style={dialogActionsStyle}>
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner label="Saving" /> : null}
          Save
        </Button>
      </div>
    </Dialog>
  );
}

function sameScopes(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((scope) => b.has(scope));
}
