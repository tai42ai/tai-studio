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
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  FleetReport,
  RevealInput,
  Spinner,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import { summarizeFleetFanout, type SettingsSchema } from '@tai42/api-client';

import { envConfigKey, settingsSchemaKey } from './keys';

/** The env var whose value is the comma-separated list of user-marked secret keys. */
const SECRET_MARKS_ENV_VAR = 'TAI_ENV_SECRET_KEYS';

/** One editable environment variable, with a stable id so React keys survive edits. */
interface Row {
  readonly id: string;
  readonly key: string;
  readonly value: string;
}

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

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-3)',
  flexWrap: 'wrap',
};

const keyInputStyle: CSSProperties = {
  flex: '1 1 30%',
  fontFamily: 'var(--tai-font-mono)',
};
const valueCellStyle: CSSProperties = {
  flex: '1 1 45%',
  fontFamily: 'var(--tai-font-mono)',
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
  color: 'var(--tai-color-danger)',
  fontSize: 'var(--tai-text-sm)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-3)',
  marginTop: 'var(--tai-space-4)',
};

function nameLabel(key: string, index: number): string {
  return key.length > 0 ? `Name of variable ${key}` : `Name of new variable ${String(index + 1)}`;
}
function valueLabel(key: string, index: number): string {
  return key.length > 0 ? `Value of variable ${key}` : `Value of new variable ${String(index + 1)}`;
}
function removeLabel(key: string, index: number): string {
  return key.length > 0 ? `Remove variable ${key}` : `Remove new variable ${String(index + 1)}`;
}

/** Map every env var owned by a settings class to its class-derived secret flag. */
function ownedSecretMap(schema: SettingsSchema): Map<string, boolean> {
  const owned = new Map<string, boolean>();
  for (const group of schema.groups) {
    for (const field of group.fields) {
      if (field.env_var !== '') owned.set(field.env_var, field.secret);
    }
  }
  return owned;
}

interface EditorProps {
  readonly initialEnv: Record<string, string>;
  readonly initialSecretKeys: readonly string[];
  readonly ownedSecret: Map<string, boolean>;
  readonly readOnly: boolean;
}

/**
 * The editable rows for a server env map. Each carries a row id independent of its
 * key, so renaming a variable does not re-identify (and so remount) its inputs; the
 * marks variable is managed through the per-row toggles and is never a raw row.
 */
function rowsFromEnv(env: Record<string, string>, nextId: () => number): Row[] {
  return Object.entries(env)
    .filter(([key]) => key !== SECRET_MARKS_ENV_VAR)
    .map(([key, value]) => ({ id: `env-row-${String(nextId())}`, key, value }));
}

