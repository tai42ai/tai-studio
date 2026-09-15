/**
 * `SecretRefField` — a data-agnostic masked editor for ONE secret value that is
 * EITHER a reference to an existing env key OR a freshly pasted secret. It knows
 * nothing about any wire format: it emits a discriminated {@link SecretRef} and
 * the host maps that to whatever it stores.
 *
 * WRITE-ONLY for a pasted secret: the plaintext lives only in local editor state
 * until the user commits it, at which point it leaves the DOM entirely (held only
 * in the emitted value the host holds) — the committed chip renders a fixed mask,
 * never the secret, and offers NO reveal. A picked key's NAME is not itself the
 * secret, so its chip is revealable on click.
 *
 * FAIL CLOSED: env-key picking is offered only when `keyPickingAvailable` is
 * explicitly true (the host passes it from whether the projection carries the env
 * route). Absent, the field is paste-only.
 */
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { Field } from '../components/field';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import { TextInput } from '../components/inputs';
import { Button } from '../components/primitives';
import { Select } from '../components/select';

/**
 * The value {@link SecretRefField} emits and reads back. The `source` discriminant
 * is what the host branches on:
 *  - `key`   — reference an existing env key; the host resolves the reference.
 *  - `paste` — a new plaintext secret; the host stores it under a generated key
 *              and records the reference. `secret` is write-only and never rendered.
 */
export type SecretRef =
  | { readonly source: 'key'; readonly key: string }
  | { readonly source: 'paste'; readonly secret: string };

export interface SecretRefFieldProps {
  /** The current value, or `undefined` when nothing has been provided yet. */
  readonly value: SecretRef | undefined;
  /** Fired once when a value is provided (a key picked, or a paste committed). */
  readonly onChange: (value: SecretRef) => void;
  /** Env key NAMES the host supplies (e.g. envConfig.secret_keys). Never fetched here. */
  readonly availableKeys: readonly string[];
  /**
   * Whether env-key picking is available at all — the host passes it from whether
   * the projection carries the env route. Omitted or false: paste-only (fail
   * closed).
   */
  readonly keyPickingAvailable?: boolean;
  /**
   * When set, PASTING a new secret is blocked and this reason is surfaced inline
   * (referencing an existing key stays available). The host passes it when a paste
   * right now would land in the wrong place — an unsaved structural edit has shifted
   * the target pointer, or the entry has no key yet to hint the generated name.
   */
  readonly pasteDisabledReason?: string;
  /** Visible field label; the accessible name of the inner control. */
  readonly label?: string;
  readonly idPrefix?: string;
}

/** A fixed-width mask that never encodes the masked value's length. */
const MASK = '••••••••';

export function SecretRefField({
  value,
  onChange,
  availableKeys,
  keyPickingAvailable,
  pasteDisabledReason,
  label = 'Secret',
  idPrefix = 'secret-ref',
}: SecretRefFieldProps): ReactNode {
  const canPick = keyPickingAvailable === true;
  const pasteBlocked = pasteDisabledReason !== undefined;

  // Editing is forced while there is no value to show as a chip; otherwise the
  // chip is shown until the user asks to replace it.
  const [editing, setEditing] = useState(value === undefined);
  const [mode, setMode] = useState<'key' | 'paste'>(
    value?.source === 'key' && canPick ? 'key' : 'paste',
  );
  const [draftSecret, setDraftSecret] = useState('');
  const [pickedKey, setPickedKey] = useState('');
  const [revealed, setRevealed] = useState(false);

  // A different committed value must never keep the prior reveal: revealing key B
  // after B replaced A would name the wrong key. Reset on a STABLE signature of the
  // value rather than its object identity, so a host that re-creates an equal
  // `value` object each render never collapses an open reveal.
  const valueSignature =
    value === undefined ? '' : value.source === 'key' ? `key:${value.key}` : 'paste';
  useEffect(() => {
    setRevealed(false);
  }, [valueSignature]);

  const effectiveMode = canPick ? mode : 'paste';

  const commitKey = (key: string): void => {
    setPickedKey(key);
    if (key === '') return;
    onChange({ source: 'key', key });
    setEditing(false);
  };
  const commitPaste = (): void => {
    if (draftSecret === '' || pasteBlocked) return;
    onChange({ source: 'paste', secret: draftSecret });
    // The plaintext leaves the DOM: it now lives only in the emitted value.
    setDraftSecret('');
    setEditing(false);
  };
  const startEditing = (): void => {
    setDraftSecret('');
    setPickedKey('');
    setRevealed(false);
    setMode(value?.source === 'key' && canPick ? 'key' : 'paste');
    setEditing(true);
  };

  if (!editing && value !== undefined) {
    return (
      <div data-testid={idPrefix}>
        <SecretChip
          value={value}
          revealed={revealed}
          onToggleReveal={() => {
            setRevealed((prev) => !prev);
          }}
        />
        <Button type="button" variant="secondary" onClick={startEditing}>
          {value.source === 'key' ? 'Change reference' : 'Replace secret'}
        </Button>
      </div>
    );
  }

  return (
    <div data-testid={idPrefix}>
      {canPick ? (
        <SecretSourceToggle label={label} effectiveMode={effectiveMode} onMode={setMode} />
      ) : null}
      <SecretEditorBody
        label={label}
        effectiveMode={effectiveMode}
        availableKeys={availableKeys}
        pickedKey={pickedKey}
        onPickKey={commitKey}
        draftSecret={draftSecret}
        onDraftChange={setDraftSecret}
        onCommitPaste={commitPaste}
        pasteDisabledReason={pasteDisabledReason}
        pasteBlocked={pasteBlocked}
      />
    </div>
  );
}

