/**
 * `ExtensionComboBuilder` — a controlled editor for a preset/tool's LIST OF
 * extension combos. A combo is an ordered list of extension ELEMENTS, each a bare
 * extension NAME or a `{ name, config }` mapping carrying author config; the value
 * is the list of combos (`PresetExtensionElement[][]`), the SAME shape the
 * preset/tool extensions wire carries. It is PRESENTATIONAL: the caller fetches the
 * extension catalog (`available`) and owns the `value`; this component fetches nothing.
 *
 * The surface has two parts:
 *  - the current combos, each an ordered row of name `Badge`s with a per-combo Edit
 *    (pull it back into the draft) and Remove;
 *  - a combo UNDER CONSTRUCTION, authored with the shared `ExtensionPicker` (grouped
 *    by kind, single-select for the non-stackable `backend` kind). When the draft
 *    includes the `output_schema` extension, its config is authored inline with a
 *    `SchemaEditor` (no title required); an "Add combo" / "Update combo" action
 *    composes the elements — `output_schema` as `{ name, config: { schema } }`, every
 *    other extension as a bare name — and writes it into the value.
 *
 * The builder only blocks the client-trivial invalids: an EMPTY combo (Add is
 * disabled until the draft has ≥1 member), a DUPLICATE of a combo already in the
 * value (by name sequence; flagged inline, Add blocked), an INVALID `output_schema`
 * config (the `SchemaEditor` shows the parse/lint error and Add is blocked), and an
 * UNKNOWN extension name in an existing combo (a name absent from `available`, which
 * happens when a plugin is removed after a preset was authored) — flagged inline on
 * that combo row and reported through `onValidityChange` so the caller can block
 * submit. Every deeper rule — the registry's one-per-non-stackable-kind constraint,
 * meta-schema validity, kind/ordering — is SERVER-AUTHORITATIVE: the write route
 * validates each combo and its 400 message is surfaced verbatim by the caller.
 *
 * Loading is signaled by `availableReady`: while the catalog is still loading the
 * builder reports VALID and suppresses the unknown-name notes (no danger-note flash
 * while submit stays enabled — the server backstops), so a stale-seeded combo does
 * not flicker invalid before the catalog resolves.
 *
 * SAFETY: an extension name is server-supplied, so every name renders as TEXT through
 * the DS `Badge`/`Checkbox` (React escapes it) — never an HTML sink.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import type { Extension, PresetExtensionElement } from '@tai42/api-client';

import { comboElementNames, extensionElementName } from '../extension-combos';
import { SchemaEditor, type SchemaEditorChange } from '../schema-editor';
import { Badge } from './badge';
import { ExtensionPicker } from './extension-picker';
import { Button } from './primitives';

/** The one config-taking extension this builder authors inline. */
const OUTPUT_SCHEMA = 'output_schema';

export interface ExtensionComboBuilderProps {
  /** The extension catalog the combos are drawn from (caller-fetched). */
  readonly available: readonly Extension[];
  /** The current list of combos, each an ordered list of extension elements. */
  readonly value: readonly PresetExtensionElement[][];
  /** Fired with the next list of combos on every add/update/remove. */
  readonly onChange: (next: PresetExtensionElement[][]) => void;
  readonly disabled?: boolean;
  readonly idPrefix?: string;
  /**
   * Fired (effect-driven) on mount and whenever `value`, `available`, or
   * `availableReady` changes with whether every combo's names are known. A caller
   * blocks submit while this is `false`. The `onChange` payload shape is unchanged;
   * this is a SECOND callback so the prop surface stays backward-compatible.
   */
  readonly onValidityChange?: (valid: boolean) => void;
  /**
   * Whether the `available` catalog has finished loading. Default `true` (existing
   * consumers keep today's behavior). While `false` the builder reports VALID and
   * suppresses the unknown-name notes, so a stale-seeded combo does not flash invalid
   * before the catalog resolves.
   */
  readonly availableReady?: boolean;
}

/** Two combos are equal when their NAME sequences match (config is not part of identity). */
function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

/** The stored `output_schema` config schema for a combo, if it carries one. */
function outputSchemaConfig(
  combo: readonly PresetExtensionElement[],
): Record<string, unknown> | null {
  for (const element of combo) {
    if (typeof element !== 'string' && element.name === OUTPUT_SCHEMA) {
      const schema = element.config.schema;
      return typeof schema === 'object' && schema !== null && !Array.isArray(schema)
        ? (schema as Record<string, unknown>)
        : {};
    }
  }
  return null;
}

const comboRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
};

/** The element names in a combo that are absent from the known catalog. */
function unknownNames(
  combo: readonly PresetExtensionElement[],
  availableNames: ReadonlySet<string>,
): string[] {
  return comboElementNames(combo).filter((name) => !availableNames.has(name));
}

