/**
 * The edit-key dialog: changes an existing key's description, scopes and policy
 * fields. The user_id is fixed and shown read-only.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, ErrorState, Spinner, errorMessage, useApi } from '@tai42/studio-sdk';
import type { ApiClient } from '@tai42/api-client';

import { tokensPayloadKey } from './keys';
import { PolicySection } from './PolicySection';
import type { PolicyFields, PolicySeed } from './policy-data';
import { KeyFormFields } from './KeyFormFields';
import { conditionWarningStyle, dialogActionsStyle, formStyle } from './api-keys-styles';
import type { KeyPayload } from './key-owner';

export function EditKeyDialog({
  payload,
  onClose,
  scopeIds,
}: {
  readonly payload: KeyPayload;
  readonly onClose: () => void;
  readonly scopeIds: readonly string[];
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(payload.description);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(payload.scopes.filter((s) => s !== 'public')),
  );
  const [policyFields, setPolicyFields] = useState<PolicyFields>({});
  const [conditionTestFailed, setConditionTestFailed] = useState(false);

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
    mutation.mutate({ description, scopes: [...selected], ...policyFields });
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
          idPrefix="edit-key"
          userId={payload.user_id}
          description={description}
          onDescriptionChange={setDescription}
          scopeIds={scopeIds}
          selected={selected}
          onSelectedChange={setSelected}
        />
        <PolicySection
          idPrefix="edit-key"
          seed={seed}
          onChange={setPolicyFields}
          onConditionTestFailedChange={setConditionTestFailed}
        />
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
