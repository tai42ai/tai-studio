/**
 * The create form's footer: Cancel, the dry-run Validate, and the primary Create
 * (a form submit). Validate and Create are both withdrawn when the versioning store
 * is off, and each shows a spinner while its request is in flight.
 */
import type { ReactNode } from 'react';

import { Button, Spinner } from '@tai42/studio-sdk';

export function PresetFormActions({
  onCancel,
  onValidate,
  canValidate,
  validatePending,
  createPending,
  outputValid,
  extensionsValid,
  versioningDisabled,
}: {
  readonly onCancel: () => void;
  readonly onValidate: () => void;
  readonly canValidate: boolean;
  readonly validatePending: boolean;
  readonly createPending: boolean;
  readonly outputValid: boolean;
  readonly extensionsValid: boolean;
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
        disabled={createPending || !outputValid || !extensionsValid || versioningDisabled}
      >
        {createPending ? <Spinner label="Creating preset" /> : null}
        Create preset
      </Button>
    </div>
  );
}
