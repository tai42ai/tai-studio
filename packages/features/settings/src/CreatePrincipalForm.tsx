/**
 * The inline "create a service principal" sub-form the admin opens from the key
 * dialog's principal picker: a display name, a role from `listRoles`, and an optional
 * user id. On success the new principal is handed back so the picker selects it and
 * refreshes its list. Every failure surfaces inline — a duplicate id (409) and an
 * unknown role (400) get their own copy; anything else shows the server message.
 */
import { ApiError, type Principal } from '@tai42/api-client';
import {
  Button,
  errorMessage,
  ErrorState,
  Field,
  Select,
  Spinner,
  TextInput,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { fieldLabelStyle } from './api-keys-styles';
import { principalsKey, rolesKey } from './keys';

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
  padding: 'var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-control-border)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 'var(--tai-space-2)',
};

/** The inline copy for a rejected create: a duplicate id and an unknown role each
 *  get their own line; every other failure shows the server message verbatim. */
function createErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'A principal with that user ID already exists.';
    if (error.status === 400) return error.message;
  }
  return errorMessage(error);
}

export function CreatePrincipalForm({
  onCreated,
  onCancel,
}: {
  readonly onCreated: (principal: Principal) => void;
  readonly onCancel: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const rolesQuery = useQuery({
    queryKey: rolesKey,
    queryFn: ({ signal }) => api.listRoles(signal),
  });

  const create = useMutation({
    mutationFn: (body: { kind: 'service'; display_name: string; role: string; user_id?: string }) =>
      api.createPrincipal(body),
    onSuccess: (principal) => {
      void queryClient.invalidateQueries({ queryKey: principalsKey });
      onCreated(principal);
    },
  });

  const submit = (): void => {
    setFormError(null);
    const name = displayName.trim();
    if (name.length === 0) {
      setFormError('A display name is required.');
      return;
    }
    if (role.length === 0) {
      setFormError('Choose a role for the principal.');
      return;
    }
    const id = userId.trim();
    create.mutate({
      kind: 'service',
      display_name: name,
      role,
      ...(id.length > 0 ? { user_id: id } : {}),
    });
  };

  const roleOptions = (rolesQuery.data ?? []).map((r) => ({ value: r.name, label: r.name }));

  return (
    <form
      style={formStyle}
      aria-label="Create a service principal"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field label="Display name">
        <TextInput
          value={displayName}
          autoComplete="off"
          onChange={(event) => {
            setDisplayName(event.target.value);
            if (formError !== null) setFormError(null);
          }}
        />
      </Field>
      {rolesQuery.isError ? (
        <div>
          <span style={fieldLabelStyle}>Role</span>
          <ErrorState
            message={errorMessage(rolesQuery.error)}
            onRetry={() => void rolesQuery.refetch()}
          />
        </div>
      ) : (
        <Field label="Role">
          <Select
            options={roleOptions}
            value={role}
            disabled={rolesQuery.isPending}
            placeholder={rolesQuery.isPending ? 'Loading roles…' : 'Select a role'}
            onValueChange={(next) => {
              setRole(next);
              if (formError !== null) setFormError(null);
            }}
          />
        </Field>
      )}
      <Field label="User ID" description="Leave empty to generate one.">
        <TextInput
          aria-label="Principal User ID"
          value={userId}
          autoComplete="off"
          onChange={(event) => {
            setUserId(event.target.value);
          }}
        />
      </Field>
      {formError !== null ? (
        <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
          {formError}
        </p>
      ) : null}
      {create.isError ? <ErrorState message={createErrorMessage(create.error)} /> : null}
      <div style={actionsStyle}>
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? <Spinner label="Creating" /> : null}
          Create principal
        </Button>
      </div>
    </form>
  );
}
