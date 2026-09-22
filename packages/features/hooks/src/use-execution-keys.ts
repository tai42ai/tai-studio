/**
 * The api-key list read the fire-path forms run the shared `ExecutionKeyPicker`
 * over. The picker itself is presentational (in the SDK); this feature owns the
 * query, so the picker and the SDK stay free of a data-fetching library.
 */
import type { TokensPayload } from '@tai42/api-client';
import { useApi } from '@tai42/studio-sdk';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { tokensPayloadKey } from './keys';

/** The api-key list; the picker and its host form share one request. */
export function useExecutionKeys(): UseQueryResult<TokensPayload> {
  const api = useApi();
  return useQuery({
    queryKey: tokensPayloadKey,
    queryFn: ({ signal }) => api.listTokensPayload(signal),
  });
}
