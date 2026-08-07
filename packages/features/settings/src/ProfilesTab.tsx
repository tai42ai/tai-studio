/**
 * The Profiles tab: named settings profiles (e.g. `dev` / `prod`) — full env
 * documents stored server-side, previewed as a diff, and applied to the fleet with
 * one click. It reads `GET /api/config/profiles` (names + descriptions only) and
 * fronts the profile CRUD / diff / apply / version routes.
 *
 * Masking is CLIENT-SIDE. Profile bodies, version bodies, and the diff carry REAL
 * env values (secret/fenced routes); a value is masked here whenever its key is in
 * the profile's own `secret_keys` OR is a registered settings-class secret (the
 * secret-mask union). Editor cells reveal-on-click (mirroring EnvironmentTab); the diff preview
 * and the version-history bodies are masked outright (no reveal — a read surface).
 *
 * VISIBILITY: SettingsPage shows this tab to any caller whose projection reaches the
 * profiles LIST route; the secret/fenced controls (body read, diff, apply, edit,
 * delete, rollback) are admin-only server-side, so a scoped list-only editor sees the
 * list ALONE — every management control is gated on a full (admin) projection here, so
 * the tab never renders a control whose call would 403. Config read-only mode further
 * hides the WRITE controls (create / edit / delete / apply / revert / rollback) while
 * leaving the diff and version-history READ views available.
 *
 * Apply is destructive and fenced: it full-replaces the profile-managed env band and
 * reloads the fleet. The apply flow confirms behind a diff review, refuses to fire
 * when the diff carries boundary-refused keys, and renders the dedicated report —
 * the fleet fan-out (via {@link FleetReport}) plus the hot / recycle (per-origin,
 * the applier's own line carrying the `self-deferred` status) / refused sections.
 * "Revert last apply" applies the reserved `@previous` profile (each apply auto-saves
 * the replaced env there).
 *
 * State follows the shared convention: <Spinner> while loading, a loud <ErrorState>
 * on any failure; every server-supplied string renders as escaped React text.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  FleetReport,
  FormDialog,
  JsonDiff,
  RevealInput,
  ScrollRegion,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  VersionHistoryPanel,
  errorMessage,
  isFullProjection,
  useApi,
  useCapabilities,
  useRegisterDirty,
  type VersionHistoryEntry,
} from '@tai42/studio-sdk';
import { summarizeFleetFanout } from '@tai42/api-client';
import type { ApiClient, SettingsSchema } from '@tai42/api-client';

import {
  envConfigKey,
  settingsProfileKey,
  settingsProfileVersionKey,
  settingsProfileVersionsKey,
  settingsProfilesKey,
  settingsSchemaKey,
} from './keys';

/** The stored profile document (`{ description, env, secret_keys }`). */
type ProfileBody = Awaited<ReturnType<ApiClient['getSettingsProfile']>>;
type ProfileDiff = Awaited<ReturnType<ApiClient['diffSettingsProfile']>>;
type ApplyResponse = Awaited<ReturnType<ApiClient['applySettingsProfile']>>;
type ProfileVersion = Awaited<ReturnType<ApiClient['getSettingsProfileVersion']>>;

/** The reserved profile that every apply auto-saves the replaced env into. */
const PREVIOUS_PROFILE = '@previous';

/** The env var whose value is the comma-separated list of user-marked secret keys. */
const SECRET_MARKS_ENV_VAR = 'TAI_ENV_SECRET_KEYS';

/** The masked stand-in for a secret value — display only; the real value never renders. */
const MASK = '••••••';

// -- secret-union helpers ----------------------------------------------------

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

/** The secret-mask union: a key is masked when the settings class owns it as secret OR the profile marks it secret. */
function isSecretKey(
  key: string,
  secretKeys: ReadonlySet<string>,
  ownedSecret: ReadonlyMap<string, boolean>,
): boolean {
  return (ownedSecret.get(key) ?? false) || secretKeys.has(key);
}

