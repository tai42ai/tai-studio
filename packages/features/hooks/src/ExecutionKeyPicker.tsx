/**
 * Picks the api key a fire RUNS AS, on both fire-path forms. Lists only — the
 * server decides, and the host form renders its refusal verbatim.
 */
import type { ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ErrorState, Field, Select, errorMessage, useApi } from '@tai42/studio-sdk';
import type { TokensPayload } from '@tai42/api-client';

import { tokensPayloadKey } from './keys';
import { isExecutionKeyListEmpty } from './fire-path-gate';

/** The api-key list; the picker and its host form share one request. */
export function useExecutionKeys(): UseQueryResult<TokensPayload> {
  const api = useApi();
  return useQuery({
    queryKey: tokensPayloadKey,
    queryFn: ({ signal }) => api.listTokensPayload(signal),
  });
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

export function ExecutionKeyPicker({
  value,
  onValueChange,
  error,
}: {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** The host form's required-field error, shown under the control. */
  readonly error?: string | undefined;
}): ReactNode {
  const keysQuery = useExecutionKeys();
  const listEmpty = isExecutionKeyListEmpty(keysQuery);

  return (
    <Field
      label="Execution key"
      description="The api key this fire runs AS. Every tool call it makes is authorized against that key's live grants — prefer a least-privilege service key over a human's broad one."
      // Suppressed: the empty note / the ErrorState already say it.
      error={listEmpty || keysQuery.isError ? undefined : error}
      // Only the Select branch claims the field's control id; the error and
      // empty branches render no labelable element, so `for` would dangle.
      group={keysQuery.isError || listEmpty}
    >
      {keysQuery.isError ? (
        <ErrorState
          message={errorMessage(keysQuery.error)}
          onRetry={() => void keysQuery.refetch()}
        />
      ) : listEmpty ? (
        <p role="status" style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          No api keys available to run as. Mint one on the settings API-keys tab first.
        </p>
      ) : (
        <Select
          aria-label="Execution key"
          options={pickableKeys(keysQuery.data ?? []).map((key) => ({
            value: key.user_id,
            label: keyLabel(key),
          }))}
          value={value}
          placeholder={keysQuery.isPending ? 'Loading keys…' : 'Select an execution key'}
          disabled={keysQuery.isPending}
          onValueChange={onValueChange}
        />
      )}
    </Field>
  );
}
