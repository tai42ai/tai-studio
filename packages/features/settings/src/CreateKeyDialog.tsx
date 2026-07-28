/**
 * The create-key dialog: collects user_id, description, scopes and policy
 * fields, mints a new key, and hands the raw `sk-…` string back to the caller
 * exactly once before clearing the form and mutation state.
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
import { PolicySection, type PolicyFields } from './PolicySection';
import { ScopePicker } from './ScopePicker';
import {
  conditionWarningStyle,
  dialogActionsStyle,
  fieldLabelStyle,
  formStyle,
} from './api-keys-common';

export function CreateKeyDialog({
  open,
  onOpenChange,
  scopeIds,
  onMinted,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly scopeIds: readonly string[];
  readonly onMinted: (apiKey: string) => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [policyFields, setPolicyFields] = useState<PolicyFields>({});
  const [conditionTestFailed, setConditionTestFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Remount the policy section (resetting its internal editors) on each open.
  const [policyNonce, setPolicyNonce] = useState(0);

  const clearForm = (): void => {
    setUserId('');
    setDescription('');
    setSelected(new Set());
    setPolicyFields({});
    setConditionTestFailed(false);
    setFormError(null);
    setPolicyNonce((n) => n + 1);
  };

  const mutation = useMutation({
    mutationFn: (body: Parameters<ApiClient['createApiKey']>[0]) => api.createApiKey(body),
    onSuccess: (apiKey) => {
      void queryClient.invalidateQueries({ queryKey: tokensPayloadKey });
      onMinted(apiKey);
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
    // A failed condition Test does NOT block save — the server re-validates at
    // enforcement; a non-blocking warning next to Save is the only signal.
    mutation.mutate({
      user_id: userId,
      description,
      scopes: [...selected],
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
          <label style={fieldLabelStyle} htmlFor="create-key-user">
            User ID
          </label>
          <TextInput
            id="create-key-user"
            aria-label="User ID"
            value={userId}
            autoComplete="off"
            onChange={(event) => {
              setUserId(event.target.value);
            }}
          />
        </div>
        <div>
          <label style={fieldLabelStyle} htmlFor="create-key-desc">
            Description
          </label>
          <TextInput
            id="create-key-desc"
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
