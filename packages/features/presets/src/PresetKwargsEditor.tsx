/**
 * The fixed-kwargs editor shared by both preset authoring doors (create + save-version).
 * It owns TWO views of one `fixed_kwargs` object behind a "Fields | JSON" switch:
 *
 *  - FIELDS — one row per top-level key (a name, a type, and a value control). A
 *    reference-typed value is a `SecretRefField` in key mode that emits the exact
 *    `!ENV ${VAR}` / `!ENV ${VAR:default}` marker the server resolves at bind time; a
 *    non-scalar value is a read-only preview with an "Edit as JSON" escape hatch.
 *  - JSON — the raw textarea, for the non-scalar values the rows do not edit inline and
 *    as the loud parse surface when text is malformed.
 *
 * The `value`/`onChange` text contract is unchanged from the plain textarea, so each
 * door keeps its text state and parse-on-submit path. A NEW `onValidityChange` signal
 * reports whether the current view is submittable — false while any row is half-edited
 * (a blank/duplicate key, an unparseable number, a reference with no variable) — and the
 * doors add that boolean beside their schema/extensions gates. While a row is invalid the
 * editor holds `onChange` at the last VALID serialisation, so the stale kwargs can never
 * be saved silently.
 */
import { Button, Field, SecretRefField, Select, Textarea, TextInput } from '@tai42/studio-sdk';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  blankRow,
  type KwargRow,
  parseRows,
  rowError,
  type RowKind,
  rowsValid,
  serializeRows,
} from './kwargs-rows';

// The secret-reference help shared by every fixed-kwargs authoring surface. Single-quoted
// so the `${VAR}` marker stays literal text, never string interpolation.
export const KWARGS_SECRET_REFERENCE_HELP =
  "A secret reference stores only the environment variable's name; the server reads the " +
  'value when the preset binds. A default is stored in the clear, so never write a ' +
  'credential as a default.';

/** The disabled-paste reason surfaced on a reference row: existing keys only. */
const PASTE_DISABLED_REASON = 'Add the secret on System › Environment, then reference it here.';

/** A row carrying a stable id, so React keys and focus survive edits. */
interface EditorRow extends KwargRow {
  readonly id: string;
}

let rowIdSequence = 0;
function withId(row: KwargRow): EditorRow {
  rowIdSequence += 1;
  return { ...row, id: `kwarg-row-${String(rowIdSequence)}` };
}

const KIND_OPTIONS: readonly { readonly value: RowKind; readonly label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'null', label: 'Null' },
  { value: 'reference', label: 'Secret reference' },
  { value: 'json', label: 'JSON' },
];

export interface PresetKwargsEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onValidityChange: (valid: boolean) => void;
  readonly error: string | undefined;
  readonly hints: string[];
  readonly availableKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
  readonly idPrefix?: string;
}

