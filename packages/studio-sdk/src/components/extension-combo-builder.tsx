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
 *    by kind, single-select for the non-stackable `backend` kind). An extension whose
 *    catalog entry declares a `config_schema` is authored as `{ name, config }` through
 *    its settings form; any other name stays a bare element, or the edited combo's own
 *    element when it survives the edit. An "Add extension set" / "Update extension
 *    set" action composes the elements and writes the combo into the value.
 *
 * The builder only blocks the client-trivial invalids: an EMPTY combo (Add is
 * disabled until the draft has ≥1 member), a DUPLICATE of a combo already in the
 * value (by name sequence; flagged inline, Add blocked), an INVALID or not yet
 * reported settings form of a drafted extension (Add is blocked), and an
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
import type { JsonSchema } from '../schema-form/types';
import {
  ComboDraftEditor,
  CommittedComboList,
  type ConfigurableExtension,
  sameNames,
  unknownNames,
} from './extension-combo-parts';
import type { ExtensionConfigChange } from './extension-config-editor';

type Seeds = Readonly<Record<string, Record<string, unknown> | undefined>>;

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
  // The settings each drafted configurable extension's form last reported.
  const [draftConfigs, setDraftConfigs] = useState<Readonly<Record<string, ExtensionConfigChange>>>(
    {},
  );
  // The stored settings the forms seed from when a combo is pulled in for edit.
  const [draftSeeds, setDraftSeeds] = useState<Seeds>({});
  // The index of the combo being edited (pulled into the draft), or `null` for a new one.
  const [editing, setEditing] = useState<number | null>(null);

  const settingsSchemas = new Map<string, JsonSchema>();
  for (const extension of available) {
    if (extension.config_schema !== null) {
      settingsSchemas.set(extension.name, extension.config_schema);
    }
  }
  const configurable: ConfigurableExtension[] = draft.flatMap((name) => {
    const schema = settingsSchemas.get(name);
    return schema === undefined ? [] : [{ name, schema }];
  });
  const isDuplicate =
    draft.length > 0 &&
    value.some((combo, index) => index !== editing && sameNames(comboElementNames(combo), draft));
  const configInvalid = configurable.some(({ name }) => draftConfigs[name]?.valid !== true);
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
    setDraftConfigs({});
    setDraftSeeds({});
    setEditing(null);
  };

  /**
   * Compose the draft names into elements. An extension whose catalog entry declares
   * a `config_schema` is authored as `{ name, config }` through its settings form;
   * any other name stays a bare element, or the edited combo's own element when it
   * survives the edit.
   */
  const composeCombo = (): PresetExtensionElement[] => {
    const source = editing === null ? undefined : value[editing];
    const byName = new Map<string, PresetExtensionElement>();
    if (source !== undefined) {
      for (const element of source) byName.set(extensionElementName(element), element);
    }
    return draft.map((name) => {
      const report = settingsSchemas.has(name) ? draftConfigs[name] : undefined;
      return report === undefined ? (byName.get(name) ?? name) : { name, config: report.config };
    });
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
    const seeds: Record<string, Record<string, unknown>> = {};
    for (const element of combo) {
      if (typeof element !== 'string') seeds[element.name] = element.config;
    }
    setDraft(comboElementNames(combo));
    setDraftConfigs({});
    setDraftSeeds(seeds);
    setEditing(index);
  };

  const changeDraft = (next: string[]): void => {
    setDraft(next);
    // An unticked extension's settings report goes with it.
    setDraftConfigs((current) =>
      Object.fromEntries(Object.entries(current).filter(([name]) => next.includes(name))),
    );
  };

  const changeDraftConfig = (name: string, change: ExtensionConfigChange): void => {
    setDraftConfigs((current) => ({ ...current, [name]: change }));
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
        onDraftChange={changeDraft}
        configurable={configurable}
        draftConfigs={draftSeeds}
        onDraftConfigChange={changeDraftConfig}
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
