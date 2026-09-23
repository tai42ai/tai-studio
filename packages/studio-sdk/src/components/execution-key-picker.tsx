/**
 * Picks the api key a fire / recurring run RUNS AS. Shared by every fire-path form
 * (hooks, trigger links, schedules). Presentational and prop-driven — the host
 * feature owns the api-key list query and hands it in, so this component (and the
 * SDK) stay free of a data-fetching library, exactly as {@link ToolPicker} does.
 *
 * The server decides authorization; this only lists the pickable keys and renders
 * the read's loading / empty / error states. The host form renders the server's
 * refusal verbatim elsewhere.
 */
import type { TokensPayload } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { errorMessage } from '../errors';
import { Field } from './field';
import { ErrorState } from './primitives';
import { Select } from './select';

/**
 * The subset of the api-key list query this picker reads. A caller's TanStack
 * `UseQueryResult<TokensPayload>` satisfies it structurally, so the SDK names no
 * query library.
 */
export interface ExecutionKeyQuery {
  readonly data: TokensPayload | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly error: unknown;
  readonly refetch: () => void;
}

/** Resolved, and holding no key at all. */
export function isExecutionKeyListEmpty(query: ExecutionKeyQuery): boolean {
  return query.isSuccess && (query.data?.length ?? 0) === 0;
}

/** The mint's stable fingerprint (never key material), nested under `policy_data`. */
function keyFingerprint(key: TokensPayload[number]): string | undefined {
  const data = key.policy_data;
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>).key_fingerprint;
  return typeof value === 'string' ? value : undefined;
}

/** A key's label: its id, plus whichever of description / fingerprint it has. */
function keyLabel(key: TokensPayload[number]): string {
  const suffix = [key.description, keyFingerprint(key)]
    .filter((part) => part !== undefined && part !== '')
    .join(' · ');
  return suffix === '' ? key.user_id : `${key.user_id} — ${suffix}`;
}

/** One option per `user_id` (what a binding names), first occurrence wins. */
function pickableKeys(keys: TokensPayload): TokensPayload {
  const seen = new Set<string>();
  return keys.filter((key) => {
    if (seen.has(key.user_id)) return false;
    seen.add(key.user_id);
    return true;
  });
}

export interface ExecutionKeyPickerProps {
  /** The api-key list read the host feature owns and hands in. */
  readonly query: ExecutionKeyQuery;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** The host form's required-field error, shown under the control. */
  readonly error?: string | undefined;
}

export function ExecutionKeyPicker({
  query,
  value,
  onValueChange,
  error,
}: ExecutionKeyPickerProps): ReactNode {
  const listEmpty = isExecutionKeyListEmpty(query);

  return (
    <Field
      label="Execution key"
      description="The api key this fire runs AS. Every tool call it makes is authorized against that key's live grants — prefer a least-privilege service key over a human's broad one."
      // Suppressed: the empty note / the ErrorState already say it.
      error={listEmpty || query.isError ? undefined : error}
      // Only the Select branch claims the field's control id; the error and
      // empty branches render no labelable element, so `for` would dangle.
      group={query.isError || listEmpty}
    >
      {query.isError ? (
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => {
            query.refetch();
          }}
        />
      ) : listEmpty ? (
        <p role="status" style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          No api keys available to run as. Mint one on the settings API-keys tab first.
        </p>
      ) : (
        <Select
          options={pickableKeys(query.data ?? []).map((key) => ({
            value: key.user_id,
            label: keyLabel(key),
          }))}
          value={value}
          placeholder={query.isPending ? 'Loading keys…' : 'Select an execution key'}
          disabled={query.isPending}
          onValueChange={onValueChange}
        />
      )}
    </Field>
  );
}
