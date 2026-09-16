/**
 * The deployment's principals as a TanStack Query, keyed by {@link principalsKey}.
 * Admin-only (`GET /api/auth/principals` is a `secret` route), so the picker mounts
 * this only for a full projection; a create invalidates the key to refresh the list.
 */
import { useApi } from '@tai42/studio-sdk';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { principalsKey } from './keys';

export function usePrincipalsQuery(): UseQueryResult<
  Awaited<ReturnType<ReturnType<typeof useApi>['listPrincipals']>>
> {
  const api = useApi();
  return useQuery({
    queryKey: principalsKey,
    queryFn: ({ signal }) => api.listPrincipals(signal),
  });
}
