/**
 * The `/system` feature page: operational health + the worker fleet.
 *
 * Health is a plain-text skeleton ops endpoint (`/health`) read through `useApi()`
 * and TanStack Query. The fleet section reads the backend
 * IDENTITY (`getBackendInfo`, distinct from the fleet) alongside the live bus
 * presence census (`listFleetWorkers` — every subscribed worker, ASGI +
 * backend-runtime) and the fleet soft-restart (`reloadFleetConfig`). The census and
 * reload run over the worker bus whether or not a task backend is registered, so
 * they render independently of the backend identity.
 *
 * Each surface renders its own state machine — loading → `<Skeleton>`, error →
 * `<ErrorState>` (loud, always visible; a 401 is not special-cased), empty →
 * `<EmptyState>` — so a failed request is never a silent empty render. The census
 * door is deliberately honest: a 500 (the presence store failing) surfaces as a
 * loud error, never a fabricated empty fleet. A reload's per-worker fleet report is
 * rendered honestly through the shared `<FleetReport>` — a `departed` / `timed_out`
 * / `failed` worker or an unreachable bus is a loud, visible state, never faked
 * success. All server-supplied text renders as escaped React text (a `<Badge>`
 * label, a worker name), never through an HTML sink.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  summarizeFleetResult,
  type BackendInfo,
  type FleetResult,
  type FleetWorker,
  type KindStatus,
  type WorkerState,
} from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FleetReport,
  PageHeader,
  ScrollRegion,
  Skeleton,
  Spinner,
  Stack,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tooltip,
  errorMessage,
  useApi,
  useCanWrite,
  useCapabilities,
  type PageProps,
} from '@tai42/studio-sdk';

import { backendInfoKey, fleetWorkersKey, healthKey, systemKindsKey } from './keys';

/** The body a healthy skeleton returns from `/health`. */
const HEALTHY_BODY = 'OK';

/**
 * The admin-only fleet soft-restart door. `POST /api/fleet/reload-config` is
 * admin-fenced server-side (a non-admin 403s), so the reload control gates on the
 * caller's projection reaching this exact route+method (projection ⊆ gate). The
 * census (`GET /api/fleet/workers`) is an UNFENCED read and is never gated.
 */
const FLEET_RELOAD_ROUTE = '/api/fleet/reload-config';

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-4)',
  marginBottom: 'var(--tai-space-4)',
};

const monoStyle: CSSProperties = { fontFamily: 'var(--tai-font-mono)' };

const readOnlyNoteStyle: CSSProperties = {
  margin: 0,
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

/** The fleet census poll cadence. The transient `resyncing`/`recycling` states and a
 * ticking seen-since are unobservable without it; react-query pauses the interval while
 * the document is hidden (`refetchIntervalInBackground` defaults to `false`). */
const FLEET_POLL_MS = 5000;

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** Largest-first, so the first unit whose span the gap reaches is the one used. */
const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 minutes ago" / "now" for an ISO instant — the seen-since label. A value that does
 * not parse renders verbatim rather than collapsing into a placeholder that hides bad
 * data. `nowMs` is injectable so a render is deterministic under test. */
function formatRelativeInstant(iso: string, nowMs: number = Date.now()): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const deltaSeconds = (ms - nowMs) / 1000;
  for (const [unit, span] of RELATIVE_UNITS) {
    if (Math.abs(deltaSeconds) >= span) {
      return RELATIVE_TIME.format(Math.round(deltaSeconds / span), unit);
    }
  }
  return RELATIVE_TIME.format(0, 'second');
}

/** The full local rendering of an ISO instant — the seen-since / last-op tooltip. */
function formatAbsoluteInstant(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}

/** The badge tone per written lifecycle state: `ready` (converged) reads positive; the
 * transient `resyncing`/`recycling` restart states read as warnings worth an operator's
 * eye. A server-computed `stale` flag is handled separately and wins over these. */
const WORKER_STATE_VARIANT: Record<WorkerState, string> = {
  ready: 'success',
  resyncing: 'warning',
  recycling: 'warning',
};

/** The state a worker row advertises, rendered as a badge. The SERVER-computed `stale`
 * flag WINS over the written state: a decayed row is quiet (reconnecting or dead,
 * unknown until it returns or its TTL expires) whatever it last wrote, so it reads
 * `stale`, never `ready`. The tone reinforces the label, never replaces it. */