export function ExtensionComboBuilder({
  available,
  value,
  onChange,
  disabled,
  idPrefix = 'extension-combo-builder',
  onValidityChange,
  availableReady = true,
}: ExtensionComboBuilderProps): ReactNode {
  const [draft, setDraft] = useState<string[]>([]);
  const [draftConfig, setDraftConfig] = useState<SchemaEditorChange>({ schema: null, valid: true });
  // The index of the combo being edited (pulled into the draft), or `null` for a new one.
  const [editing, setEditing] = useState<number | null>(null);

  const draftHasOutputSchema = draft.includes(OUTPUT_SCHEMA);
  const isDuplicate =
    draft.length > 0 &&
    value.some((combo, index) => index !== editing && sameNames(comboElementNames(combo), draft));
  const configInvalid = draftHasOutputSchema && !draftConfig.valid;
  const canAdd = !disabled && draft.length > 0 && !isDuplicate && !configInvalid;

  // Unknown-name validation over the EXISTING combos. Until the catalog is ready the
  // builder reports VALID and suppresses the notes (no flash on a stale-seeded combo).
  const availableNames = new Set(available.map((extension) => extension.name));
  const hasUnknownName =
    availableReady && value.some((combo) => unknownNames(combo, availableNames).length > 0);
  const valid = !hasUnknownName;

  useEffect(() => {
    onValidityChange?.(valid);
  }, [onValidityChange, valid]);

  const resetDraft = (): void => {
    setDraft([]);
    setDraftConfig({ schema: null, valid: true });
    setEditing(null);
  };

  /**
   * Compose the draft names into config-bearing elements. `output_schema` takes the
   * inline-authored config; every other name keeps the edited combo's existing
   * element verbatim when it survives — preserving any author `config` (e.g. an
   * `ask_external` verifier) the builder does not itself author — and a newly-added
   * name becomes a bare-name element.
   */
  const composeCombo = (): PresetExtensionElement[] => {
    const source = editing === null ? undefined : value[editing];
    const byName = new Map<string, PresetExtensionElement>();
    if (source !== undefined) {
      for (const element of source) byName.set(extensionElementName(element), element);
    }
    return draft.map((name) =>
      name === OUTPUT_SCHEMA
        ? { name, config: { schema: draftConfig.schema ?? {} } }
        : (byName.get(name) ?? name),
    );
  };

  const commitCombo = (): void => {
    if (!canAdd) return;
    const composed = composeCombo();
    if (editing === null) {
      onChange([...value.map((combo) => [...combo]), composed]);
    } else {
      onChange(value.map((combo, index) => (index === editing ? composed : [...combo])));
    }
    resetDraft();
  };

  const startEdit = (index: number): void => {
    const combo = value[index];
    if (combo === undefined) return;
    setDraft(comboElementNames(combo));
    setDraftConfig({ schema: outputSchemaConfig(combo), valid: true });
    setEditing(index);
  };

  const removeCombo = (index: number): void => {
    onChange(value.filter((_, i) => i !== index).map((combo) => [...combo]));
    // Removing the row under edit (or one before it) invalidates the draft target.
    if (editing !== null && (editing === index || editing > index)) resetDraft();
  };

  return (
    <div
      data-testid={idPrefix}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
    >
      {value.length > 0 ? (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--tai-space-2)',
          }}
        >
          {value.map((combo, index) => {
            const names = comboElementNames(combo);
            const unknown = availableReady ? unknownNames(combo, availableNames) : [];
            return (
              // The index IS the identity here: the list mutates by append, in-place
              // update, and remove-by-index (no reorder), and a combo has no stable id
              // of its own — so an index key is stable and cannot collide.
              <li
                key={index}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}
              >
                <div style={comboRowStyle}>
                  <span style={comboRowStyle}>
                    {names.map((name, position) => (
                      <span key={`${name}-${String(position)}`} style={comboRowStyle}>
                        {position > 0 ? (
                          <span aria-hidden style={{ color: 'var(--tai-color-text-muted)' }}>
                            +
                          </span>
                        ) : null}
                        <Badge variant={unknown.includes(name) ? 'danger' : 'primary'}>
                          {name}
                        </Badge>
                      </span>
                    ))}
                  </span>
                  <Button
                    type="button"
                    aria-label={`Edit combo ${names.join('+')}`}
                    disabled={disabled === true || editing === index}
                    onClick={() => {
                      startEdit(index);
                    }}
                  >
                    {editing === index ? 'Editing' : 'Edit'}
                  </Button>
                  <Button
                    type="button"
                    aria-label={`Remove combo ${names.join('+')}`}
                    disabled={disabled}
                    onClick={() => {
                      removeCombo(index);
                    }}
                  >
                    Remove
                  </Button>
                </div>
                {unknown.length > 0 ? (
                  <p role="alert" style={{ margin: 0, color: 'var(--tai-color-danger)' }}>
                    unknown extension: {unknown.join(', ')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>No extension combos.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <ExtensionPicker
          available={available}
          value={draft}
          onChange={setDraft}
          disabled={disabled}
          idPrefix={`${idPrefix}-draft`}
        />

        {draftHasOutputSchema ? (
          <SchemaEditor
            value={draftConfig.schema}
            onChange={setDraftConfig}
            requireTitle={false}
            label="Output schema"
            description="The JSON Schema the output_schema extension enforces on this combo's result."
            disabled={disabled}
            idPrefix={`${idPrefix}-output-schema`}
            // Re-seed the editor when the draft target changes (a new draft vs a
            // specific combo pulled in for edit).
            key={editing === null ? 'new' : `edit-${String(editing)}`}
          />
        ) : null}

        {isDuplicate ? (
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-danger)' }}>
            This combo is already added.
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 'var(--tai-space-2)', flexWrap: 'wrap' }}>
          <Button type="button" variant="primary" onClick={commitCombo} disabled={!canAdd}>
            {editing === null ? 'Add combo' : 'Update combo'}
          </Button>
          {editing !== null ? (
            <Button type="button" onClick={resetDraft} disabled={disabled}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
