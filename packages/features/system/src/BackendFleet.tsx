/**
 * The fleet section: the backend identity card and the worker fleet card. The fleet
 * card renders unconditionally — the census and reload work over the worker bus with
 * or without a registered backend.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@tai42/studio-sdk';

import { backendInfoKey } from './keys';
import { BackendCard } from './BackendCard';
import { WorkersCard } from './WorkersCard';

export function BackendFleet(): ReactNode {
  const api = useApi();
  const info = useQuery({
    queryKey: backendInfoKey,
    queryFn: ({ signal }) => api.getBackendInfo(signal),
  });

  return (
    <>
      <BackendCard info={info} />
      <WorkersCard />
    </>
  );
}
