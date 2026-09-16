/**
 * The create-key dialog: collects user_id, description, scopes and policy
 * fields, mints a new key, and hands the raw `sk-…` string back to the caller
 * exactly once before clearing the form and mutation state.
 */
import type { ApiClient, PrincipalRef } from '@tai42/api-client';
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  isFullProjection,
  Spinner,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { principalLabel } from './api-keys-gating';
import {
  conditionWarningStyle,
  dialogActionsStyle,
  fieldLabelStyle,
  formStyle,
  ownerLineStyle,
} from './api-keys-styles';
import { KeyFormFields } from './KeyFormFields';
import { tokensPayloadKey } from './keys';
import type { PolicyFields } from './policy-data';
import { PolicySection } from './PolicySection';
import { PrincipalPicker } from './PrincipalPicker';

export function CreateKeyDialog({
  open,
  onOpenChange,
  scopeIds,
  onMinted,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly scopeIds: readonly string[];
  readonly onMinted: (apiKey: string, principal: PrincipalRef | null) => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const { state: capabilityState } = useCapabilities();
  const projection = capabilityState.status === 'ready' ? capabilityState.projection : null;
  const isAdmin = projection !== null && isFullProjection(projection);
  const [userId, setUserId] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [policyFields, setPolicyFields] = useState<PolicyFields>({});
  const [conditionTestFailed, setConditionTestFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The principal that will own the minted key: the caller's own principal by
  // default (self-ownership), swapped by the admin picker to a service principal.
  const [owner, setOwner] = useState<PrincipalRef | null>(projection?.principal ?? null);
  // Remount the policy section (resetting its internal editors) on each open.
  const [policyNonce, setPolicyNonce] = useState(0);

  const clearForm = (): void => {
    setUserId('');
    setDescription('');
    setSelected(new Set());
    setPolicyFields({});
    setConditionTestFailed(false);
    setFormError(null);
    setOwner(projection?.principal ?? null);
    setPolicyNonce((n) => n + 1);
  };

  const mutation = useMutation({
    mutationFn: (body: Parameters<ApiClient['createApiKey']>[0]) => api.createApiKey(body),
    onSuccess: (apiKey) => {
      void queryClient.invalidateQueries({ queryKey: tokensPayloadKey });
      onMinted(apiKey, owner);
      // Clear the form AND the mutation so the minted `sk-…` key never lingers in
      // `mutation.data` past this dialog's lifetime and the next open starts blank.
      clearForm();
      mutation.reset();
      onOpenChange(false);
    },
  });

  const reset = (): void => {
    clearForm();
    mutation.reset();
  };

  const submit = (): void => {
    setFormError(null);
    if (userId.trim().length === 0) {
      setFormError('User ID is required.');
      return;
    }
    // An admin names the owning principal (self by default); a non-admin sends none
    // and the server forces self-ownership. A cleared admin picker blocks the mint.
    if (isAdmin && owner === null) {
      setFormError('Choose the principal that owns this key.');
      return;
    }
    // A failed condition Test does NOT block save — the server re-validates at
    // enforcement; a non-blocking warning next to Save is the only signal.
    mutation.mutate({
      user_id: userId,
      description,
      scopes: [...selected],
      ...(isAdmin && owner !== null ? { owner_user_id: owner.user_id } : {}),
      ...policyFields,
    });
  };

  return (
    <Dialog
      title="Create API key"
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <div style={formStyle}>
        <div>
          <span style={fieldLabelStyle}>Principal</span>
          {isAdmin ? (
            <PrincipalPicker
              selfPrincipal={projection.principal ?? null}
              value={owner}
              onChange={setOwner}
            />
          ) : (
            <p style={ownerLineStyle}>
              Owned by{' '}
              {projection !== null
                ? (principalLabel(projection) ?? 'your account')
                : 'your account'}
            </p>
          )}
        </div>
        <KeyFormFields
          idPrefix="create-key"
          userId={userId}
          onUserIdChange={setUserId}
          description={description}
          onDescriptionChange={setDescription}
          scopeIds={scopeIds}
          selected={selected}
          onSelectedChange={setSelected}
        />
        <PolicySection
          key={policyNonce}
          idPrefix="create-key"
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
        <Button
          type="button"
          onClick={() => {
            reset();
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner label="Creating" /> : null}
          Create
        </Button>
      </div>
    </Dialog>
  );
}
