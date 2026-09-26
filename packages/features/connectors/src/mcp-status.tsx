/**
 * The STATUS surfaces over the mounted MCP servers: the bound-server table (with a
 * per-server reload) and the dedicated failed-server health section (reload one,
 * reload all, or deregister behind the house confirm).
 */
import type { FailedMcpEntry, FleetReportSummary } from '@tai42/api-client';
import {
  failedMcpsFromReport,
  isFleetReportFailure,
  summarizeFleetResult,
} from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  errorMessage,
  ErrorState,
  FleetReport,
  ScrollRegion,
  Skeleton,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useApi,
  useCanWrite,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { mcpFailedKey, mcpStatusKey } from './keys';

interface ServerRow {
  readonly title: string;
  readonly healthy: boolean;
  readonly detail: string;
}

function ServerStatusTable({ rows }: { rows: readonly ServerRow[] }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  // Every per-title reload resolves to the same templated-route gate, so one
  // static-placeholder check covers the table (a door that can only refuse is
  // never offered).
  const canReload = useCanWrite('/api/mcp-status/{title}/reload', 'POST');
  const reload = useMutation({
    mutationFn: (title: string) => api.reloadMcp(title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mcpStatusKey }),
  });

  return (
    <>
      <ScrollRegion label="MCP servers">
        <Table>
          <THead>
            <TR>
              <TH>Server</TH>
              <TH>Status</TH>
              <TH>Detail</TH>
              <TH>
                <span className="tai-visually-hidden">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => {
              const pending = reload.isPending && reload.variables === row.title;
              return (
                <TR key={row.title}>
                  <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{row.title}</TD>
                  <TD>
                    <Badge variant={row.healthy ? 'success' : 'danger'}>
                      {row.healthy ? 'bound' : 'failed'}
                    </Badge>
                  </TD>
                  <TD>{row.detail}</TD>
                  <TD>
                    {canReload ? (
                      <Button
                        type="button"
                        onClick={() => {
                          reload.mutate(row.title);
                        }}
                        disabled={pending}
                      >
                        {pending ? <Spinner label={`Reloading ${row.title}`} /> : null}
                        Reload
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </ScrollRegion>
      {reload.isError ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <ErrorState message={errorMessage(reload.error)} />
        </div>
      ) : null}
      {/* A single-MCP reload broadcasts to the fleet; surface any failed propagation
          honestly (nothing on a converged reload). */}
      {reload.isSuccess ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <FleetReport summary={summarizeFleetResult(reload.data)} action="reload" />
        </div>
      ) : null}
    </>
  );
}

export function McpStatusSection(): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: mcpStatusKey,
    queryFn: ({ signal }) => api.getMcpStatus(signal),
  });

  if (query.isPending) return <Skeleton height={72} />;
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  // The MOUNTED table lists the servers that BOUND successfully; the ones the
  // viability check skipped live in the dedicated failed-servers health section
  // below (with their own remediation), so a failure is never buried in a status row.
  const rows: ServerRow[] = Object.entries(query.data.bound).map(([title, tools]) => ({
    title,
    healthy: true,
    detail: `${String(tools.length)} tool${tools.length === 1 ? '' : 's'}`,
  }));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No MCP servers are bound"
        description="Add a server in the config below, then save. Servers that fail to bind appear under Failed servers."
      />
    );
  }

  return <ServerStatusTable rows={rows} />;
}

/** The failed-mount row's secondary message line: the existing muted style (via
 *  `tai-muted`), held to a single ellipsised line — the full redacted message rides the
 *  element's `title` tooltip. */
const failedMessageStyle = {
  marginTop: 'var(--tai-space-1)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 'var(--tai-text-sm)',
} as const;

/** The Server column fills the row's free width up to the Status column: `width: 100%`
 *  makes it greedy so Status and the actions stay snug at the right, and `maxWidth: 0`
 *  stops the single-line message from widening the column past that fill — it ellipsises
 *  at the Status edge instead of at a fraction of the row. Applied to the header cell
 *  and the body cell together so the `Server | Status` column boundary stays aligned. */
const failedServerHeaderStyle = { width: '100%' } as const;
const failedServerCellStyle = { width: '100%', maxWidth: 0 } as const;

