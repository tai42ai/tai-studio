/**
 * The verifier picker for the bind-topic form, fed ONLY by `GET /api/hooks/verifiers`.
 * Four-state: loading disables the picker; a load error is loud with retry; an EMPTY
 * registry is an honest inline note (with a marketplace link) that disables submit; a
 * ready registry offers the names. The `<Field>` marks itself `group` on the
 * error/empty branches, where no labelable control claims its id.
 */
import { AppLink, errorMessage, ErrorState, Field, Select } from '@tai42/studio-sdk';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

export interface VerifierSelectFieldProps {
  readonly verifiersQuery: UseQueryResult<readonly string[]>;
  readonly verifier: string;
  readonly setVerifier: (value: string) => void;
  readonly submitted: boolean;
  readonly verifierMissing: boolean;
  readonly catalogEmpty: boolean;
}

export function VerifierSelectField({
  verifiersQuery,
  verifier,
  setVerifier,
  submitted,
  verifierMissing,
  catalogEmpty,
}: VerifierSelectFieldProps): ReactNode {
  return (
    <Field
      label="Verifier"
      error={submitted && verifierMissing && !catalogEmpty ? 'A verifier is required.' : undefined}
      // Only the Select branch claims the field's control id; the error and
      // empty branches render no labelable element, so `for` would dangle.
      group={verifiersQuery.isError || catalogEmpty}
    >
      {verifiersQuery.isError ? (
        <ErrorState
          message={errorMessage(verifiersQuery.error)}
          onRetry={() => void verifiersQuery.refetch()}
        />
      ) : catalogEmpty ? (
        <p role="status" style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          No webhook verifiers registered.{' '}
          <AppLink to="marketplace" search={{ kind: 'webhook-verifier' }} className="tai-link">
            Browse marketplace
          </AppLink>
        </p>
      ) : (
        <Select
          options={(verifiersQuery.data ?? []).map((name) => ({ value: name, label: name }))}
          value={verifier}
          placeholder={verifiersQuery.isPending ? 'Loading verifiers…' : 'Select a verifier'}
          disabled={verifiersQuery.isPending}
          onValueChange={setVerifier}
        />
      )}
    </Field>
  );
}
