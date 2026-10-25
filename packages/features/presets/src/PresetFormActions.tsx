/**
 * The create form's footer: Cancel, the dry-run Validate, and the primary Create
 * (a form submit). Validate and Create are both withdrawn when the versioning store
 * is off, and each shows a spinner while its request is in flight.
 */
import { Button, Spinner } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

export function PresetFormActions({
  onCancel,
  onValidate,
  canValidate,
  validatePending,
  createPending,
  schemasValid,
  extensionsValid,
  kwargsRowsValid,
  versioningDisabled,
}: {
  readonly onCancel: () => void;
  readonly onValidate: () => void;
  readonly canValidate: boolean;
  readonly validatePending: boolean;
  readonly createPending: boolean;
  /** Both schema editors hold a parseable schema (or none). */
  readonly schemasValid: boolean;
  readonly extensionsValid: boolean;
  readonly kwargsRowsValid: boolean;
  readonly versioningDisabled: boolean;
}): ReactNode {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
      <Button type="button" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type="button"
        onClick={onValidate}
        disabled={!canValidate || validatePending || versioningDisabled}
      >
        {validatePending ? <Spinner label="Validating draft" /> : null}
        Validate
      </Button>
      <Button
        type="submit"
        variant="primary"
        disabled={
          createPending ||
          !schemasValid ||
          !extensionsValid ||
          !kwargsRowsValid ||
          versioningDisabled
        }
      >
        {createPending ? <Spinner label="Creating preset" /> : null}
        Create preset
      </Button>
    </div>
  );
}
