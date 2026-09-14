/**
 * The backend identity card (distinct from the worker fleet). `present: false` (a 200,
 * never an error) is the calm empty state; a genuine failure of the identity door
 * surfaces loudly.
 */
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { AppLink, Card, EmptyState, ErrorState, Skeleton, errorMessage } from '@tai42/studio-sdk';
import type { BackendInfo } from '@tai42/api-client';

import { cardHeaderStyle, monoStyle } from './cardChrome';

/** The calm empty state when no task backend plugin is registered — identity only. */
function noBackendState(): ReactNode {
  return (
    <EmptyState
      title="No execution backend registered"
      description="No task backend plugin is wired, so runs execute in-process. This reports the backend identity only; the worker fleet below is unaffected."
      action={
        <AppLink
          to="marketplace"
          search={{ kind: 'backend' }}
          className="tai-btn tai-btn-secondary"
        >
          Browse marketplace
        </AppLink>
      }
    />
  );
}

export function BackendCard({ info }: { readonly info: UseQueryResult<BackendInfo> }): ReactNode {
  return (
    <Card>
      <div style={cardHeaderStyle}>
        <h2 className="tai-card-title">Backend</h2>
      </div>
      {info.isPending ? (
        <Skeleton height={72} />
      ) : info.isError ? (
        <ErrorState message={errorMessage(info.error)} onRetry={() => void info.refetch()} />
      ) : !info.data.present ? (
        noBackendState()
      ) : (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 'var(--tai-space-2) var(--tai-space-4)',
            margin: 0,
          }}
        >
          <dt style={{ color: 'var(--tai-color-text-muted)' }}>Backend</dt>
          <dd style={{ margin: 0, ...monoStyle }}>{info.data.backend}</dd>
          <dt style={{ color: 'var(--tai-color-text-muted)' }}>Module</dt>
          <dd style={{ margin: 0, ...monoStyle }}>{info.data.module}</dd>
        </dl>
      )}
    </Card>
  );
}
