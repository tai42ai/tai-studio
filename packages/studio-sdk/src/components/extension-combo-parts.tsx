/**
 * The pieces of `ExtensionComboBuilder`: the committed-combo list
 * (`CommittedComboList`), the under-construction combo editor (`ComboDraftEditor`),
 * and the shared combo helpers. The builder owns the state and composes these.
 */
import type { Extension, PresetExtensionElement } from '@tai42/api-client';
import { Fragment, type ReactNode } from 'react';

import { comboElementNames } from '../extension-combos';
import type { JsonSchema } from '../schema-form/types';
import { Badge } from './badge';
import { type ExtensionConfigChange, ExtensionConfigEditor } from './extension-config-editor';
import { ExtensionPicker } from './extension-picker';
import { CloseIcon, XCircleIcon } from './icons';
import { Button } from './primitives';

/** Two combos are equal when their NAME sequences match (config is not part of identity). */
export function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

/** The element names in a combo that are absent from the known catalog. */
export function unknownNames(
  combo: readonly PresetExtensionElement[],
  availableNames: ReadonlySet<string>,
): string[] {
  return comboElementNames(combo).filter((name) => !availableNames.has(name));
}

/** One committed combo's row: its name badges and the Edit / Remove pair, with an
 *  inline unknown-name note. */
function CommittedComboRow({
  combo,
  index,
  editing,
  disabled,
  unknown,
  onEdit,
  onRemove,
}: {
  readonly combo: readonly PresetExtensionElement[];
  readonly index: number;
  readonly editing: number | null;
  readonly disabled: boolean | undefined;
  readonly unknown: readonly string[];
  readonly onEdit: (index: number) => void;
  readonly onRemove: (index: number) => void;
}): ReactNode {
  const names = comboElementNames(combo);
  return (
    <li className="tai-card tai-stack tai-stack-2">
      <div className="tai-row">
        {/* The badges take the row's spare width so the Edit/Remove pair pins to a
            stable trailing edge across combos of varied length. */}
        <span className="tai-row" style={{ flex: 1 }}>
          {names.map((name, position) => (
            <Fragment key={`${name}-${String(position)}`}>
              {position > 0 ? (
                <span aria-hidden className="tai-muted">
                  +
                </span>
              ) : null}
              <Badge variant={unknown.includes(name) ? 'danger' : 'primary'}>{name}</Badge>
            </Fragment>
          ))}
        </span>
        <Button
          type="button"
          // The name starts with the words the button is SHOWING, which is what WCAG
          // 2.5.3 (Label in Name) asks: a constant "Edit …" would leave a button
          // reading "Editing" named "Edit", and a voice-control user naming a control
          // they cannot see.
          aria-label={`${editing === index ? 'Editing' : 'Edit'} extension set ${names.join('+')}`}
          disabled={disabled === true || editing === index}
          onClick={() => {
            onEdit(index);
          }}
        >
          {editing === index ? 'Editing' : 'Edit'}
        </Button>
        <Button
          type="button"
          aria-label={`Remove extension set ${names.join('+')}`}
          disabled={disabled}
          onClick={() => {
            onRemove(index);
          }}
        >
          <CloseIcon />
          Remove
        </Button>
      </div>
      {unknown.length > 0 ? (
        <p role="alert" className="tai-field-error">
          <XCircleIcon />
          {unknown.length === 1 ? 'Unknown extension: ' : 'Unknown extensions: '}
          {unknown.join(', ')}.
        </p>
      ) : null}
    </li>
  );
}

/** The current combos, each a row of name badges with per-combo Edit and Remove. */
export function CommittedComboList({
  value,
  availableReady,
  availableNames,
  editing,
  disabled,
  onEdit,
  onRemove,
}: {
  readonly value: readonly PresetExtensionElement[][];
  readonly availableReady: boolean;
  readonly availableNames: ReadonlySet<string>;
  readonly editing: number | null;
  readonly disabled: boolean | undefined;
  readonly onEdit: (index: number) => void;
  readonly onRemove: (index: number) => void;
}): ReactNode {
  if (value.length === 0) return <p className="tai-muted">No extension sets.</p>;
  return (
    <ul className="tai-stack tai-stack-2">
      {value.map((combo, index) => (
        // The index IS the identity here: the list mutates by append, in-place update,
        // and remove-by-index (no reorder), and a combo has no stable id of its own —
        // so an index key is stable and cannot collide.
        <CommittedComboRow
          key={index}
          combo={combo}
          index={index}
          editing={editing}
          disabled={disabled}
          unknown={availableReady ? unknownNames(combo, availableNames) : []}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

/** A drafted extension whose catalog entry declares a settings schema. */
export interface ConfigurableExtension {
  readonly name: string;
  readonly schema: JsonSchema;
}

/** The combo under construction: the extension picker, one settings form per drafted
 *  configurable extension, the duplicate note, and the Add/Update + Cancel actions. */
export function ComboDraftEditor({
  available,
  draft,
  onDraftChange,
  configurable,
  draftConfigs,
  onDraftConfigChange,
  isDuplicate,
  canAdd,
  editing,
  disabled,
  idPrefix,
  onCommit,
  onReset,
}: {
  readonly available: readonly Extension[];
  readonly draft: string[];
  readonly onDraftChange: (draft: string[]) => void;
  readonly configurable: readonly ConfigurableExtension[];
  readonly draftConfigs: Readonly<Record<string, Record<string, unknown> | undefined>>;
  readonly onDraftConfigChange: (name: string, change: ExtensionConfigChange) => void;
  readonly isDuplicate: boolean;
  readonly canAdd: boolean;
  readonly editing: number | null;
  readonly disabled: boolean | undefined;
  readonly idPrefix: string;
  readonly onCommit: () => void;
  readonly onReset: () => void;
}): ReactNode {
  return (
    <div className="tai-stack tai-stack-2">
      <ExtensionPicker
        available={available}
        value={draft}
        onChange={onDraftChange}
        disabled={disabled}
        idPrefix={`${idPrefix}-draft`}
      />

      {configurable.map(({ name, schema }) => (
        <ExtensionConfigEditor
          // Re-seed the form when the draft target changes (a new draft vs a
          // specific combo pulled in for edit).
          key={`${editing === null ? 'new' : String(editing)}-${name}`}
          name={name}
          schema={schema}
          value={draftConfigs[name]}
          onChange={(change) => {
            onDraftConfigChange(name, change);
          }}
          disabled={disabled}
          idPrefix={`${idPrefix}-settings-${name}`}
        />
      ))}

      {isDuplicate ? (
        <p role="alert" className="tai-field-error">
          <XCircleIcon />
          This extension set is already added.
        </p>
      ) : null}

      <div className="tai-row">
        <Button type="button" variant="primary" onClick={onCommit} disabled={!canAdd}>
          {editing === null ? 'Add extension set' : 'Update extension set'}
        </Button>
        {editing !== null ? (
          <Button type="button" onClick={onReset} disabled={disabled}>
            Cancel edit
          </Button>
        ) : null}
      </div>
    </div>
  );
}
