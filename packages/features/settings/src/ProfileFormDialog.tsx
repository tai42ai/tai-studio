/**
 * The profile create/edit dialog: a real form (Enter-to-submit) over the profile's
 * name (create only — the identity is immutable), description, and its env map as
 * masked key/value rows (reveal-on-click for secret cells, a per-row secret toggle
 * for unowned keys). Submitting PUTs the whole document (a full replace).
 *
 * `useRegisterDirty` reports a diverging draft so a tab switch confirms before the
 * unsaved profile is dropped.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  FormDialog,
  Skeleton,
  TextInput,
  errorMessage,
  useApi,
  useRegisterDirty,
} from '@tai42/studio-sdk';

import { settingsProfileKey, settingsProfileVersionsKey, settingsProfilesKey } from './keys';
import { SECRET_MARKS_ENV_VAR } from './settings-secrets';
import { EnvVarRows, useEnvVarRows, type EnvVarRowsState } from './env-var-rows';
import { isSecretKey, type ProfileBody } from './profile-secrets';

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
  marginBottom: 'var(--tai-space-3)',
};

const labelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-4)',
};

const validationStyle: CSSProperties = {
  margin: 'var(--tai-space-3) 0 0',
  color: 'var(--tai-color-err-text)',
  fontSize: 'var(--tai-text-sm)',
};

/** The profile form fields: name (create only), description, and the env-var rows. */
function ProfileFormFields({
  editing,
  draftName,
  onDraftNameChange,
  description,
  onDescriptionChange,
  editor,
  isSecret,
  isOwned,
}: {
  readonly editing: boolean;
  readonly draftName: string;
  readonly onDraftNameChange: (value: string) => void;
  readonly description: string;
  readonly onDescriptionChange: (value: string) => void;
  readonly editor: EnvVarRowsState;
  readonly isSecret: (key: string) => boolean;
  readonly isOwned: (key: string) => boolean;
}): ReactNode {
  return (
    <div className="tai-stack">
      {editing ? null : (
        <div style={fieldStyle}>
          <span style={labelStyle}>Profile name</span>
          <TextInput
            aria-label="Profile name"
            value={draftName}
            placeholder="prod"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              onDraftNameChange(event.target.value);
            }}
          />
          {draftName.startsWith('@') ? (
            <span style={validationStyle}>
              Names starting with “@” are reserved and cannot be used.
            </span>
          ) : null}
        </div>
      )}

      <div style={fieldStyle}>
        <span style={labelStyle}>Description</span>
        <TextInput
          aria-label="Profile description"
          value={description}
          placeholder="What this profile configures"
          autoComplete="off"
          onChange={(event) => {
            onDescriptionChange(event.target.value);
          }}
        />
      </div>

      <div style={cardHeaderStyle}>
        <span style={labelStyle}>Environment variables</span>
        <Button type="button" onClick={editor.addRow}>
          Add variable
        </Button>
      </div>

      {editor.rows.length === 0 ? (
        <EmptyState
          title="No environment variables"
          description="Add a variable to configure this profile."
        />
      ) : (
        <EnvVarRows
          rows={editor.rows}
          readOnly={false}
          secretIdPrefix="profile-secret"
          isSecret={isSecret}
          isOwned={isOwned}
          onKeyChange={editor.setKey}
          onValueChange={editor.setValue}
          onRemove={editor.removeRow}
          onToggleSecret={editor.toggleSecret}
        />
      )}

      {editor.rows.length > 0 && (editor.hasBlankKey || editor.hasDuplicateKey) ? (
        <p role="alert" style={validationStyle}>
          Variable names must be unique and non-empty.
        </p>
      ) : null}
    </div>
  );
}

