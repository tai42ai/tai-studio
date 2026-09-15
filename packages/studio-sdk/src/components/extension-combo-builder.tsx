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
import type { Extension, PresetExtensionElement } from '@tai42/api-client';
import { type ReactNode, useEffect, useState } from 'react';

import { comboElementNames, extensionElementName } from '../extension-combos';
import { type SchemaEditorChange } from '../schema-editor';
import {
  ComboDraftEditor,
  CommittedComboList,
  OUTPUT_SCHEMA,
  outputSchemaConfig,
  sameNames,
  unknownNames,
} from './extension-combo-parts';

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
    <div data-testid={idPrefix} className="tai-stack">
      <CommittedComboList
        value={value}
        availableReady={availableReady}
        availableNames={availableNames}
        editing={editing}
        disabled={disabled}
        onEdit={startEdit}
        onRemove={removeCombo}
      />

      <ComboDraftEditor
        available={available}
        draft={draft}
        onDraftChange={setDraft}
        draftHasOutputSchema={draftHasOutputSchema}
        draftConfig={draftConfig}
        onDraftConfigChange={setDraftConfig}
        isDuplicate={isDuplicate}
        canAdd={canAdd}
        editing={editing}
        disabled={disabled}
        idPrefix={idPrefix}
        onCommit={commitCombo}
        onReset={resetDraft}
      />
    </div>
  );
}
