/**
 * The Environment tab (raw view — the escape hatch): editable key/value rows
 * over the deployment's environment map (`GET /api/config/env` →
 * `{ env, secret_keys }`). Rows can be added, edited, and removed (no blank or
 * duplicate keys); Save posts the assembled map through `setEnvConfig`.
 *
 * Secret marking: keys OWNED by a registered settings class show their
 * class-derived secret state READ-ONLY (no toggle — the owning class decides).
 * Keys owned by NO settings class get a per-row secret toggle that updates the
 * `TAI_ENV_SECRET_KEYS` marks; the marks ride out in the same Save as a
 * comma-joined value. Any row whose key is effectively secret renders MASKED
 * through `RevealInput` (reveal-on-click; display masking only, never logged).
 *
 * The `TAI_ENV_SECRET_KEYS` variable itself is managed through the toggles, not
 * as a raw row, so it is hidden from the row list to avoid a duplicate editor.
 *
 * State follows the shared convention: <Spinner> while loading, <ErrorState>
 * (loud) on any failure. Read-only config mode disables every control.
 */
import { summarizeFleetFanout } from '@tai42/api-client';
import {
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  FleetReport,
  Spinner,
  useApi,
  useRegisterDirty,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { type EnvVarRow, EnvVarRows, useEnvVarRows } from './env-var-rows';
import { envConfigKey, settingsSchemaKey } from './keys';
import { ownedSecretMap, SECRET_MARKS_ENV_VAR } from './settings-secrets';

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-4)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

const noticeStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-4)',
  padding: 'var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-border)',
  background: 'var(--tai-color-surface)',
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

const validationStyle: CSSProperties = {
  margin: 'var(--tai-space-3) 0 0',
  color: 'var(--tai-color-err-text)',
  fontSize: 'var(--tai-text-sm)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-3)',
  marginTop: 'var(--tai-space-4)',
};

/** The save-pending line: an inline spinner beside the honest upper-bound copy. */
const pendingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  margin: 0,
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

/**
 * The env map a Save posts. `POST /api/config/env` MERGES: an omitted key is
 * preserved and a key is deleted only when posted with value ''. So a key the
 * operator removed (loaded from the server env but no longer a row) is posted as
 * '' or the merge writes it straight back — a silent no-op on the Remove button. A
 * rename lands here too (old key deleted, new key a fresh row). The marks var is
 * managed via toggles, so it is excluded from the rows and set explicitly: it holds
 * ONLY keys still present as a row and NOT owned by a settings class (an owned key's
 * secret state is class-derived, never mirrored here).
 */
function assembleEnvSave(input: {
  readonly rows: readonly EnvVarRow[];
  readonly initialEnv: Record<string, string>;
  readonly secretKeys: ReadonlySet<string>;
  readonly isOwned: (key: string) => boolean;
}): Record<string, string> {
  const { rows, initialEnv, secretKeys, isOwned } = input;
  const env: Record<string, string> = {};
  for (const row of rows) env[row.key] = row.value;
  const presentKeys = new Set(rows.map((row) => row.key));
  for (const key of Object.keys(initialEnv)) {
    if (key !== SECRET_MARKS_ENV_VAR && !presentKeys.has(key)) env[key] = '';
  }
  const marks = [...secretKeys].filter((key) => presentKeys.has(key) && !isOwned(key)).sort();
  env[SECRET_MARKS_ENV_VAR] = marks.join(',');
  return env;
}

/** The Save button and its fleet-reload pending line — hidden in read-only mode. */
function EnvSaveFooter({
  readOnly,
  disabled,
  pending,
  onSave,
}: {
  readonly readOnly: boolean;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSave: () => void;
}): ReactNode {
  if (readOnly) return null;
  return (
    <div style={footerStyle}>
      <Button type="button" variant="primary" disabled={disabled} onClick={onSave}>
        Save
      </Button>
      {pending ? (
        <span role="status" style={pendingStyle}>
          <Spinner label="Applying" />
          Applying settings across the fleet - this can take up to 30 seconds.
        </span>
      ) : null}
    </div>
  );
}

interface EditorProps {
  readonly initialEnv: Record<string, string>;
  readonly initialSecretKeys: readonly string[];
  readonly ownedSecret: Map<string, boolean>;
  readonly readOnly: boolean;
}