export function PresetKwargsEditor({
  value,
  onChange,
  onValidityChange,
  error,
  hints,
  availableKeys,
  keyPickingAvailable,
  idPrefix = 'preset-kwargs',
}: PresetKwargsEditorProps): ReactNode {
  const [rows, setRows] = useState<EditorRow[]>(() => {
    const parsed = parseRows(value);
    return 'rows' in parsed ? parsed.rows.map(withId) : [];
  });
  const [view, setView] = useState<'fields' | 'json'>(() =>
    'error' in parseRows(value) ? 'json' : 'fields',
  );
  // The last text this editor emitted from its rows, so the external-sync effect below
  // never reparses (and resets) rows on the editor's own echo.
  const selfEmitted = useRef(value);
  // The row to focus after an add/remove, or `add` for the "Add kwarg" button.
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const keyInputs = useRef(new Map<string, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);

  // An EXTERNAL value change (the door seeds a stored object, or the JSON view is edited)
  // reparses into rows; malformed text forces the JSON view. The editor's own emits are
  // skipped by the self-emitted guard, so an in-progress fields edit is never clobbered.
  useEffect(() => {
    if (value === selfEmitted.current) return;
    const parsed = parseRows(value);
    if ('rows' in parsed) setRows(parsed.rows.map(withId));
    else setView('json');
  }, [value]);

  useEffect(() => {
    if (focusTarget === null) return;
    if (focusTarget === 'add') addButton.current?.focus();
    else keyInputs.current.get(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const parsedValue = parseRows(value);
  const jsonMalformed = 'error' in parsedValue;
  const allRowsValid = rowsValid(rows);
  const submittable = view === 'fields' ? allRowsValid : !jsonMalformed;

  useEffect(() => {
    onValidityChange(submittable);
  }, [submittable, onValidityChange]);

  // Reflect an edit in the rows, and emit the serialised text only when every row is
  // valid — so `value` always parses and the doors' parse path is unchanged.
  const commitRows = (next: EditorRow[]): void => {
    setRows(next);
    if (rowsValid(next)) {
      const text = serializeRows(next);
      selfEmitted.current = text;
      if (text !== value) onChange(text);
    }
  };

  const updateRow = (id: string, patch: Partial<KwargRow>): void => {
    commitRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeRow = (id: string): void => {
    const index = rows.findIndex((row) => row.id === id);
    const previous = rows[index - 1];
    setFocusTarget(previous !== undefined ? previous.id : 'add');
    commitRows(rows.filter((row) => row.id !== id));
  };
  const addRow = (): void => {
    const row = withId(blankRow());
    setFocusTarget(row.id);
    commitRows([...rows, row]);
  };

  // A view switch never silently drops an invalid state: fields → JSON is refused while a
  // row is broken; JSON → fields is refused while the text is malformed. Switching to
  // fields reparses the current text so the rows reflect any raw JSON edit.
  const showJson = (): void => {
    if (!allRowsValid) return;
    // Serialise the rows to pretty JSON on the way out, so the raw view shows the
    // canonical form rather than whatever compact text last seeded the editor.
    const text = serializeRows(rows);
    selfEmitted.current = text;
    if (text !== value) onChange(text);
    setView('json');
  };
  const showFields = (): void => {
    if (jsonMalformed) return;
    if ('rows' in parsedValue) setRows(parsedValue.rows.map(withId));
    setView('fields');
  };

  const parseError = view === 'json' && jsonMalformed ? parsedValue.error : undefined;
  const rowsError =
    view === 'fields' && !allRowsValid ? 'Fix the highlighted kwarg before saving.' : undefined;
  const fieldError = parseError ?? rowsError ?? error;

  const inputs = hints.length > 0 ? ` Base tool inputs: ${hints.join(', ')}.` : '';
  const description = `Values baked into the preset as fixed constants.${inputs} ${KWARGS_SECRET_REFERENCE_HELP}`;
  const keysListId = `${idPrefix}-key-hints`;

  return (
    <Field label="Fixed kwargs" description={description} error={fieldError} group>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <ViewSwitch
          view={view}
          onFields={showFields}
          onJson={showJson}
          fieldsDisabled={jsonMalformed}
          jsonDisabled={!allRowsValid}
        />

        {view === 'json' ? (
          <Textarea
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            rows={8}
            aria-label="Fixed kwargs JSON"
            style={{ fontFamily: 'var(--tai-font-mono)' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
            {hints.length > 0 ? (
              <datalist id={keysListId}>
                {hints.map((hint) => (
                  <option key={hint} value={hint} />
                ))}
              </datalist>
            ) : null}
            {rows.map((row, index) => (
              <KwargRowEditor
                key={row.id}
                row={row}
                error={rowError(rows, index)}
                keysListId={hints.length > 0 ? keysListId : undefined}
                availableKeys={availableKeys}
                keyPickingAvailable={keyPickingAvailable}
                idPrefix={`${idPrefix}-${String(index)}`}
                keyRef={(el) => {
                  if (el === null) keyInputs.current.delete(row.id);
                  else keyInputs.current.set(row.id, el);
                }}
                onKey={(key) => {
                  updateRow(row.id, { key });
                }}
                onKind={(kind) => {
                  updateRow(row.id, { kind });
                }}
                onPatch={(patch) => {
                  updateRow(row.id, patch);
                }}
                onEditJson={showJson}
                onRemove={() => {
                  removeRow(row.id);
                }}
              />
            ))}
            <div>
              <Button ref={addButton} type="button" variant="secondary" onClick={addRow}>
                Add kwarg
              </Button>
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

/** The two-segment "Fields | JSON" view switch (aria-pressed buttons, like the SDK toggles). */
function ViewSwitch({
  view,
  onFields,
  onJson,
  fieldsDisabled,
  jsonDisabled,
}: {
  readonly view: 'fields' | 'json';
  readonly onFields: () => void;
  readonly onJson: () => void;
  readonly fieldsDisabled: boolean;
  readonly jsonDisabled: boolean;
}): ReactNode {
  return (
    <div
      className="tai-row"
      role="group"
      aria-label="Kwargs editor view"
      style={{ justifyContent: 'flex-end' }}
    >
      <Button
        type="button"
        variant={view === 'fields' ? 'primary' : 'secondary'}
        aria-pressed={view === 'fields'}
        disabled={fieldsDisabled}
        title={fieldsDisabled ? 'Fix the JSON first' : undefined}
        onClick={onFields}
      >
        Fields
      </Button>
      <Button
        type="button"
        variant={view === 'json' ? 'primary' : 'secondary'}
        aria-pressed={view === 'json'}
        disabled={jsonDisabled}
        title={jsonDisabled ? 'Fix the highlighted kwarg first' : undefined}
        onClick={onJson}
      >
        JSON
      </Button>
    </div>
  );
}

/** One kwarg row: its key, its type, its value control by type, and a remove button. */
function KwargRowEditor({
  row,
  error,
  keysListId,
  availableKeys,
  keyPickingAvailable,
  idPrefix,
  keyRef,
  onKey,
  onKind,
  onPatch,
  onEditJson,
  onRemove,
}: {
  readonly row: KwargRow;
  readonly error: string | undefined;
  readonly keysListId: string | undefined;
  readonly availableKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
  readonly idPrefix: string;
  readonly keyRef: (el: HTMLInputElement | null) => void;
  readonly onKey: (key: string) => void;
  readonly onKind: (kind: RowKind) => void;
  readonly onPatch: (patch: Partial<KwargRow>) => void;
  readonly onEditJson: () => void;
  readonly onRemove: () => void;
}): ReactNode {
  // Two lines per row: the name and type on the first, the value control and Remove on
  // the second. The authoring dialogs are narrow, so a single line would crowd the value
  // control (a reference row stacks a chip, a change button and a default input).
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tai-space-2)',
        paddingBottom: 'var(--tai-space-2)',
        borderBottom: '1px solid var(--tai-color-border)',
      }}
    >
      <div className="tai-row" style={{ flexWrap: 'nowrap' }}>
        <TextInput
          ref={keyRef}
          aria-label="Key"
          value={row.key}
          list={keysListId}
          placeholder="key"
          onChange={(event) => {
            onKey(event.target.value);
          }}
          style={{ flex: 1 }}
        />
        <div style={{ flex: '0 0 11rem' }}>
          <Select
            aria-label="Type"
            value={row.kind}
            onValueChange={(next) => {
              onKind(next as RowKind);
            }}
            options={KIND_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />
        </div>
      </div>
      <div className="tai-row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ flex: 1 }}>
          <KwargValueControl
            row={row}
            availableKeys={availableKeys}
            keyPickingAvailable={keyPickingAvailable}
            idPrefix={idPrefix}
            onPatch={onPatch}
            onEditJson={onEditJson}
          />
        </div>
        <Button type="button" variant="secondary" aria-label="Remove kwarg" onClick={onRemove}>
          Remove
        </Button>
      </div>
      {error !== undefined ? (
        <span role="alert" className="tai-field-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** The value control for a row, chosen by its kind. */
function KwargValueControl({
  row,
  availableKeys,
  keyPickingAvailable,
  idPrefix,
  onPatch,
  onEditJson,
}: {
  readonly row: KwargRow;
  readonly availableKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
  readonly idPrefix: string;
  readonly onPatch: (patch: Partial<KwargRow>) => void;
  readonly onEditJson: () => void;
}): ReactNode {
  switch (row.kind) {
    case 'text':
      return (
        <TextInput
          aria-label="Value"
          value={row.text}
          placeholder="value"
          onChange={(event) => {
            onPatch({ text: event.target.value });
          }}
        />
      );
    case 'number':
      return (
        <TextInput
          type="number"
          aria-label="Value"
          value={row.text}
          placeholder="0"
          onChange={(event) => {
            onPatch({ text: event.target.value });
          }}
        />
      );
    case 'boolean':
      return (
        <Select
          aria-label="Value"
          value={row.bool ? 'true' : 'false'}
          onValueChange={(next) => {
            onPatch({ bool: next === 'true' });
          }}
          options={[
            { value: 'true', label: 'true' },
            { value: 'false', label: 'false' },
          ]}
        />
      );
    case 'null':
      return <span className="tai-field-hint">null</span>;
    case 'reference':
      return (
        <ReferenceControl
          row={row}
          availableKeys={availableKeys}
          keyPickingAvailable={keyPickingAvailable}
          idPrefix={idPrefix}
          onPatch={onPatch}
        />
      );
    case 'json':
      return <JsonValuePreview value={row.json} onEditJson={onEditJson} />;
  }
}

/** The secret-reference value: a key picker (or a bare variable input) plus a default. */
function ReferenceControl({
  row,
  availableKeys,
  keyPickingAvailable,
  idPrefix,
  onPatch,
}: {
  readonly row: KwargRow;
  readonly availableKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
  readonly idPrefix: string;
  readonly onPatch: (patch: Partial<KwargRow>) => void;
}): ReactNode {
  const setKey = (key: string): void => {
    onPatch({ reference: { key, default: row.reference.default } });
  };
  const setDefault = (text: string): void => {
    onPatch({
      reference: { key: row.reference.key, default: text === '' ? undefined : text },
    });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      {keyPickingAvailable ? (
        <SecretRefField
          label="Secret reference"
          idPrefix={`${idPrefix}-secret`}
          value={row.reference.key === '' ? undefined : { source: 'key', key: row.reference.key }}
          availableKeys={availableKeys}
          keyPickingAvailable
          initialMode="key"
          pasteDisabledReason={PASTE_DISABLED_REASON}
          onChange={(ref) => {
            if (ref.source === 'key') setKey(ref.key);
          }}
        />
      ) : (
        <div>
          <TextInput
            aria-label="Environment variable"
            value={row.reference.key}
            placeholder="VARIABLE_NAME"
            onChange={(event) => {
              setKey(event.target.value);
            }}
          />
          <span className="tai-field-hint">
            Environment keys could not be listed; type the variable name.
          </span>
        </div>
      )}
      <div>
        <TextInput
          aria-label="Default (stored in the clear)"
          value={row.reference.default ?? ''}
          placeholder="Default (stored in the clear)"
          onChange={(event) => {
            setDefault(event.target.value);
          }}
        />
        <span className="tai-field-hint">Used when the variable is unset; never a credential.</span>
      </div>
    </div>
  );
}

/** A one-line, read-only preview of a non-scalar value, with an "Edit as JSON" escape. */
function JsonValuePreview({
  value,
  onEditJson,
}: {
  readonly value: unknown;
  readonly onEditJson: () => void;
}): ReactNode {
  const text = JSON.stringify(value);
  const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text;
  return (
    <div className="tai-row" style={{ alignItems: 'center' }}>
      <span className="tai-field-hint" style={{ flex: 1, fontFamily: 'var(--tai-font-mono)' }}>
        {preview}
      </span>
      <Button type="button" variant="secondary" onClick={onEditJson}>
        Edit as JSON
      </Button>
    </div>
  );
}
