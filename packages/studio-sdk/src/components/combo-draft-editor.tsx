/**
 * `ExtensionComboBuilder`'s editor for the combo under construction: the extension
 * picker, a settings form per configurable drafted extension, and the commit actions.
 */
import type { Extension } from '@tai42/api-client';
import type { ReactNode } from 'react';

import type { JsonSchema } from '../schema-form/types';
import { type ExtensionConfigChange, ExtensionConfigEditor } from './extension-config-editor';
import { ExtensionPicker } from './extension-picker';
import { XCircleIcon } from './icons';
import { Button } from './primitives';

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
