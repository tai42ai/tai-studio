/** The operational health card: the plain-text `/health` skeleton endpoint read
 * through TanStack Query, surfaced as a Healthy badge, a loud error, or the raw body. */
import { Badge, Card, errorMessage, ErrorState, Skeleton, useApi } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { cardHeaderStyle } from './cardChrome';
import { healthKey } from './keys';

/** The body a healthy skeleton returns from `/health`. */
const HEALTHY_BODY = 'OK';

export function HealthCard(): ReactNode {
  const api = useApi();
  const health = useQuery({
    queryKey: healthKey,
    queryFn: ({ signal }) => api.getHealth(signal),
  });

  return (
    <Card>
      <div style={cardHeaderStyle}>
        <h2 className="tai-card-title">Health</h2>
      </div>
      {health.isPending ? (
        <Skeleton width={96} height={22} />
      ) : health.isError ? (
        <ErrorState message={errorMessage(health.error)} onRetry={() => void health.refetch()} />
      ) : health.data === HEALTHY_BODY ? (
        <Badge variant="success">Healthy</Badge>
      ) : (
        <Badge variant="warning">{health.data}</Badge>
      )}
    </Card>
  );
}