/** A profile/version body with every secret env value replaced by the mask — a read view. */
function maskBody(body: ProfileBody, ownedSecret: ReadonlyMap<string, boolean>): unknown {
  const secretKeys = new Set(body.secret_keys);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.env)) {
    env[key] = isSecretKey(key, secretKeys, ownedSecret) ? MASK : value;
  }
  return { description: body.description, env, secret_keys: body.secret_keys };
}

// -- styles ------------------------------------------------------------------

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const cardHeaderStyle: CSSProperties = {
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

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
};

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

const rowListStyle: CSSProperties = {
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

const keyInputStyle: CSSProperties = { flex: '1 1 30%', fontFamily: 'var(--tai-font-mono)' };
const valueCellStyle: CSSProperties = { flex: '1 1 45%', fontFamily: 'var(--tai-font-mono)' };

const validationStyle: CSSProperties = {
  margin: 'var(--tai-space-3) 0 0',
  color: 'var(--tai-color-err-text)',
  fontSize: 'var(--tai-text-sm)',
};

const dangerPanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
  margin: '0 0 var(--tai-space-3)',
  padding: 'var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-err-text)',
  background: 'var(--tai-color-danger-surface)',
  color: 'var(--tai-color-err-text)',
  fontSize: 'var(--tai-text-sm)',
};

const warnPanelStyle: CSSProperties = { margin: '0 0 var(--tai-space-3)' };
const noteStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};
const sectionTitleStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-2)',
  fontSize: 'var(--tai-text-md)',
  color: 'var(--tai-color-text)',
};

// -- env editor rows ---------------------------------------------------------

interface Row {
  readonly id: string;
  readonly key: string;
  readonly value: string;
}

function nameLabel(key: string, index: number): string {
  return key.length > 0 ? `Name of variable ${key}` : `Name of new variable ${String(index + 1)}`;
}
function valueLabel(key: string, index: number): string {
  return key.length > 0 ? `Value of variable ${key}` : `Value of new variable ${String(index + 1)}`;
}
function removeLabel(key: string, index: number): string {
  return key.length > 0 ? `Remove variable ${key}` : `Remove new variable ${String(index + 1)}`;
}

// -- diff preview ------------------------------------------------------------

/**
 * The diff carries REAL env values (secret route). The preview masks every value —
 * the key names and the recycle/refused key lists are the actionable safety
 * information, and the change kind is spelled out by `JsonDiff` from the masked
 * before/after (`was`/`now` differ, so a changed key never collapses to no row).
 */
function maskedDiffSides(diff: ProfileDiff): { before: unknown; after: unknown } {
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  for (const key of diff.removed) before[key] = MASK;
  for (const key of diff.added) after[key] = MASK;
  for (const change of diff.changed) {
    before[change.key] = `${MASK} (was)`;
    after[change.key] = `${MASK} (now)`;
  }
  return { before, after };
}

/** The recycle-class and boundary-refused key callouts — shown before any apply. */
function DiffCallouts({ diff }: { readonly diff: ProfileDiff }): ReactNode {
  return (
    <>
      {diff.refused_keys.length > 0 ? (
        <div role="alert" style={dangerPanelStyle} data-testid="diff-refused">
          <strong>Refused keys — apply is blocked</strong>
          <span>
            These keys are refused at the profile boundary (key material / infrastructure identity)
            and cannot be applied:
          </span>
          <span className="tai-mono">{diff.refused_keys.join(', ')}</span>
        </div>
      ) : null}
      {diff.recycle_keys.length > 0 ? (
        <p role="note" className="tai-warn-state" style={warnPanelStyle} data-testid="diff-recycle">
          These keys need a process recycle to take effect — applying orchestrates a rolling
          restart: <span className="tai-mono">{diff.recycle_keys.join(', ')}</span>
        </p>
      ) : null}
    </>
  );
}

