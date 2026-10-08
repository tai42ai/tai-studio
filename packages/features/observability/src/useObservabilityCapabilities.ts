/**
 * The monitoring backend's served capabilities (page ceiling, sorts, sort × filter
 * combinations, metrics). A pure declaration of the backend, so it is fetched once
 * per session and never goes stale.
 */
import { useApi } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';

import { capabilitiesKey } from './keys';

export function useObservabilityCapabilities() {
  const api = useApi();
  return useQuery({
    queryKey: capabilitiesKey,
    queryFn: ({ signal }) => api.getObservabilityCapabilities(signal),
    staleTime: Infinity,
  });
}