function workerStateBadge(worker: FleetWorker): { label: string; variant: string } {
  if (worker.stale) return { label: 'stale', variant: 'warning' };
  return { label: worker.state, variant: WORKER_STATE_VARIANT[worker.state] };
}

// -- Health ------------------------------------------------------------------

function HealthCard(): ReactNode {
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

// -- Backend fleet -----------------------------------------------------------

/** The calm empty state for the backend identity card when no task backend plugin is
 * registered — a statement about identity only, not the worker fleet (the census and
 * reload below run over the bus regardless). */
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

/** The backend identity card. `present: false` (a 200, never an error) is the calm
 * empty state; a genuine failure of the identity door surfaces loudly. */
function BackendCard({ info }: { info: UseQueryResult<BackendInfo> }): ReactNode {
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

/** The reload-config confirmation. A self-contained dialog that owns its own
 * mutation and is mounted only while the operator is confirming, so any close
 * discards the mutation's error state — a reopened dialog always starts clean. On
 * success it invalidates the census and hands the per-worker fleet report back
 * through `onReloaded` so the card can render it after this (now-unmounted) dialog
 * closes. */
function ReloadConfigDialog({
  targets,
  onReloaded,
  onClose,
}: {
  targets: string[] | null;
  onReloaded: (result: FleetResult) => void;
  onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const reload = useMutation({
    mutationFn: () => api.reloadFleetConfig(targets),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: fleetWorkersKey });
      onReloaded(result);
    },
  });

  return (
    <ConfirmDialog
      title="Reload worker config"
      confirmLabel="Reload config"
      pendingLabel="Reloading config"
      confirmVariant="primary"
      isPending={reload.isPending}
      error={reload.error}
      onConfirm={() => {
        reload.mutate();
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        {targets === null
          ? 'Soft-restart every worker in the fleet? '
          : `Soft-restart ${String(targets.length)} selected worker${targets.length === 1 ? '' : 's'}? `}
        Each targeted worker re-reads its environment and reloads its manifest registries.
      </p>
    </ConfirmDialog>
  );
}

/** The worker-fleet census + the reload-config action. The census reads bus presence
 * directly and needs no backend, so it renders independently of the backend identity;
 * a failed presence read surfaces as a loud error, never a fabricated empty fleet. */
function WorkersCard(): ReactNode {
  const api = useApi();
  const workers = useQuery({
    queryKey: fleetWorkersKey,
    queryFn: ({ signal }) => api.listFleetWorkers(signal),
    // Poll while the page is visible: the transient resyncing/recycling states and the
    // ticking seen-since only surface under a poll (react-query pauses on a hidden tab).
    refetchInterval: FLEET_POLL_MS,
  });

  // The census above is an unfenced read (never gated). The reload BELOW is the
  // admin-only fleet soft-restart: gate it on the caller reaching `POST
  // /api/fleet/reload-config`. Fail closed while the projection is not ready
  // (`useCanWrite` is `false` until `ready`) — the control renders disabled; once
  // ready and denied, the button is not rendered at all so a non-admin never sees a
  // button that 403s. Only the reload action is gated; the worker list stays visible.
  const { state } = useCapabilities();
  const canReloadFleet = useCanWrite(FLEET_RELOAD_ROUTE, 'POST');
  const ready = state.status === 'ready';
  const hideReload = ready && !canReloadFleet;

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  // The last successful reload's per-worker report, kept so it persists after the
  // dialog closes; cleared when the operator opens a fresh reload.
  const [lastReloaded, setLastReloaded] = useState<FleetResult | null>(null);

  const rows = workers.data?.workers ?? [];
  // Derive the payload + count only from workers still served, so a selection left
  // over from a since-refreshed fleet never reloads a worker that has left. Reload
  // targets are worker NAMES.
  const selectedWorkers = rows.filter((worker) => selected.has(worker.name));
  const allSelected = rows.length > 0 && selectedWorkers.length === rows.length;
  const targets: string[] | null =
    selectedWorkers.length === 0 ? null : selectedWorkers.map((worker) => worker.name);
  const reloadLabel =
    selectedWorkers.length === 0
      ? 'Reload config (all)'
      : `Reload config (${String(selectedWorkers.length)} selected)`;

  function toggle(name: string, next: boolean): void {
    setSelected((current) => {
      const updated = new Set(current);
      if (next) updated.add(name);
      else updated.delete(name);
      return updated;
    });
  }

  function toggleAll(next: boolean): void {
    setSelected(next ? new Set(rows.map((worker) => worker.name)) : new Set());
  }

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
      <ScrollRegion label="Live workers">
        <Table>
          <THead>
            <TR>
              <TH style={{ width: '1px' }}>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all workers"
                />
              </TH>
              <TH>Name</TH>
              <TH>Kind</TH>
              <TH>Life</TH>
              <TH>State</TH>
              <TH>Seen</TH>
              <TH>Last op</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((worker) => {
              const stateBadge = workerStateBadge(worker);
              return (
                <TR key={worker.name}>
                  <TD>
                    <Checkbox
                      checked={selected.has(worker.name)}
                      onCheckedChange={(next) => {
                        toggle(worker.name, next);
                      }}
                      aria-label={`Select ${worker.name}`}
                    />
                  </TD>
                  <TD style={monoStyle}>{worker.name}</TD>
                  <TD>
                    <Badge variant={worker.kind === 'backend' ? 'primary' : 'neutral'}>
                      {worker.kind}
                    </Badge>
                  </TD>
                  {/* Life = the worker's generation, a plain monotonic life counter. */}
                  <TD style={monoStyle}>{worker.generation}</TD>
                  <TD>
                    <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>
                  </TD>
                  {/* Seen-since = the relative last-beat time; the tooltip carries the
                      absolute last beat and the join instant. */}
                  <TD>
                    <Tooltip
                      content={`Last beat ${formatAbsoluteInstant(worker.beat_at)} · joined ${formatAbsoluteInstant(worker.joined_at)}`}
                    >
                      <span>{formatRelativeInstant(worker.beat_at)}</span>
                    </Tooltip>
                  </TD>
                  <TD>
                    {worker.last_op !== null ? (
                      <Tooltip content={formatAbsoluteInstant(worker.last_op.at)}>
                        <span>
                          {worker.last_op.op} · {worker.last_op.outcome}
                        </span>
                      </Tooltip>
                    ) : (
                      '—'
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </ScrollRegion>
    );
  }

  // The reload report: `converged` shows a calm success note, while a degraded /
  // unreachable broadcast renders the honest per-worker failure state — never faked
  // success on a departed / timed_out / failed worker.
  const reloadSummary = lastReloaded !== null ? summarizeFleetResult(lastReloaded) : null;

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
                // Starting a fresh reload clears any prior report before the clean
                // dialog mounts.
                setLastReloaded(null);
                setConfirming(true);
              }}
            >
              {reloadLabel}
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

      {reloadSummary !== null && reloadSummary.status === 'converged' ? (
        <p
          role="status"
          style={{
            margin: '0 0 var(--tai-space-4)',
            color: 'var(--tai-color-ok-text)',
          }}
        >
          Reload converged across the fleet.
        </p>
      ) : null}
      {reloadSummary !== null && reloadSummary.status !== 'converged' ? (
        <div style={{ marginBottom: 'var(--tai-space-4)' }}>
          <FleetReport summary={reloadSummary} action="reload" />
        </div>
      ) : null}

      {body}

      {confirming ? (
        <ReloadConfigDialog
          targets={targets}
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

/** The fleet section: the backend identity card and the worker fleet card. The fleet
 * card renders unconditionally — the census and reload work over the worker bus with
 * or without a registered backend. */
function BackendFleet(): ReactNode {
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

// -- Plugin kinds ------------------------------------------------------------

/** Badge variant per kind state: `active` (a real plugin serves it) reads as a
 * success; `default` (a built-in fallback serves it) reads as a warning worth an
 * operator's eye; `off` (nothing registered) is a calm neutral — a legal state,
 * never an alarm. */
const KIND_STATE_VARIANT: Record<KindStatus['state'], string> = {
  active: 'success',
  default: 'warning',
  off: 'neutral',
};

/** The pluggable-kind status table: one row per kind with its active/default/off
 * state, the serving plugin/module (when known), and a short detail. Every
 * server-supplied string renders as escaped React text, never an HTML sink. */
function KindsCard(): ReactNode {
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

// -- Page --------------------------------------------------------------------

/**
 * The system page. The `system` route carries no search parameters
 * ({@link PageProps}'s `search` is the empty object here), so the component
 * declares the shell's `PageProps<'system'>` contract for its call site but reads
 * nothing from it.
 */
export const SystemPage: (props: PageProps<'system'>) => ReactNode = () => (
  <Stack gap={6}>
    <PageHeader eyebrow="Administration" title="System" />
    <HealthCard />
    <BackendFleet />
    <KindsCard />
  </Stack>
);
