/**
 * The fleet section: the backend identity card and the worker fleet card. The fleet
 * card renders unconditionally — the census and reload work over the worker bus with
 * or without a registered backend.
 */
import { useApi } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { BackendCard } from './BackendCard';
import { backendInfoKey } from './keys';
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
