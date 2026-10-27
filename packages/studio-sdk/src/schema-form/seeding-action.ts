/**
 * The state behind a control that seeds a fresh value on a user action: a list's
 * "Add item", a map's "Add entry", a nested level's "Add", and the union variant
 * picker's switch. Seeding throws {@link NoFiniteValueError} when the schema admits no
 * finite value, and a throw inside an event handler never reaches an error boundary,
 * so that failure is logged and kept as the field's error message. Only the seed runs
 * inside the catch, and only that error type is caught: the caller commits the value
 * (its `onChange`) outside it, so every other error propagates as thrown.
 *
 * A failure belongs to the `subject` it was raised for (the schema identity the
 * caller seeds from): when the same field later draws a different subject, the
 * failure is no longer reported. The next successful seed clears it.
 */
import { useState } from 'react';

import { NoFiniteValueError } from './default-value';

/** A seed attempt's outcome: the seeded value, or a failure now shown on the field. */
export type SeedOutcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

export interface SeedingAction {
  /** The failure message for the current subject, or `undefined` when there is none. */
  readonly failure: string | undefined;
  /** Run `make`, the seeding step; a {@link NoFiniteValueError} becomes the failure. */
  readonly seed: (make: () => unknown) => SeedOutcome;
}

export function useSeedingAction(subject: object): SeedingAction {
  const [failed, setFailed] = useState<{ subject: object; message: string } | undefined>(undefined);
  const seed = (make: () => unknown): SeedOutcome => {
    let value: unknown;
    try {
      value = make();
    } catch (error) {
      if (!(error instanceof NoFiniteValueError)) throw error;
      console.error('SchemaForm: seeding a new value failed', error);
      setFailed({ subject, message: error.message });
      return { ok: false };
    }
    setFailed(undefined);
    return { ok: true, value };
  };
  return { failure: failed?.subject === subject ? failed.message : undefined, seed };
}