/** The key/paste source switch, shown only when key picking is available. */
function SecretSourceToggle({
  label,
  effectiveMode,
  onMode,
}: {
  label: string;
  effectiveMode: 'key' | 'paste';
  onMode: (mode: 'key' | 'paste') => void;
}): ReactNode {
  return (
    <div className="tai-row" role="group" aria-label={`${label} source`}>
      <Button
        type="button"
        variant={effectiveMode === 'key' ? 'primary' : 'secondary'}
        aria-pressed={effectiveMode === 'key'}
        onClick={() => {
          onMode('key');
        }}
      >
        Reference existing key
      </Button>
      <Button
        type="button"
        variant={effectiveMode === 'paste' ? 'primary' : 'secondary'}
        aria-pressed={effectiveMode === 'paste'}
        onClick={() => {
          onMode('paste');
        }}
      >
        Paste new secret
      </Button>
    </div>
  );
}

/** The active editor: a key Select (or an empty-keys hint) or the write-only paste input. */
function SecretEditorBody({
  label,
  effectiveMode,
  availableKeys,
  pickedKey,
  onPickKey,
  draftSecret,
  onDraftChange,
  onCommitPaste,
  pasteDisabledReason,
  pasteBlocked,
}: {
  label: string;
  effectiveMode: 'key' | 'paste';
  availableKeys: readonly string[];
  pickedKey: string;
  onPickKey: (key: string) => void;
  draftSecret: string;
  onDraftChange: (secret: string) => void;
  onCommitPaste: () => void;
  pasteDisabledReason: string | undefined;
  pasteBlocked: boolean;
}): ReactNode {
  if (effectiveMode === 'key') {
    if (availableKeys.length === 0) {
      return <span className="tai-field-hint">No keys available</span>;
    }
    return (
      <Field label={label}>
        <Select
          value={pickedKey === '' ? undefined : pickedKey}
          onValueChange={onPickKey}
          placeholder="Select a key"
          options={availableKeys.map((key) => ({ value: key, label: key }))}
        />
      </Field>
    );
  }
  return (
    <div className="tai-row">
      <div style={{ flex: 1 }}>
        <Field label={label} error={pasteDisabledReason}>
          {/* type=password: the plaintext is masked and offers no reveal —
              it is write-only. */}
          <TextInput
            type="password"
            value={draftSecret}
            onChange={(event) => {
              onDraftChange(event.target.value);
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste a secret value"
          />
        </Field>
      </div>
      <Button
        type="button"
        variant="primary"
        disabled={draftSecret === '' || pasteBlocked}
        onClick={onCommitPaste}
      >
        Use secret
      </Button>
    </div>
  );
}

/**
 * The committed masked chip. A `key` ref names the key, revealable on click; a
 * `paste` secret shows only that a new secret is staged — the plaintext is never
 * a child of this tree.
 */
function SecretChip({
  value,
  revealed,
  onToggleReveal,
}: {
  value: SecretRef;
  revealed: boolean;
  onToggleReveal: () => void;
}): ReactNode {
  if (value.source === 'paste') {
    return (
      <span className="tai-chip tai-chip-static">
        New secret <span aria-hidden="true">{MASK}</span>
      </span>
    );
  }
  const toggleLabel = revealed ? 'Hide value' : 'Show value';
  return (
    <span className="tai-chip tai-chip-static">
      <span>{revealed ? value.key : MASK}</span>
      <button
        type="button"
        className="tai-icon-btn"
        aria-label={toggleLabel}
        onClick={onToggleReveal}
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </span>
  );
}
