/**
 * The pluggable-kind status table: one row per kind with its active/default/off state,
 * the serving plugin/module (when known), and a short detail. Every server-supplied
 * string renders as escaped React text, never an HTML sink.
 */
import type { KindStatus } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  ScrollRegion,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { cardHeaderStyle, monoStyle } from './cardChrome';
import { systemKindsKey } from './keys';

/** Badge variant per kind state: `active` reads success, `default` (a built-in
 * fallback) a warning worth an eye, `off` (nothing registered) a calm neutral. */
const KIND_STATE_VARIANT: Record<KindStatus['state'], string> = {
  active: 'success',
  default: 'warning',
  off: 'neutral',
};

export function KindsCard(): ReactNode {
  const api = useApi();
  const kinds = useQuery({
    queryKey: systemKindsKey,
    queryFn: ({ signal }) => api.getSystemKinds(signal),
  });

  let body: ReactNode;
  if (kinds.isPending) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  } else if (kinds.isError) {
    body = <ErrorState message={errorMessage(kinds.error)} onRetry={() => void kinds.refetch()} />;
  } else if (kinds.data.length === 0) {
    body = (
      <EmptyState
        title="No plugin kinds reported"
        description="The kind-status endpoint returned no rows."
      />
    );
  } else {
    body = (
      <ScrollRegion label="Plugin kinds">
        <Table>
          <THead>
            <TR>
              <TH>Kind</TH>
              <TH>State</TH>
              <TH>Plugin</TH>
              <TH>Detail</TH>
            </TR>
          </THead>
          <TBody>
            {kinds.data.map((row) => (
              <TR key={row.kind}>
                <TD style={monoStyle}>{row.kind}</TD>
                <TD>
                  <Badge variant={KIND_STATE_VARIANT[row.state]}>{row.state}</Badge>
                </TD>
                <TD style={monoStyle}>{row.plugin ?? '—'}</TD>
                <TD>{row.detail}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
    );
  }

  return (
    <Card>
      <div style={cardHeaderStyle}>
        <h2 className="tai-card-title">Plugin kinds</h2>
        <Button
          onClick={() => void kinds.refetch()}
          disabled={kinds.isFetching}
          aria-label="Refresh plugin kinds"
        >
          Refresh
        </Button>
      </div>
      {body}
    </Card>
  );
}
