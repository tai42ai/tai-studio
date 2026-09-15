/**
 * The worker-fleet census + the reload-config action. The census reads bus presence
 * directly and needs no backend, so it renders independently of the backend identity;
 * a failed presence read surfaces as a loud error, never a fabricated empty fleet.
 *
 * The census is an UNFENCED read (never gated). The reload is the admin-only fleet
 * soft-restart: it gates on the caller reaching `POST /api/fleet/reload-config`. Fail
 * closed while the projection is not ready; once ready and denied, the button is not
 * rendered so a non-admin never sees a control that 403s.
 */
import { type FleetResult, summarizeFleetResult } from '@tai42/api-client';
import {
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  FleetReport,
  Skeleton,
  Spinner,
  useApi,
  useCanWrite,
  useCapabilities,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { cardHeaderStyle, readOnlyNoteStyle } from './cardChrome';
import { FleetWorkersTable } from './FleetWorkersTable';
import { fleetWorkersKey } from './keys';
import { ReloadConfigDialog } from './ReloadConfigDialog';
import { useWorkerSelection } from './useWorkerSelection';

/** The fleet census poll cadence; react-query pauses the interval on a hidden tab. */
const FLEET_POLL_MS = 5000;

/** The admin-fenced reload route the reload control gates on (projection ⊆ gate). */
const FLEET_RELOAD_ROUTE = '/api/fleet/reload-config';

/** The last reload's outcome: a calm converged note, or the honest per-worker failure
 * report — never faked success on a departed / timed_out / failed worker. */
function ReloadSummary({ result }: { readonly result: FleetResult | null }): ReactNode {
  if (result === null) return null;
  const summary = summarizeFleetResult(result);
  if (summary.status === 'converged') {
    return (
      <p
        role="status"
        style={{ margin: '0 0 var(--tai-space-4)', color: 'var(--tai-color-ok-text)' }}
      >
        Reload converged across the fleet.
      </p>
    );
  }
  return (
    <div style={{ marginBottom: 'var(--tai-space-4)' }}>
      <FleetReport summary={summary} action="reload" />
    </div>
  );
}

export function WorkersCard(): ReactNode {
  const api = useApi();
  const workers = useQuery({
    queryKey: fleetWorkersKey,
    queryFn: ({ signal }) => api.listFleetWorkers(signal),
    refetchInterval: FLEET_POLL_MS,
  });

  const { state } = useCapabilities();
  const canReloadFleet = useCanWrite(FLEET_RELOAD_ROUTE, 'POST');
  const hideReload = state.status === 'ready' && !canReloadFleet;

  const [confirming, setConfirming] = useState(false);
  // The last successful reload's per-worker report, kept so it persists after the
  // dialog closes; cleared when the operator opens a fresh reload.
  const [lastReloaded, setLastReloaded] = useState<FleetResult | null>(null);

  const rows = workers.data?.workers ?? [];
  const selection = useWorkerSelection(rows);

  let body: ReactNode;
  if (workers.isPending) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  } else if (workers.isError) {
    body = (
      <ErrorState message={errorMessage(workers.error)} onRetry={() => void workers.refetch()} />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        title="No live workers"
        description="No workers are currently registered in the fleet census."
      />
    );
  } else {
    body = (
      <FleetWorkersTable
        workers={rows}
        selected={selection.selected}
        allSelected={selection.allSelected}
        onToggle={selection.toggle}
        onToggleAll={selection.toggleAll}
      />
    );
  }

  return (
    <Card>
      <div style={cardHeaderStyle}>
        <h2 className="tai-card-title">Workers{workers.data ? ` (${String(rows.length)})` : ''}</h2>
        <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
          <Button
            onClick={() => void workers.refetch()}
            disabled={workers.isFetching}
            aria-label="Refresh workers"
          >
            {workers.isFetching ? <Spinner label="Refreshing workers" /> : null}
            Refresh
          </Button>
          {hideReload ? null : (
            <Button
              variant="primary"
              disabled={!canReloadFleet}
              onClick={() => {
                // Starting a fresh reload clears any prior report before the clean dialog mounts.
                setLastReloaded(null);
                setConfirming(true);
              }}
            >
              {selection.reloadLabel}
            </Button>
          )}
        </div>
      </div>

      {hideReload ? (
        <p
          role="note"
          data-testid="reload-read-only-note"
          style={{ ...readOnlyNoteStyle, marginBottom: 'var(--tai-space-4)' }}
        >
          Reloading worker config is an admin action.
        </p>
      ) : null}

      <ReloadSummary result={lastReloaded} />

      {body}

      {confirming ? (
        <ReloadConfigDialog
          targets={selection.targets}
          onReloaded={(result) => {
            setLastReloaded(result);
            setConfirming(false);
          }}
          onClose={() => {
            setConfirming(false);
          }}
        />
      ) : null}
    </Card>
  );
}
