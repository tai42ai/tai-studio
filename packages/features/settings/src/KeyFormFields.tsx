/**
 * The shared identity/description/scope fields for the API-key create and edit
 * dialogs. State-free: the User ID renders editable when `onUserIdChange` is given
 * (create) and read-only when it is absent (edit, where the identity is fixed).
 */
import { TextInput } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { fieldLabelStyle } from './api-keys-styles';
import { ScopePicker } from './ScopePicker';

export function KeyFormFields({
  idPrefix,
  userId,
  onUserIdChange,
  description,
  onDescriptionChange,
  scopeIds,
  selected,
  onSelectedChange,
}: {
  readonly idPrefix: string;
  readonly userId: string;
  /** When given, the User ID is editable (create); absent renders it read-only (edit). */
  readonly onUserIdChange?: (value: string) => void;
  readonly description: string;
  readonly onDescriptionChange: (value: string) => void;
  readonly scopeIds: readonly string[];
  readonly selected: ReadonlySet<string>;
  readonly onSelectedChange: (next: Set<string>) => void;
}): ReactNode {
  const editableUser = onUserIdChange !== undefined;
  return (
    <>
      <div>
        <label style={fieldLabelStyle} htmlFor={`${idPrefix}-user`}>
          User ID
        </label>
        <TextInput
          id={`${idPrefix}-user`}
          aria-label="User ID"
          value={userId}
          disabled={!editableUser}
          autoComplete={editableUser ? 'off' : undefined}
          onChange={
            editableUser
              ? (event) => {
                  onUserIdChange(event.target.value);
                }
              : undefined
          }
        />
      </div>
      <div>
        <label style={fieldLabelStyle} htmlFor={`${idPrefix}-desc`}>
          Description
        </label>
        <TextInput
          id={`${idPrefix}-desc`}
          aria-label="Description"
          value={description}
          autoComplete="off"
          onChange={(event) => {
            onDescriptionChange(event.target.value);
          }}
        />
      </div>
      <div>
        <span style={fieldLabelStyle}>Scopes</span>
        <ScopePicker
          scopeIds={scopeIds}
          selected={selected}
          disabled={false}
          onToggle={(scopeId, next) => {
            const updated = new Set(selected);
            if (next) updated.add(scopeId);
            else updated.delete(scopeId);
            onSelectedChange(updated);
          }}
        />
      </div>
    </>
  );
}
