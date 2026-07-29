/**
 * The edit-key dialog: changes an existing key's description, scopes and policy
 * fields. The user_id is fixed and shown read-only.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  ErrorState,
  Spinner,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { ApiClient } from '@tai42/api-client';

import { tokensPayloadKey } from './keys';
import { PolicySection, type PolicyFields, type PolicySeed } from './PolicySection';
import { ScopePicker } from './ScopePicker';
import {
  conditionWarningStyle,
  dialogActionsStyle,
  fieldLabelStyle,
  formStyle,
  type KeyPayload,
} from './api-keys-common';

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
    condition_id: payload.condition_id ?? null,
    condition_kwargs: payload.condition_kwargs,
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
        <div>
          <label style={fieldLabelStyle} htmlFor="edit-key-user">
            User ID
          </label>
          <TextInput id="edit-key-user" aria-label="User ID" value={payload.user_id} disabled />
        </div>
        <div>
          <label style={fieldLabelStyle} htmlFor="edit-key-desc">
            Description
          </label>
          <TextInput
            id="edit-key-desc"
            aria-label="Description"
            value={description}
            autoComplete="off"
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </div>
        <div>
          <span style={fieldLabelStyle}>Scopes</span>
          <ScopePicker
            scopeIds={scopeIds}
            selected={selected}
            disabled={false}
            onToggle={(scopeId, next) => {
              setSelected((current) => {
                const updated = new Set(current);
                if (next) updated.add(scopeId);
                else updated.delete(scopeId);
                return updated;
              });
            }}
          />
        </div>
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