function ProfileFormBody({
  name,
  initial,
  ownedSecret,
  onSubmitted,
  onClose,
}: {
  readonly name: string | null;
  readonly initial: ProfileBody;
  readonly ownedSecret: ReadonlyMap<string, boolean>;
  readonly onSubmitted: (name: string) => void;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const editing = name !== null;

  const editor = useEnvVarRows({ env: initial.env, secretKeys: initial.secret_keys });
  const [draftName, setDraftName] = useState(name ?? '');
  const [description, setDescription] = useState(initial.description);

  // A reserved `@`-prefixed name is invalid for a user profile.
  const nameValid = editing || (draftName.trim().length > 0 && !draftName.startsWith('@'));
  const isValid = nameValid && !editor.hasBlankKey && !editor.hasDuplicateKey;

  const currentSignature = JSON.stringify({
    name: draftName,
    description,
    rows: editor.rows.map((row) => [row.key, row.value]),
    secrets: [...editor.secretKeys].sort(),
  });
  const initialSignature = JSON.stringify({
    name: name ?? '',
    description: initial.description,
    rows: Object.entries(initial.env).filter(([key]) => key !== SECRET_MARKS_ENV_VAR),
    secrets: [...initial.secret_keys].sort(),
  });
  useRegisterDirty(currentSignature !== initialSignature);

  const isOwned = (key: string): boolean => ownedSecret.has(key);
  const isSecret = (key: string): boolean => isSecretKey(key, editor.secretKeys, ownedSecret);

  const submit = async (): Promise<void> => {
    const target = editing ? name : draftName.trim();
    const env: Record<string, string> = {};
    for (const row of editor.rows) env[row.key] = row.value;
    const presentKeys = new Set(editor.rows.map((row) => row.key));
    // The stored secret_keys are the present, unowned marks (an owned key's secret
    // state is class-derived, never mirrored into the profile band).
    const marks = [...editor.secretKeys]
      .filter((key) => presentKeys.has(key) && !isOwned(key))
      .sort();
    await api.putSettingsProfile(target, { description, env, secret_keys: marks });
    onSubmitted(target);
  };

  return (
    <FormDialog
      title={editing ? `Edit profile — ${name}` : 'Create profile'}
      submitLabel={editing ? 'Save profile' : 'Create profile'}
      pendingLabel={editing ? 'Saving' : 'Creating'}
      submitDisabled={!isValid}
      onSubmit={submit}
      onClose={onClose}
    >
      <ProfileFormFields
        editing={editing}
        draftName={draftName}
        onDraftNameChange={setDraftName}
        description={description}
        onDescriptionChange={setDescription}
        editor={editor}
        isSecret={isSecret}
        isOwned={isOwned}
      />
    </FormDialog>
  );
}

export function ProfileFormDialog({
  name,
  ownedSecret,
  onClose,
}: {
  /** The profile being edited, or `null` to create a new one. */
  readonly name: string | null;
  readonly ownedSecret: ReadonlyMap<string, boolean>;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const editing = name !== null;

  const bodyQuery = useQuery({
    queryKey: settingsProfileKey(name ?? ''),
    queryFn: ({ signal }) => api.getSettingsProfile(name ?? '', signal),
    enabled: editing,
  });

  if (editing && bodyQuery.isPending) {
    return (
      <Dialog
        title={`Edit profile — ${name}`}
        open
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <Skeleton height={120} />
      </Dialog>
    );
  }
  if (editing && bodyQuery.isError) {
    return (
      <Dialog
        title={`Edit profile — ${name}`}
        open
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <ErrorState
          message={errorMessage(bodyQuery.error)}
          onRetry={() => void bodyQuery.refetch()}
        />
        <div className="tai-dialog-actions">
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </Dialog>
    );
  }

  const initial: ProfileBody =
    editing && bodyQuery.data !== undefined
      ? bodyQuery.data
      : { description: '', env: {}, secret_keys: [] };

  return (
    <ProfileFormBody
      name={name}
      initial={initial}
      ownedSecret={ownedSecret}
      onSubmitted={(savedName) => {
        void queryClient.invalidateQueries({ queryKey: settingsProfilesKey });
        void queryClient.invalidateQueries({ queryKey: settingsProfileKey(savedName) });
        void queryClient.invalidateQueries({ queryKey: settingsProfileVersionsKey(savedName) });
        onClose();
      }}
      onClose={onClose}
    />
  );
}