/** One failed-server row: its title, coarse status, and the per-server remediation
 *  (Reload re-probes it; Deregister — a destructive detach — asks the house confirm).
 *  Each affordance is gated on its OWN door: a caller whose projection cannot reach
 *  `<verb> path` is never shown a control that can only 403 on submit (projection ⊆
 *  gate). The per-server routes are DYNAMIC (`/api/mcp-status/{title}/…`), which a
 *  scoped projection can carry only as a method-less pattern, so — following the house
 *  approach for a templated write route — the interpolated path resolves to a
 *  full-projection gate; under-showing a scoped caller's control is safe. */
function FailedServerRow({
  entry,
  onReload,
  reloadPending,
  onDeregister,
}: {
  readonly entry: FailedMcpEntry;
  readonly onReload: (title: string) => void;
  readonly reloadPending: boolean;
  readonly onDeregister: (title: string) => void;
}): ReactNode {
  const canReload = useCanWrite(`/api/mcp-status/${entry.title}/reload`, 'POST');
  const canDeregister = useCanWrite(`/api/mcp-status/${entry.title}/deregister`, 'POST');
  return (
    <TR>
      <TD style={failedServerCellStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
          <span style={{ fontFamily: 'var(--tai-font-mono)' }}>{entry.title}</span>
          {/* The coarse, credential-free failure category (`auth` / `unreachable` /
              `error`), in the failed-status badge style; absent on a server that omits
              it, which leaves the row unchanged. */}
          {entry.category !== undefined ? <Badge variant="danger">{entry.category}</Badge> : null}
        </div>
        {/* The redacted failure message as a single muted, ellipsised secondary line
            (full text in the `title` tooltip); no line when the server omits it. */}
        {entry.message !== undefined ? (
          <div className="tai-muted" style={failedMessageStyle} title={entry.message}>
            {entry.message}
          </div>
        ) : null}
      </TD>
      <TD>
        <Badge variant="danger">{entry.status}</Badge>
      </TD>
      <TD>
        <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
          {canReload ? (
            <Button
              type="button"
              onClick={() => {
                onReload(entry.title);
              }}
              disabled={reloadPending}
            >
              {reloadPending ? <Spinner label={`Reloading ${entry.title}`} /> : null}
              Reload
            </Button>
          ) : null}
          {canDeregister ? (
            <Button
              type="button"
              variant="danger"
              aria-label={`Deregister ${entry.title}`}
              onClick={() => {
                onDeregister(entry.title);
              }}
            >
              Deregister
            </Button>
          ) : null}
        </div>
      </TD>
    </TR>
  );
}

/** The failed-server table: one gated row per skipped server, driving Reload and
 *  Deregister back to the section that owns the mutations. */
function FailedServersTable({
  failed,
  reloadingTitle,
  onReload,
  onDeregister,
}: {
  readonly failed: readonly FailedMcpEntry[];
  readonly reloadingTitle: string | undefined;
  readonly onReload: (title: string) => void;
  readonly onDeregister: (title: string) => void;
}): ReactNode {
  return (
    <ScrollRegion label="Failed MCP servers">
      <Table>
        <THead>
          <TR>
            <TH style={failedServerHeaderStyle}>Server</TH>
            <TH>Status</TH>
            <TH>
              <span className="tai-visually-hidden">Actions</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {failed.map((entry) => (
            <FailedServerRow
              key={entry.title}
              entry={entry}
              onReload={onReload}
              reloadPending={reloadingTitle === entry.title}
              onDeregister={onDeregister}
            />
          ))}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}

/** The deregister confirm: a destructive detach behind the house confirm. On a
 *  non-converged fan-out the honest report stays IN the dialog so the operator sees
 *  the stranded worker in context and closes explicitly; a converged detach closes it. */
function DeregisterConfirmDialog({
  target,
  report,
  isPending,
  error,
  onConfirm,
  onClose,
}: {
  readonly target: string;
  readonly report: FleetReportSummary | null;
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <ConfirmDialog
      title="Deregister MCP server"
      confirmLabel="Deregister"
      pendingLabel={`Deregistering ${target}`}
      onConfirm={onConfirm}
      onClose={onClose}
      isPending={isPending}
      error={error}
    >
      <p style={{ margin: 0 }}>
        Detach <strong style={{ fontFamily: 'var(--tai-font-mono)' }}>{target}</strong> and its
        tools from the live registry? This leaves the manifest entry in place — reload it once the
        server is healthy to re-attach.
      </p>
      {report !== null ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <FleetReport summary={report} action="deregister" />
        </div>
      ) : null}
    </ConfirmDialog>
  );
}

/**
 * The failed-MCP health section: the servers the viability check skipped, read from
 * the fleet-wide `GET /api/mcp-status/failed` door (a server failed on ANY worker is
 * listed). Each row carries Reload (re-probe one) and Deregister (detach one's tools,
 * a destructive op behind the house confirm); a Reload-all-failed button re-probes the
 * whole roster. Every remediation invalidates both the failed roster and the mounted
 * status, since a re-attached server moves between the two views. An empty roster is a
 * quiet healthy state — the section renders nothing.
 */
export function FailedServersSection(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [deregisterTarget, setDeregisterTarget] = useState<string | null>(null);
  // A deregister that landed but whose fleet broadcast did NOT converge keeps the
  // confirm dialog open showing the honest report in context (mirrors ConnectDialog),
  // so the operator sees the stranded worker and closes explicitly. `null` on a
  // converged (or lone-worker) detach, which closes the dialog.
  const [deregisterReport, setDeregisterReport] = useState<FleetReportSummary | null>(null);
  // Reload-all rides a CONCRETE, method-expressible route, so it gates exactly on
  // `POST /api/mcp-status/reload-failed` (projection ⊆ gate); the per-row Reload and
  // Deregister gates live in `FailedServerRow` on their own dynamic doors.
  const canReloadAll = useCanWrite('/api/mcp-status/reload-failed', 'POST');

  const query = useQuery({
    queryKey: mcpFailedKey,
    queryFn: ({ signal }) => api.listFailedMcps(signal),
  });

  const invalidateStatus = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: mcpFailedKey });
    await queryClient.invalidateQueries({ queryKey: mcpStatusKey });
  };

  const reload = useMutation({
    mutationFn: (title: string) => api.reloadMcp(title),
    onSuccess: invalidateStatus,
  });
  const reloadAll = useMutation({
    mutationFn: () => api.reloadFailedMcps(),
    onSuccess: invalidateStatus,
  });
  const deregister = useMutation({
    mutationFn: (title: string) => api.deregisterMcp(title),
    onSuccess: async (result) => {
      await invalidateStatus();
      const summary = summarizeFleetResult(result);
      if (isFleetReportFailure(summary)) {
        // Non-converged: keep the dialog open rendering the report in context.
        setDeregisterReport(summary);
        return;
      }
      // Converged (or lone-worker) detach: close the dialog.
      setDeregisterReport(null);
      setDeregisterTarget(null);
    },
  });

  if (query.isPending) return <Skeleton height={72} />;
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const failed = failedMcpsFromReport(query.data);
  if (failed.length === 0) return null;

  const openDeregister = (title: string): void => {
    // A shared mutation drives every row's confirm, so clear any stale error and any
    // prior fleet report before opening (the reset-on-open precedent).
    deregister.reset();
    setDeregisterReport(null);
    setDeregisterTarget(title);
  };

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-3)',
          marginBottom: 'var(--tai-space-3)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Failed servers</h2>
        {canReloadAll ? (
          <Button
            type="button"
            onClick={() => {
              reloadAll.mutate();
            }}
            disabled={reloadAll.isPending}
          >
            {reloadAll.isPending ? <Spinner label="Reloading all failed servers" /> : null}
            Reload all failed
          </Button>
        ) : null}
      </div>
      <FailedServersTable
        failed={failed}
        reloadingTitle={reload.isPending ? reload.variables : undefined}
        onReload={(title) => {
          reload.mutate(title);
        }}
        onDeregister={openDeregister}
      />
      {reload.isError ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <ErrorState message={errorMessage(reload.error)} />
        </div>
      ) : null}
      {reloadAll.isError ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <ErrorState message={errorMessage(reloadAll.error)} />
        </div>
      ) : null}
      {/* Each remediation broadcasts to the fleet; surface any failed propagation
          honestly (nothing on a converged / lone-worker op). */}
      {reload.isSuccess ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <FleetReport summary={summarizeFleetResult(reload.data)} action="reload" />
        </div>
      ) : null}
      {reloadAll.isSuccess ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <FleetReport summary={summarizeFleetResult(reloadAll.data)} action="reload" />
        </div>
      ) : null}
      {deregisterTarget !== null ? (
        <DeregisterConfirmDialog
          target={deregisterTarget}
          report={deregisterReport}
          isPending={deregister.isPending}
          error={deregister.error}
          onConfirm={() => {
            deregister.mutate(deregisterTarget);
          }}
          onClose={() => {
            setDeregisterTarget(null);
            setDeregisterReport(null);
          }}
        />
      ) : null}
    </Card>
  );
}