function EnvironmentEditor({
  initialEnv,
  initialSecretKeys,
  ownedSecret,
  readOnly,
}: EditorProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const idRef = useRef(0);
  const nextId = (): number => idRef.current++;
  const [rows, setRows] = useState<Row[]>(() => rowsFromEnv(initialEnv, nextId));
  const [secretKeys, setSecretKeys] = useState<Set<string>>(() => new Set(initialSecretKeys));

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
    setRows(rowsFromEnv(initialEnv, nextId));
    setSecretKeys(new Set(initialSecretKeys));
  }

  const mutation = useMutation({
    mutationFn: (env: Record<string, string>) => api.setEnvConfig(env),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: envConfigKey });
    },
  });

  const addRow = (): void => {
    setRows((current) => [...current, { id: `env-row-${String(nextId())}`, key: '', value: '' }]);
  };
  const setKey = (id: string, key: string): void => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, key } : row)));
  };
  const setValue = (id: string, value: string): void => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, value } : row)));
  };
  const removeRow = (id: string): void => {
    setRows((current) => current.filter((row) => row.id !== id));
  };
  const toggleSecret = (key: string, next: boolean): void => {
    setSecretKeys((current) => {
      const updated = new Set(current);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    });
  };

  const keys = rows.map((row) => row.key);
  const hasBlankKey = keys.some((key) => key.trim().length === 0);
  const hasDuplicateKey = new Set(keys).size !== keys.length;
  const isValid = !hasBlankKey && !hasDuplicateKey;

  const isOwned = (key: string): boolean => ownedSecret.has(key);
  const isEffectivelySecret = (key: string): boolean =>
    isOwned(key) ? (ownedSecret.get(key) ?? false) : secretKeys.has(key);

  const onSave = (): void => {
    const env: Record<string, string> = {};
    for (const row of rows) env[row.key] = row.value;
    const presentKeys = new Set(rows.map((row) => row.key));
    // `POST /api/config/env` MERGES: an omitted key is preserved, and a key is
    // deleted only when posted with value ''. So a key the operator removed
    // (loaded from the server env but no longer a row) must be posted as '' or
    // the merge writes it straight back — a silent no-op on the Remove button.
    // A rename lands here too: the old key drops out of the rows and is deleted,
    // the new key rides out as a fresh row. The marks var is managed via toggles,
    // not a raw row, so it is excluded — its value is set explicitly below.
    for (const key of Object.keys(initialEnv)) {
      if (key !== SECRET_MARKS_ENV_VAR && !presentKeys.has(key)) env[key] = '';
    }
    // The marks var holds ONLY keys that (a) are still present as an env row and
    // (b) are NOT owned by a settings class — an owned key's secret state is
    // class-derived, never mirrored here. Removed/renamed keys are pruned so no
    // stale or owned mark rides out.
    const marks = [...secretKeys].filter((key) => presentKeys.has(key) && !isOwned(key)).sort();
    env[SECRET_MARKS_ENV_VAR] = marks.join(',');
    mutation.mutate(env);
  };

  return (
    <Card>
      <div style={headerStyle}>
        <h3 style={headingStyle}>Environment variables</h3>
        {readOnly ? null : (
          <Button type="button" onClick={addRow}>
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

      {rows.length === 0 ? (
        <EmptyState
          title="No environment variables"
          description={
            readOnly
              ? 'This deployment exposes no configured environment variables.'
              : 'Add a variable to configure this deployment.'
          }
        />
      ) : (
        <ul style={listStyle}>
          {rows.map((row, index) => {
            const secret = isEffectivelySecret(row.key);
            const owned = isOwned(row.key);
            return (
              <li key={row.id} style={rowStyle}>
                <TextInput
                  aria-label={nameLabel(row.key, index)}
                  value={row.key}
                  placeholder="NAME"
                  disabled={readOnly}
                  autoComplete="off"
                  spellCheck={false}
                  style={keyInputStyle}
                  onChange={(event) => {
                    setKey(row.id, event.target.value);
                  }}
                />
                <div style={valueCellStyle}>
                  {secret ? (
                    <RevealInput
                      idPrefix={`env-secret-${row.key}`}
                      aria-label={valueLabel(row.key, index)}
                      value={row.value}
                      placeholder="value"
                      readOnly={readOnly}
                      onChange={(value) => {
                        setValue(row.id, value);
                      }}
                    />
                  ) : (
                    <TextInput
                      aria-label={valueLabel(row.key, index)}
                      value={row.value}
                      placeholder="value"
                      disabled={readOnly}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setValue(row.id, event.target.value);
                      }}
                    />
                  )}
                </div>
                {owned ? (
                  <Badge variant={secret ? 'warning' : 'neutral'}>
                    {secret ? 'secret (owned)' : 'owned'}
                  </Badge>
                ) : (
                  <Checkbox
                    label="Secret"
                    checked={secret}
                    disabled={readOnly || row.key.trim().length === 0}
                    onCheckedChange={(next) => {
                      toggleSecret(row.key, next);
                    }}
                  />
                )}
                {readOnly ? null : (
                  <Button
                    type="button"
                    variant="danger"
                    aria-label={removeLabel(row.key, index)}
                    onClick={() => {
                      removeRow(row.id);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && rows.length > 0 && !isValid ? (
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

      {readOnly ? null : (
        <div style={footerStyle}>
          <Button
            type="button"
            variant="primary"
            disabled={!isValid || mutation.isPending}
            onClick={onSave}
          >
            {mutation.isPending ? <Spinner label="Saving" /> : null}
            Save
          </Button>
        </div>
      )}
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