function EnvironmentEditor({
  initialEnv,
  initialSecretKeys,
  ownedSecret,
  readOnly,
}: EditorProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const editor = useEnvVarRows({ env: initialEnv, secretKeys: initialSecretKeys });

  // The server state the rows were seeded from. When it MOVES — this editor's own
  // save, or a background refetch — the rows are re-seeded DURING RENDER (React's
  // adjust-state-on-prop-change pattern) so a stale edit can never clobber newer
  // server state. Not by remounting on a `key`: this editor is what writes the env,
  // so a remount keyed on it tears the editor down the instant its own Save lands,
  // dropping the keyboard caret from the Save button onto `document.body`
  // (WCAG 2.4.3) and deleting the fleet report the save just produced.
  const baseline = JSON.stringify({ env: initialEnv, secret_keys: initialSecretKeys });
  const [seededFrom, setSeededFrom] = useState(baseline);
  if (seededFrom !== baseline) {
    setSeededFrom(baseline);
    editor.reseed({ env: initialEnv, secretKeys: initialSecretKeys });
  }

  const mutation = useMutation({
    mutationFn: (env: Record<string, string>) => api.setEnvConfig(env),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: envConfigKey });
    },
  });

  const isValid = !editor.hasBlankKey && !editor.hasDuplicateKey;

  // Report to the enclosing tab guard whenever the editable state has diverged from
  // the server baseline, so a tab switch / navigation / unload confirms before the
  // fleet-reloading env is dropped unsaved. A read-only editor is never dirty.
  const currentSignature = JSON.stringify({
    rows: editor.rows.map((row) => [row.key, row.value]),
    secrets: [...editor.secretKeys].sort(),
  });
  const initialSignature = JSON.stringify({
    rows: Object.entries(initialEnv).filter(([key]) => key !== SECRET_MARKS_ENV_VAR),
    secrets: [...initialSecretKeys].sort(),
  });
  useRegisterDirty(!readOnly && currentSignature !== initialSignature);

  const isOwned = (key: string): boolean => ownedSecret.has(key);
  const isSecret = (key: string): boolean =>
    isOwned(key) ? (ownedSecret.get(key) ?? false) : editor.secretKeys.has(key);

  const onSave = (): void => {
    mutation.mutate(
      assembleEnvSave({
        rows: editor.rows,
        initialEnv,
        secretKeys: editor.secretKeys,
        isOwned,
      }),
    );
  };

  return (
    <Card>
      <div style={headerStyle}>
        <h3 style={headingStyle}>Environment variables</h3>
        {readOnly ? null : (
          <Button type="button" onClick={editor.addRow}>
            Add variable
          </Button>
        )}
      </div>

      {readOnly ? (
        <p role="note" style={noticeStyle}>
          Configuration is read-only for this deployment. Environment variables cannot be edited
          here.
        </p>
      ) : null}

      {editor.rows.length === 0 ? (
        <EmptyState
          title="No environment variables"
          description={
            readOnly
              ? 'This deployment exposes no configured environment variables.'
              : 'Add a variable to configure this deployment.'
          }
        />
      ) : (
        <EnvVarRows
          rows={editor.rows}
          readOnly={readOnly}
          secretIdPrefix="env-secret"
          isSecret={isSecret}
          isOwned={isOwned}
          onKeyChange={editor.setKey}
          onValueChange={editor.setValue}
          onRemove={editor.removeRow}
          onToggleSecret={editor.toggleSecret}
        />
      )}

      {!readOnly && editor.rows.length > 0 && !isValid ? (
        <p role="alert" style={validationStyle}>
          Variable names must be unique and non-empty.
        </p>
      ) : null}

      {mutation.isError ? (
        <div style={{ marginTop: 'var(--tai-space-4)' }}>
          <ErrorState message={errorMessage(mutation.error)} />
        </div>
      ) : null}

      {/* A saved env broadcasts a reload to the fleet; surface any failed propagation
          honestly (nothing on a converged / lone-worker save). */}
      {mutation.isSuccess ? (
        <div style={{ marginTop: 'var(--tai-space-4)' }}>
          <FleetReport summary={summarizeFleetFanout(mutation.data.fanout)} />
        </div>
      ) : null}

      <EnvSaveFooter
        readOnly={readOnly}
        disabled={!isValid || mutation.isPending}
        pending={mutation.isPending}
        onSave={onSave}
      />
    </Card>
  );
}

export interface EnvironmentTabProps {
  readonly readOnly: boolean;
}

export function EnvironmentTab({ readOnly }: EnvironmentTabProps): ReactNode {
  const api = useApi();

  const envQuery = useQuery({
    queryKey: envConfigKey,
    queryFn: ({ signal }) => api.getEnvConfig(signal),
  });
  const schemaQuery = useQuery({
    queryKey: settingsSchemaKey,
    queryFn: ({ signal }) => api.getSettingsSchema(signal),
  });

  if (envQuery.isError || schemaQuery.isError) {
    const error = envQuery.error ?? schemaQuery.error;
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => {
          void envQuery.refetch();
          void schemaQuery.refetch();
        }}
      />
    );
  }
  if (envQuery.isPending || schemaQuery.isPending) {
    return <Spinner label="Loading environment" />;
  }

  const { env, secret_keys } = envQuery.data;
  const ownedSecret = ownedSecretMap(schemaQuery.data);

  return (
    <EnvironmentEditor
      initialEnv={env}
      initialSecretKeys={secret_keys}
      ownedSecret={ownedSecret}
      readOnly={readOnly}
    />
  );
}
