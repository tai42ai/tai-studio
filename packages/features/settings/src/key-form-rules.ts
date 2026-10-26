/**
 * The checks the create and edit key dialogs run before sending, mirroring the
 * server's own refusals so the admin reads a plain message instead of a round-trip
 * error: a key needs a description, and it needs at least one scope or a condition
 * (a key with neither grants nothing, so the server refuses it).
 */
import type { TemplatedText } from '@tai42/api-client';

import { FULL_ACCESS_SCOPE } from './api-keys-gating';

export const DESCRIPTION_REQUIRED = 'A description is required.';

/** The refusal for a key with no scope and no condition; it names Full access only when offered. */
export function scopeOrConditionRequired(fullAccessOffered: boolean): string {
  return fullAccessOffered
    ? 'Choose at least one scope or Full access, or set a condition under Policy. ' +
        'A key with none of them grants nothing.'
    : 'Choose at least one scope, or set a condition under Policy. ' +
        'A key with neither grants nothing.';
}

/** The scopes a key is saved with: exactly the universal scope under Full access. */
export function keyScopes(fullAccess: boolean, selected: ReadonlySet<string>): string[] {
  return fullAccess ? [FULL_ACCESS_SCOPE] : [...selected];
}

/**
 * The first refusal for the key about to be sent, or `null` when it may be sent.
 * `condition` is the condition the key will hold after the save (a stored one an
 * edit leaves untouched counts).
 */
export function keyFormError(input: {
  readonly description: string;
  readonly scopes: readonly string[];
  readonly condition: TemplatedText | null | undefined;
  /** Whether the dialog offers the Full access box. */
  readonly fullAccessOffered: boolean;
}): string | null {
  if (input.description.length === 0) return DESCRIPTION_REQUIRED;
  if (input.scopes.length === 0 && (input.condition ?? null) === null)
    return scopeOrConditionRequired(input.fullAccessOffered);
  return null;
}
