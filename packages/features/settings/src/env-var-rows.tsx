/**
 * The shared env key/value row editor for the Environment tab and the profile
 * form: a headless {@link useEnvVarRows} hook owning the row + secret-mark state,
 * and a presentational {@link EnvVarRows} list. The caller divergences — read-only,
 * merge-vs-replace save, dirty signature, the secret predicate, and the
 * deployment-lock predicate — are injected
 * as props/callbacks; none is branched inside this module.
 */
import { Badge, Button, Checkbox, RevealInput, TextInput } from '@tai42/studio-sdk';
import { type CSSProperties, type ReactNode, useId, useRef, useState } from 'react';

import { DeploymentRowNote, DeploymentSetBadge } from './deployment-lock';
import { SECRET_MARKS_ENV_VAR } from './settings-secrets';

/** One editable environment variable, with a stable id so React keys survive edits. */
export interface EnvVarRow {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  /**
   * The key the row was seeded with from the env map, unchanged by later edits; `null`
   * for a row added in the editor.
   */
  readonly seededKey: string | null;
}

/** The seed a row set is built from: an env map and the current user-marked keys. */
export interface EnvVarSeed {
  readonly env: Record<string, string>;
  readonly secretKeys: readonly string[];
}

/** The row + secret-mark state and its mutators — the headless half of the editor. */
export interface EnvVarRowsState {
  readonly rows: EnvVarRow[];
  readonly secretKeys: Set<string>;
  readonly keys: string[];
  readonly hasBlankKey: boolean;
  readonly hasDuplicateKey: boolean;
  readonly addRow: () => void;
  readonly setKey: (id: string, key: string) => void;
  readonly setValue: (id: string, value: string) => void;
  readonly removeRow: (id: string) => void;
  readonly toggleSecret: (key: string, next: boolean) => void;
  /** Re-seed the rows and marks from fresh server state (adjust-state-on-prop-change). */
  readonly reseed: (seed: EnvVarSeed) => void;
}

function rowsFromEnv(env: Record<string, string>, nextId: () => string): EnvVarRow[] {
  return Object.entries(env)
    .filter(([key]) => key !== SECRET_MARKS_ENV_VAR)
    .map(([key, value]) => ({ id: nextId(), key, value, seededKey: key }));
}

/**
 * Own the env row + secret-mark state. Each added row takes a monotonic id from a
 * ref-backed counter (persisted across renders) so renaming a variable never
 * re-identifies its inputs; the marks var is managed through the toggles and is
 * never surfaced as a raw row.
 */
export function useEnvVarRows(seed: EnvVarSeed): EnvVarRowsState {
  const idRef = useRef(0);
  const nextId = (): string => `env-var-row-${String(idRef.current++)}`;
  const [rows, setRows] = useState<EnvVarRow[]>(() => rowsFromEnv(seed.env, nextId));
  const [secretKeys, setSecretKeys] = useState<Set<string>>(() => new Set(seed.secretKeys));

  const keys = rows.map((row) => row.key);
  const hasBlankKey = keys.some((key) => key.trim().length === 0);
  const hasDuplicateKey = new Set(keys).size !== keys.length;

  return {
    rows,
    secretKeys,
    keys,
    hasBlankKey,
    hasDuplicateKey,
    addRow: () => {
      setRows((current) => [...current, { id: nextId(), key: '', value: '', seededKey: null }]);
    },
    setKey: (id, key) => {
      setRows((current) => current.map((row) => (row.id === id ? { ...row, key } : row)));
    },
    setValue: (id, value) => {
      setRows((current) => current.map((row) => (row.id === id ? { ...row, value } : row)));
    },
    removeRow: (id) => {
      setRows((current) => current.filter((row) => row.id !== id));
    },
    toggleSecret: (key, next) => {
      setSecretKeys((current) => {
        const updated = new Set(current);
        if (next) updated.add(key);
        else updated.delete(key);
        return updated;
      });
    },
    reseed: (next) => {
      setRows(rowsFromEnv(next.env, nextId));
      setSecretKeys(new Set(next.secretKeys));
    },
  };
}

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

const keyInputStyle: CSSProperties = { flex: '1 1 30%', fontFamily: 'var(--tai-font-mono)' };
const valueCellStyle: CSSProperties = { flex: '1 1 45%', fontFamily: 'var(--tai-font-mono)' };

function nameLabel(key: string, index: number): string {
  return key.length > 0 ? `Name of variable ${key}` : `Name of new variable ${String(index + 1)}`;
}
function valueLabel(key: string, index: number): string {
  return key.length > 0 ? `Value of variable ${key}` : `Value of new variable ${String(index + 1)}`;
}
function removeLabel(key: string, index: number): string {
  return key.length > 0 ? `Remove variable ${key}` : `Remove new variable ${String(index + 1)}`;
}