function DiffDialog({
  name,
  onClose,
}: {
  readonly name: string;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const diffQuery = useQuery({
    queryKey: [...settingsProfileKey(name), 'diff'],
    queryFn: () => api.diffSettingsProfile(name),
  });

  let body: ReactNode;
  if (diffQuery.isPending) {
    body = <Spinner label="Computing diff" />;
  } else if (diffQuery.isError) {
    body = (
      <ErrorState
        message={errorMessage(diffQuery.error)}
        onRetry={() => void diffQuery.refetch()}
      />
    );
  } else {
    const diff = diffQuery.data;
    const { before, after } = maskedDiffSides(diff);
    body = (
      <div className="tai-stack">
        <DiffCallouts diff={diff} />
        <ScrollRegion label="Profile diff">
          <JsonDiff before={before} after={after} />
        </ScrollRegion>
      </div>
    );
  }

  return (
    <Dialog
      title={`Diff — ${name}`}
      description="The saved profile compared with the live environment. Values are masked."
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div className="tai-stack">
        {body}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// -- apply report ------------------------------------------------------------

/**
 * The dedicated apply report (names-only — no env value appears). The
 * fleet fan-out surfaces any failed propagation; `hot` names the in-place swaps;
 * `recycle` is the per-origin orchestration, the applier's own entry carrying the
 * `self-deferred` status; `refused` (empty on success) names any boundary refusal.
 */
function ApplyReport({ report }: { readonly report: ApplyResponse }): ReactNode {
  return (
    <div className="tai-stack" data-testid="apply-report">
      <FleetReport summary={summarizeFleetFanout(report.fanout)} />

      <section>
        <h4 style={sectionTitleStyle}>Hot-swapped</h4>
        {report.hot.length === 0 ? (
          <p style={noteStyle}>No keys were hot-swapped.</p>
        ) : (
          <div style={actionsStyle}>
            {report.hot.map((key) => (
              <Badge key={key} variant="success">
                {key}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4 style={sectionTitleStyle}>Recycle</h4>
        {report.recycle.length === 0 ? (
          <p style={noteStyle}>No process recycle was needed.</p>
        ) : (
          <ul style={rowListStyle} data-testid="apply-recycle">
            {report.recycle.map((entry) => (
              <li key={`${entry.origin}-${entry.kind}`} className="tai-row">
                <span className="tai-mono">{entry.origin}</span>
                <Badge variant="neutral">{entry.kind}</Badge>
                <Badge variant={entry.status === 'self-deferred' ? 'warning' : 'primary'}>
                  {entry.status}
                </Badge>
                {entry.status === 'self-deferred' ? (
                  <span style={labelStyle}>
                    this worker (the applier) recycles itself after replying
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {report.refused.length > 0 ? (
        <div role="alert" style={dangerPanelStyle} data-testid="apply-refused">
          <strong>Refused</strong>
          <ul style={{ margin: 0, paddingLeft: 'var(--tai-space-4)' }}>
            {report.refused.map((entry) => (
              <li key={entry.key}>
                <span className="tai-mono">{entry.key}</span> — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The last-gate invariant a fenced apply upholds: it must NEVER fire while the
 * reviewed diff carries boundary-refused keys (a partial apply on a destructive
 * action). Throws loudly when handed any refused key.
 */
export function assertApplyable(refusedKeys: readonly string[]): void {
  if (refusedKeys.length > 0) {
    throw new Error(
      `Refusing to apply: the diff carries boundary-refused keys (${refusedKeys.join(', ')}).`,
    );
  }
}

/**
 * The destructive apply flow (reused for a named profile and for `@previous` revert).
 * It reviews the diff first — the recycle/refused callouts and a warning — then the
 * fenced Apply fires. A diff carrying refused keys BLOCKS apply (a refusal aborts, it
 * is never sent). On success the report replaces the review; on failure the review
 * stays with a loud error.
 */
function ApplyProfileDialog({
  name,
  title,
  intro,
  onClose,
}: {
  readonly name: string;
  readonly title: string;
  readonly intro: string;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const diffQuery = useQuery({
    queryKey: [...settingsProfileKey(name), 'diff'],
    queryFn: () => api.diffSettingsProfile(name),
  });

  const apply = useMutation({
    mutationFn: () => {
      // Defense-in-depth for a fenced, destructive action: never issue a partial
      // apply. If the reviewed diff carries boundary-refused keys, abort loudly
      // rather than send — the disabled button is the first gate, this is the last.
      assertApplyable(diffQuery.data?.refused_keys ?? []);
      return api.applySettingsProfile(name);
    },
    onSuccess: () => {
      // Apply full-replaces the live env and re-versions the profile: the deployment
      // env map, this profile's body, and its version history all move.
      void queryClient.invalidateQueries({ queryKey: settingsProfilesKey });
      void queryClient.invalidateQueries({ queryKey: settingsProfileKey(name) });
      void queryClient.invalidateQueries({ queryKey: settingsProfileVersionsKey(name) });
      void queryClient.invalidateQueries({ queryKey: envConfigKey });
    },
  });

  const refusedByDiff = diffQuery.data !== undefined && diffQuery.data.refused_keys.length > 0;
  const canApply = diffQuery.isSuccess && !refusedByDiff && !apply.isPending;

  return (
    <Dialog
      title={title}
      description={intro}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div className="tai-stack">
        {apply.isSuccess ? (
          <ApplyReport report={apply.data} />
        ) : (
          <>
            <p style={dangerPanelStyle}>
              <strong>This is destructive.</strong>
              <span>
                Applying replaces the deployment&rsquo;s profile-managed environment and reloads the
                worker fleet. Review the change below before applying.
              </span>
            </p>

            {diffQuery.isPending ? <Spinner label="Computing diff" /> : null}
            {diffQuery.isError ? (
              <ErrorState
                message={errorMessage(diffQuery.error)}
                onRetry={() => void diffQuery.refetch()}
              />
            ) : null}
            {diffQuery.isSuccess ? <DiffCallouts diff={diffQuery.data} /> : null}

            {apply.isError ? <ErrorState message={errorMessage(apply.error)} /> : null}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button type="button" onClick={onClose}>
            {apply.isSuccess ? 'Close' : 'Cancel'}
          </Button>
          {apply.isSuccess ? null : (
            <Button
              type="button"
              variant="danger"
              disabled={!canApply}
              onClick={() => {
                if (!canApply) return;
                apply.mutate();
              }}
            >
              {apply.isPending ? <Spinner label="Applying" /> : null}
              Apply profile
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// -- create / edit editor ----------------------------------------------------

/**
 * The profile create/edit dialog: a real form (Enter-to-submit) over the profile's
 * name (create only — the identity is immutable), description, and its env map as
 * masked key/value rows (reveal-on-click for secret cells, a per-row secret toggle
 * for unowned keys mirroring EnvironmentTab). Submitting PUTs the whole document.
 *
 * `useRegisterDirty` reports a diverging draft so a tab switch confirms before the
 * unsaved profile is dropped.
 */
function ProfileFormDialog({
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

  let seq = 0;
  const nextId = (): string => `profile-row-${String(seq++)}`;
  const [draftName, setDraftName] = useState(name ?? '');
  const [description, setDescription] = useState(initial.description);
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(initial.env)
      .filter(([key]) => key !== SECRET_MARKS_ENV_VAR)
      .map(([key, value]) => ({ id: nextId(), key, value })),
  );
  const [secretKeys, setSecretKeys] = useState<Set<string>>(() => new Set(initial.secret_keys));

  const keys = rows.map((row) => row.key);
  const hasBlankKey = keys.some((key) => key.trim().length === 0);
  const hasDuplicateKey = new Set(keys).size !== keys.length;
  // A reserved `@`-prefixed name is invalid for a user profile.
  const nameValid = editing || (draftName.trim().length > 0 && !draftName.startsWith('@'));
  const isValid = nameValid && !hasBlankKey && !hasDuplicateKey;

  const currentSignature = JSON.stringify({
    name: draftName,
    description,
    rows: rows.map((row) => [row.key, row.value]),
    secrets: [...secretKeys].sort(),
  });
  const initialSignature = JSON.stringify({
    name: name ?? '',
    description: initial.description,
    rows: Object.entries(initial.env).filter(([key]) => key !== SECRET_MARKS_ENV_VAR),
    secrets: [...initial.secret_keys].sort(),
  });
  useRegisterDirty(currentSignature !== initialSignature);

  const isOwned = (key: string): boolean => ownedSecret.has(key);
  const isSecret = (key: string): boolean => isSecretKey(key, secretKeys, ownedSecret);

  const addRow = (): void => {
    setRows((current) => [...current, { id: nextId(), key: '', value: '' }]);
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

  const submit = async (): Promise<void> => {
    const target = editing ? name : draftName.trim();
    const env: Record<string, string> = {};
    for (const row of rows) env[row.key] = row.value;
    const presentKeys = new Set(rows.map((row) => row.key));
    // The stored secret_keys are the present, unowned marks (an owned key's secret
    // state is class-derived, never mirrored into the profile band).
    const marks = [...secretKeys].filter((key) => presentKeys.has(key) && !isOwned(key)).sort();
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
                setDraftName(event.target.value);
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
              setDescription(event.target.value);
            }}
          />
        </div>

        <div style={cardHeaderStyle}>
          <span style={labelStyle}>Environment variables</span>
          <Button type="button" onClick={addRow}>
            Add variable
          </Button>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No environment variables"
            description="Add a variable to configure this profile."
          />
        ) : (
          <ul style={rowListStyle}>
            {rows.map((row, index) => {
              const secret = isSecret(row.key);
              const owned = isOwned(row.key);
              return (
                <li key={row.id} style={rowStyle}>
                  <TextInput
                    aria-label={nameLabel(row.key, index)}
                    value={row.key}
                    placeholder="NAME"
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
                        idPrefix={`profile-secret-${row.key}`}
                        aria-label={valueLabel(row.key, index)}
                        value={row.value}
                        placeholder="value"
                        onChange={(value) => {
                          setValue(row.id, value);
                        }}
                      />
                    ) : (
                      <TextInput
                        aria-label={valueLabel(row.key, index)}
                        value={row.value}
                        placeholder="value"
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
                      disabled={row.key.trim().length === 0}
                      onCheckedChange={(next) => {
                        toggleSecret(row.key, next);
                      }}
                    />
                  )}
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
                </li>
              );
            })}
          </ul>
        )}

        {rows.length > 0 && (hasBlankKey || hasDuplicateKey) ? (
          <p role="alert" style={validationStyle}>
            Variable names must be unique and non-empty.
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}

// -- version history ---------------------------------------------------------

function ProfileVersionsDialog({
  name,
  ownedSecret,
  readOnly,
  onClose,
}: {
  readonly name: string;
  readonly ownedSecret: ReadonlyMap<string, boolean>;
  readonly readOnly: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: settingsProfileVersionsKey(name),
    queryFn: ({ signal }) => api.listSettingsProfileVersions(name, signal),
  });

  // The list is metadata only; each version's BODY is fetched on its own (secret
  // route) and rendered masked — one query per version, cached by version key.
  const metadata = versionsQuery.data ?? [];
  const bodyQueries = useQueries({
    queries: metadata.map((version) => ({
      queryKey: settingsProfileVersionKey(name, version.version),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.getSettingsProfileVersion(name, version.version, signal),
    })),
  });

  const rollback = useMutation({
    mutationFn: (version: number) => api.rollbackSettingsProfile(name, version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsProfileVersionsKey(name) });
      void queryClient.invalidateQueries({ queryKey: settingsProfileKey(name) });
      void queryClient.invalidateQueries({ queryKey: settingsProfilesKey });
    },
  });

  const bodiesPending = bodyQueries.some((query) => query.isPending);
  const bodyError = bodyQueries.find((query) => query.isError)?.error;

  let body: ReactNode;
  if (
    versionsQuery.isPending ||
    (metadata.length > 0 && bodiesPending && bodyError === undefined)
  ) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  } else if (versionsQuery.isError) {
    body = (
      <ErrorState
        message={errorMessage(versionsQuery.error)}
        onRetry={() => void versionsQuery.refetch()}
      />
    );
  } else if (bodyError !== undefined) {
    body = <ErrorState message={errorMessage(bodyError)} />;
  } else if (metadata.length === 0) {
    body = (
      <Card>
        <EmptyState
          title="No versions recorded"
          description="This profile has no version history yet."
        />
      </Card>
    );
  } else {
    const entries: VersionHistoryEntry[] = bodyQueries
      .map((query) => query.data)
      .filter((data): data is ProfileVersion => data !== undefined)
      .map((version) => ({
        version: version.version,
        tags: version.tags,
        is_current: version.is_current,
        created_at: version.created_at,
        body: maskBody(version.body, ownedSecret),
      }))
      .sort((a, b) => b.version - a.version);
    body = (
      <VersionHistoryPanel
        versions={entries}
        readOnly={readOnly}
        onRollback={(version) => {
          rollback.mutate(version);
        }}
        rollbackPending={rollback.isPending}
        rollbackError={rollback.isError ? errorMessage(rollback.error) : undefined}
        rollbackConfirmDescription="Rollback re-points the stored profile at the version's body; apply it to push the change to the fleet."
      />
    );
  }

  return (
    <Dialog
      title={`Profile versions — ${name}`}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-5)' }}>
        {body}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// -- main --------------------------------------------------------------------

export interface ProfilesTabProps {
  readonly readOnly: boolean;
}

type OpenDialog =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly name: string }
  | { readonly kind: 'delete'; readonly name: string }
  | { readonly kind: 'diff'; readonly name: string }
  | { readonly kind: 'apply'; readonly name: string }
  | { readonly kind: 'revert' }
  | { readonly kind: 'versions'; readonly name: string };

export function ProfilesTab({ readOnly }: ProfilesTabProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const { state: capabilityState } = useCapabilities();

  // The management controls issue secret/fenced calls that are admin-only server-side.
  // A scoped list-only editor (not a full projection) sees the list ALONE, so no
  // control it cannot use ever renders.
  const canManage =
    capabilityState.status === 'ready' && isFullProjection(capabilityState.projection);
  const canWrite = canManage && !readOnly;

  const listQuery = useQuery({
    queryKey: settingsProfilesKey,
    queryFn: ({ signal }) => api.listSettingsProfiles(signal),
  });
  // The secret masks the editor/version views need — only reachable (and only needed)
  // for a manager; a list-only editor opens none of those views.
  const schemaQuery = useQuery({
    queryKey: settingsSchemaKey,
    queryFn: ({ signal }) => api.getSettingsSchema(signal),
    enabled: canManage,
  });

  const [open, setOpen] = useState<OpenDialog | null>(null);

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteSettingsProfile(name),
    onSuccess: () => {
      setOpen(null);
      void queryClient.invalidateQueries({ queryKey: settingsProfilesKey });
    },
  });

  if (listQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(listQuery.error)}
        onRetry={() => void listQuery.refetch()}
      />
    );
  }
  if (listQuery.isPending) {
    return <Spinner label="Loading profiles" />;
  }
  // The masks are a manager-only read; surface a schema failure loudly there too.
  if (canManage && schemaQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(schemaQuery.error)}
        onRetry={() => void schemaQuery.refetch()}
      />
    );
  }
  if (canManage && schemaQuery.isPending) {
    return <Spinner label="Loading profiles" />;
  }

  const ownedSecret: ReadonlyMap<string, boolean> =
    schemaQuery.data !== undefined ? ownedSecretMap(schemaQuery.data) : new Map();
  // Reserved `@`-prefixed profiles (e.g. `@previous`) are driven only by the
  // dedicated Revert button — never surfaced as a manageable row carrying
  // Edit/Apply/Delete/Diff/History controls.
  const profiles = [...listQuery.data]
    .filter((profile) => !profile.name.startsWith('@'))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={stackStyle}>
      <Card>
        <div style={cardHeaderStyle}>
          <h3 style={headingStyle}>Settings profiles</h3>
          {canWrite ? (
            <div style={actionsStyle}>
              <Button
                type="button"
                onClick={() => {
                  setOpen({ kind: 'revert' });
                }}
              >
                Revert last apply
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setOpen({ kind: 'create' });
                }}
              >
                New profile
              </Button>
            </div>
          ) : null}
        </div>

        {profiles.length === 0 ? (
          <EmptyState
            title="No profiles"
            description="Create a profile to capture a named set of environment values."
          />
        ) : (
          <ScrollRegion label="Profiles">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Description</TH>
                  {canManage ? <TH>Actions</TH> : null}
                </TR>
              </THead>
              <TBody>
                {profiles.map((profile) => (
                  <TR key={profile.name} data-testid={`profile-row-${profile.name}`}>
                    <TD className="tai-table-id">{profile.name}</TD>
                    <TD>{profile.description}</TD>
                    {canManage ? (
                      <TD>
                        <div style={actionsStyle}>
                          <Button
                            type="button"
                            aria-label={`Diff profile ${profile.name}`}
                            onClick={() => {
                              setOpen({ kind: 'diff', name: profile.name });
                            }}
                          >
                            Diff
                          </Button>
                          <Button
                            type="button"
                            aria-label={`Version history for ${profile.name}`}
                            onClick={() => {
                              setOpen({ kind: 'versions', name: profile.name });
                            }}
                          >
                            History
                          </Button>
                          {canWrite ? (
                            <>
                              <Button
                                type="button"
                                aria-label={`Edit profile ${profile.name}`}
                                onClick={() => {
                                  setOpen({ kind: 'edit', name: profile.name });
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="primary"
                                aria-label={`Apply profile ${profile.name}`}
                                onClick={() => {
                                  setOpen({ kind: 'apply', name: profile.name });
                                }}
                              >
                                Apply
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                aria-label={`Delete profile ${profile.name}`}
                                onClick={() => {
                                  setOpen({ kind: 'delete', name: profile.name });
                                }}
                              >
                                Delete
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </ScrollRegion>
        )}
      </Card>

      {open?.kind === 'create' ? (
        <ProfileFormDialog
          name={null}
          ownedSecret={ownedSecret}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'edit' ? (
        <ProfileFormDialog
          name={open.name}
          ownedSecret={ownedSecret}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'diff' ? (
        <DiffDialog
          name={open.name}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'apply' ? (
        <ApplyProfileDialog
          name={open.name}
          title={`Apply profile — ${open.name}`}
          intro="Review the change, then apply the profile to the fleet."
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'revert' ? (
        <ApplyProfileDialog
          name={PREVIOUS_PROFILE}
          title="Revert last apply"
          intro="Re-applies the environment replaced by the most recent apply."
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'versions' ? (
        <ProfileVersionsDialog
          name={open.name}
          ownedSecret={ownedSecret}
          readOnly={readOnly}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'delete' ? (
        <ConfirmDialog
          title="Delete profile"
          confirmLabel="Delete profile"
          pendingLabel="Deleting"
          isPending={remove.isPending}
          error={remove.isError ? remove.error : undefined}
          onConfirm={() => {
            remove.mutate(open.name);
          }}
          onClose={() => {
            setOpen(null);
          }}
        >
          <p style={{ margin: 0 }}>
            Delete the profile <strong>{open.name}</strong>? Its version history is removed too. The
            live environment is unchanged until another profile is applied.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
