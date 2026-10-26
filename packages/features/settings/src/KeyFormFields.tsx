/**
 * The shared identity/description/scope fields for the API-key create and edit
 * dialogs. State-free: the key user ID renders editable when `onUserIdChange` is
 * given (create) and read-only when it is absent (edit, where the identity is fixed).
 * Each field carries a one-line description, wired to its control through `Field`.
 */
import { Field, TextInput } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { ScopePicker } from './ScopePicker';

export const KEY_USER_ID_LABEL = 'Key user ID';

export const KEY_USER_ID_HINT =
  'Required. A new, unique ID the key acts as, such as ci-runner. It cannot be changed later.';

export const KEY_USER_ID_FIXED_HINT = 'The ID the key acts as. It cannot be changed.';

export const DESCRIPTION_HINT = 'Required. A short note on what the key is for.';

/** The Scopes field's description; it names Full access only when that box is offered. */
export function scopesHint(fullAccessOffered: boolean): string {
  return fullAccessOffered
    ? 'What the key may call. Pick at least one scope or Full access, unless you set a condition under Policy.'
    : 'What the key may call. Pick at least one scope, unless you set a condition under Policy.';
}

export function KeyFormFields({
  userId,
  onUserIdChange,
  description,
  onDescriptionChange,
  scopeIds,
  selected,
  onSelectedChange,
  fullAccess,
  fullAccessAvailable,
  onFullAccessChange,
}: {
  readonly userId: string;
  /** When given, the user ID is editable (create); absent renders it read-only (edit). */
  readonly onUserIdChange?: (value: string) => void;
  readonly description: string;
  readonly onDescriptionChange: (value: string) => void;
  readonly scopeIds: readonly string[];
  readonly selected: ReadonlySet<string>;
  readonly onSelectedChange: (next: Set<string>) => void;
  readonly fullAccess: boolean;
  readonly fullAccessAvailable: boolean;
  readonly onFullAccessChange: (next: boolean) => void;
}): ReactNode {
  const editableUser = onUserIdChange !== undefined;
  return (
    <>
      <Field
        label={KEY_USER_ID_LABEL}
        description={editableUser ? KEY_USER_ID_HINT : KEY_USER_ID_FIXED_HINT}
      >
        <TextInput
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
      </Field>
      <Field label="Description" description={DESCRIPTION_HINT}>
        <TextInput
          value={description}
          autoComplete="off"
          onChange={(event) => {
            onDescriptionChange(event.target.value);
          }}
        />
      </Field>
      <Field label="Scopes" description={scopesHint(fullAccessAvailable)} group>
        <ScopePicker
          scopeIds={scopeIds}
          selected={selected}
          disabled={false}
          fullAccess={fullAccess}
          fullAccessAvailable={fullAccessAvailable}
          onFullAccessChange={onFullAccessChange}
          onToggle={(scopeId, next) => {
            const updated = new Set(selected);
            if (next) updated.add(scopeId);
            else updated.delete(scopeId);
            onSelectedChange(updated);
          }}
        />
      </Field>
    </>
  );
}
