/**
 * The create-role dialog: collects a name, an optional description, and the
 * read-only base-tier ceiling the role inherits (`editor`/`viewer` — `admin` is
 * reserved and never offered). The role is created with an EMPTY grant map (every
 * feature group at `none`, fail-closed); its per-tag levels are edited afterwards in
 * the grant editor. The base-tier jq is resolved server-side — there is no raw-jq
 * authoring surface here.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  ErrorState,
  Field,
  Select,
  Spinner,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { rolesKey } from './keys';

/** The base tiers a new role may inherit (`admin`/`allow_all` is reserved). */
const BASE_TIERS = [
  { value: 'editor', label: 'editor — read + write on granted feature groups' },
  { value: 'viewer', label: 'viewer — read-only ceiling' },
] as const;

const formStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'var(--tai-space-3)',
};

const actionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 'var(--tai-space-2)',
  marginTop: 'var(--tai-space-4)',
};

export function CreateRoleDialog({
  onCreated,
  onClose,
}: {
  readonly onCreated: (name: string) => void;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseTier, setBaseTier] = useState<string>('editor');
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: { name: string; description: string; base_tier: string }) =>
      api.createRole(body),
    onSuccess: (role) => {
      void queryClient.invalidateQueries({ queryKey: rolesKey });
      onCreated(role.name);
    },
  });

  const submit = (): void => {
    setFormError(null);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setFormError('A role name is required.');
      return;
    }
    create.mutate({ name: trimmed, description: description.trim(), base_tier: baseTier });
  };

  return (
    <Dialog
      title="Create role"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={formStyle}>
        <Field label="Name">
          <TextInput
            aria-label="Role name"
            value={name}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              if (formError !== null) setFormError(null);
            }}
          />
        </Field>
        <Field label="Description">
          <TextInput
            aria-label="Role description"
            value={description}
            autoComplete="off"
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </Field>
        <Field label="Base tier">
          <Select
            aria-label="Base tier"
            options={BASE_TIERS.map((tier) => ({ value: tier.value, label: tier.label }))}
            value={baseTier}
            onValueChange={setBaseTier}
          />
        </Field>
        {formError !== null ? (
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-danger)' }}>
            {formError}
          </p>
        ) : null}
        {create.isError ? <ErrorState message={errorMessage(create.error)} /> : null}
      </div>
      <div style={actionsStyle}>
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={create.isPending} onClick={submit}>
          {create.isPending ? <Spinner label="Creating" /> : null}
          Create
        </Button>
      </div>
    </Dialog>
  );
}