export interface EnvVarRowsProps {
  readonly rows: readonly EnvVarRow[];
  /** Read-only editor: inputs disabled, no per-row toggle, no Remove. */
  readonly readOnly: boolean;
  /** DOM-id prefix for a secret cell's reveal control. */
  readonly secretIdPrefix: string;
  /** Whether a key is effectively secret — the caller's own predicate. */
  readonly isSecret: (key: string) => boolean;
  /** Whether a key is owned by a settings class (class-derived secret state). */
  readonly isOwned: (key: string) => boolean;
  /**
   * Whether the deployment's own environment sets a key. A row seeded with such a key is
   * locked (name and value not editable, a "Set by the deployment" badge with a note that
   * the stored value is not used) and keeps only its Remove. The lock follows the row's
   * seeded key alone: a row added in the editor is never locked, whatever name it is
   * given, and a save that sets a key the deployment sets is refused by the server.
   */
  readonly isDeploymentSet: (key: string) => boolean;
  readonly onKeyChange: (id: string, key: string) => void;
  readonly onValueChange: (id: string, value: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onToggleSecret: (key: string, next: boolean) => void;
}

/**
 * One row: key input, masked-or-plain value input, owned badge or secret toggle, the
 * deployment lock badge and its note when the deployment sets the key, remove. The
 * lock badge and its note describe the row's locked inputs (`aria-describedby`).
 */
function EnvVarRowItem({
  row,
  index,
  readOnly,
  secretIdPrefix,
  secret,
  owned,
  deploymentSet,
  onKeyChange,
  onValueChange,
  onRemove,
  onToggleSecret,
}: {
  readonly row: EnvVarRow;
  readonly index: number;
  readonly secret: boolean;
  readonly owned: boolean;
  readonly deploymentSet: boolean;
} & Pick<
  EnvVarRowsProps,
  'readOnly' | 'secretIdPrefix' | 'onKeyChange' | 'onValueChange' | 'onRemove' | 'onToggleSecret'
>): ReactNode {
  const locked = readOnly || deploymentSet;
  const lockId = useId();
  const badgeId = `${lockId}-deployment-lock`;
  const noteId = `${lockId}-deployment-note`;
  const describedBy = deploymentSet ? `${badgeId} ${noteId}` : undefined;
  return (
    <li style={rowStyle}>
      <TextInput
        aria-label={nameLabel(row.key, index)}
        value={row.key}
        placeholder="NAME"
        disabled={locked}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        style={keyInputStyle}
        onChange={(event) => {
          onKeyChange(row.id, event.target.value);
        }}
      />
      <div style={valueCellStyle}>
        {secret ? (
          <RevealInput
            idPrefix={`${secretIdPrefix}-${row.key}`}
            aria-label={valueLabel(row.key, index)}
            value={row.value}
            placeholder="value"
            readOnly={locked}
            aria-describedby={describedBy}
            onChange={(value) => {
              onValueChange(row.id, value);
            }}
          />
        ) : (
          <TextInput
            aria-label={valueLabel(row.key, index)}
            value={row.value}
            placeholder="value"
            disabled={locked}
            aria-describedby={describedBy}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              onValueChange(row.id, event.target.value);
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
            onToggleSecret(row.key, next);
          }}
        />
      )}
      {deploymentSet ? (
        <>
          <DeploymentSetBadge id={badgeId} />
          <DeploymentRowNote id={noteId} />
        </>
      ) : null}
      {readOnly ? null : (
        <Button
          type="button"
          variant="ghost"
          aria-label={removeLabel(row.key, index)}
          onClick={() => {
            onRemove(row.id);
          }}
        >
          Remove
        </Button>
      )}
    </li>
  );
}

/** The env key/value row list — presentational; every divergence arrives as a prop. */
export function EnvVarRows({
  rows,
  readOnly,
  secretIdPrefix,
  isSecret,
  isOwned,
  isDeploymentSet,
  onKeyChange,
  onValueChange,
  onRemove,
  onToggleSecret,
}: EnvVarRowsProps): ReactNode {
  return (
    <ul style={listStyle}>
      {rows.map((row, index) => (
        <EnvVarRowItem
          key={row.id}
          row={row}
          index={index}
          readOnly={readOnly}
          secretIdPrefix={secretIdPrefix}
          secret={isSecret(row.key)}
          owned={isOwned(row.key)}
          deploymentSet={row.seededKey !== null && isDeploymentSet(row.seededKey)}
          onKeyChange={onKeyChange}
          onValueChange={onValueChange}
          onRemove={onRemove}
          onToggleSecret={onToggleSecret}
        />
      ))}
    </ul>
  );
}
