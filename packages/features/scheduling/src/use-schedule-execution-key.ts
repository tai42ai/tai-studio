/**
 * The api-key list read the add-schedule dialog runs the shared `ExecutionKeyPicker`
 * over. A schedule's execution key is OPTIONAL (only a door-contract jq requires one),
 * so the picker is presentational and this feature owns the query.
 */
import type { TokensPayload } from '@tai42/api-client';
import { tokensPayloadKey, useApi } from '@tai42/studio-sdk';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

/** The api-key list; one shared request for the schedule dialog. */
export function useScheduleExecutionKeys(): UseQueryResult<TokensPayload> {
  const api = useApi();
  return useQuery({
    queryKey: tokensPayloadKey,
    queryFn: ({ signal }) => api.listTokensPayload(signal),
  });
}
