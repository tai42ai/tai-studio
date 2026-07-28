/**
 * The CONNECTION DETAIL view: the UI-safe connection record (no secrets
 * are present), sub-service toggles saved via `patchSubServices`, a RECONNECT
 * action, and a DISCONNECT action behind a confirm dialog. Both reconnect and a
 * consent-requiring sub-service change may return an `authorize_url` and re-enter
 * the OAuth popup flow.
 */
import {
  AppLink,
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorState,
  FleetReport,
  Skeleton,
  Spinner,
  Stack,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import {
  summarizeFleetFanout,
  type ConnectionView,
  type FleetReportSummary,
} from '@tai42/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { CONNECTIONS_KEY, PROVIDERS_KEY, connectionKey } from './keys';
import { Notice } from './notice';
import { useOAuthPopup } from './oauth';

const HEALTH_VARIANT: Record<ConnectionView['auth_health_state'], string> = {
  healthy: 'success',
  reconnect_required: 'warning',
  refresh_failing: 'danger',
};

const HEALTH_LABEL: Record<ConnectionView['auth_health_state'], string> = {
  healthy: 'Healthy',
  reconnect_required: 'Reconnect required',
  refresh_failing: 'Refresh failing',
};

interface SubServiceChoice {
  readonly id: string;
  readonly label: string;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 'var(--tai-space-3)' }}>
      <dt style={{ minWidth: '10rem', color: 'var(--tai-color-text-muted)' }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

export function ConnectionDetail({ connectionId }: { connectionId: string }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useAppNavigate();
  // A reconnect / consent completion runs through the OAuth popup, which writes the
  // manifest and broadcasts a reload; a broadcast that stranded a sibling stays visible
  // here as the honest per-origin report rather than vanishing behind a bare notice.
  const [oauthFleet, setOauthFleet] = useState<FleetReportSummary | null>(null);
  const oauth = useOAuthPopup({
    onSuccess: (fleet) => {
      void queryClient.invalidateQueries({ queryKey: connectionKey(connectionId) });
      setOauthFleet(fleet !== null && fleet.status !== 'converged' ? fleet : null);
    },
  });

  const connectionQuery = useQuery({
    queryKey: connectionKey(connectionId),
    queryFn: ({ signal }) => api.getConnection(connectionId, signal),
  });
  const providersQuery = useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: ({ signal }) => api.listProviders(signal),
  });

  const connection = connectionQuery.data;

  const choices = useMemo<SubServiceChoice[]>(() => {
    if (connection === undefined) return [];
    const provider = providersQuery.data?.find((p) => p.id === connection.provider_id);
    if (provider !== undefined) {
      return provider.sub_services.map((service) => ({
        id: service.id,
        label: service.display_name,
      }));
    }
    // No provider metadata (it was removed, or its load failed) — fall back to
    // the connection's own ids as labels. A failed load is surfaced separately by
    // the notice below so the id-only labels are never a silent degradation.
    return connection.enabled_sub_services.map((id) => ({ id, label: id }));
  }, [connection, providersQuery.data]);

  const [enabled, setEnabled] = useState<ReadonlySet<string> | null>(null);
  const effectiveEnabled = enabled ?? new Set(connection?.enabled_sub_services ?? []);

  const toggle = useCallback(
    (id: string, checked: boolean) => {
      const base = enabled ?? new Set(connection?.enabled_sub_services ?? []);
      const next = new Set(base);
      if (checked) next.add(id);
      else next.delete(id);
      setEnabled(next);
    },
    [enabled, connection?.enabled_sub_services],
  );

  const patch = useMutation({
    mutationFn: (subServices: string[]) => api.patchSubServices(connectionId, subServices),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: connectionKey(connectionId) });
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      setEnabled(null);
      if (result.authorize_url !== null) oauth.start(result.authorize_url);
    },
  });

  const reconnect = useMutation({
    mutationFn: (subServices: string[]) => api.reconnect(connectionId, subServices),
    onSuccess: (result) => {
      oauth.start(result.authorize_url);
    },
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  // A disconnect that removed manifest entries broadcasts a reload; a broadcast that
  // stranded a sibling keeps this view mounted showing the honest report rather than
  // navigating away and discarding it.
  const [disconnectFanout, setDisconnectFanout] = useState<FleetReportSummary | null>(null);
  const disconnect = useMutation({
    mutationFn: () => api.disconnect(connectionId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      setConfirmOpen(false);
      const summary = summarizeFleetFanout(result.fanout);
      // A stranded fleet keeps the view open with the loud per-origin report; a
      // converged (or lone-worker) disconnect returns to the connector list.
      if (summary !== null && summary.status !== 'converged') {
        setDisconnectFanout(summary);
        return;
      }
      navigate('connectors', {});
    },
  });

  if (connectionQuery.isPending) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <Skeleton height={24} width="40%" />
        <Skeleton height={120} />
      </div>
    );
  }
  if (connectionQuery.isError) {
    return (
      <ErrorState
        message={
          connectionQuery.error instanceof Error
            ? connectionQuery.error.message
            : 'Failed to load the connection.'
        }
        onRetry={() => {
          void connectionQuery.refetch();
        }}
      />
    );
  }
  if (connection === undefined) {
    return <EmptyState title="Connection not found" description={connectionId} />;
  }

  const mutationError =
    (patch.error instanceof Error && patch.error.message) ||
    (reconnect.error instanceof Error && reconnect.error.message) ||
    (disconnect.error instanceof Error && disconnect.error.message) ||
    null;

  const busy = patch.isPending || reconnect.isPending || disconnect.isPending || oauth.pending;

  return (
    <Stack gap={4}>
      <div>
        <AppLink to="connectors" search={{}} className="tai-btn tai-btn-ghost">
          <ArrowLeftIcon />
          Back
        </AppLink>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
        <h1 className="tai-section-title" style={{ margin: 0 }}>
          {connection.alias}
        </h1>
        <Badge variant={HEALTH_VARIANT[connection.auth_health_state]}>
          {HEALTH_LABEL[connection.auth_health_state]}
        </Badge>
      </div>

      <Card>
        <dl
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)', margin: 0 }}
        >
          <DetailRow label="Provider">{connection.provider_id}</DetailRow>
          <DetailRow label="Kind">{connection.kind}</DetailRow>
          <DetailRow label="Account">{connection.account_identity ?? '—'}</DetailRow>
          <DetailRow label="Granted scopes">
            {connection.granted_scopes.length > 0 ? connection.granted_scopes.join(', ') : '—'}
          </DetailRow>
          <DetailRow label="Created">{connection.created_at}</DetailRow>
        </dl>
      </Card>

      {providersQuery.isError ? (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: 'var(--tai-text-sm)',
            color: 'var(--tai-color-text-muted)',
          }}
        >
          Provider names could not be loaded — sub-services are shown by their identifiers.
        </p>
      ) : null}

      {choices.length > 0 ? (
        <Card>
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>
              Sub-services
            </legend>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--tai-space-2)',
                marginTop: 'var(--tai-space-2)',
              }}
            >
              {choices.map((choice) => (
                <Checkbox
                  key={choice.id}
                  label={choice.label}
                  checked={effectiveEnabled.has(choice.id)}
                  disabled={busy}
                  onCheckedChange={(checked) => {
                    toggle(choice.id, checked);
                  }}
                />
              ))}
            </div>
          </fieldset>
          <div style={{ marginTop: 'var(--tai-space-3)' }}>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                patch.mutate([...effectiveEnabled]);
              }}
            >
              {patch.isPending ? <Spinner label="Saving" /> : null}
              Save sub-services
            </Button>
          </div>
        </Card>
      ) : null}

      {mutationError !== null ? <ErrorState message={mutationError} /> : null}
      {/* A sub-service change that writes the manifest broadcasts a reload to the
          fleet; surface any failed propagation honestly (nothing on a converged
          save or a consent-only toggle that wrote nothing). */}
      {patch.isSuccess ? <FleetReport summary={summarizeFleetFanout(patch.data.fanout)} /> : null}
      {oauth.notice !== null ? (
        <Notice notice={oauth.notice} onDismiss={oauth.clearNotice} />
      ) : null}
      {/* A reconnect / consent OAuth completion whose reload did not converge surfaces
          the stranded origins here instead of closing behind a bare success notice. */}
      {oauthFleet !== null ? <FleetReport summary={oauthFleet} /> : null}

      <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
        <Button
          disabled={busy}
          onClick={() => {
            reconnect.mutate([...effectiveEnabled]);
          }}
        >
          {reconnect.isPending ? <Spinner label="Reconnecting" /> : null}
          Reconnect
        </Button>
        <Dialog
          title="Disconnect this connection?"
          description={`This removes “${connection.alias}” and revokes its access upstream where possible.`}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          trigger={
            <Button variant="danger" disabled={busy}>
              Disconnect
            </Button>
          }
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
            <Button
              onClick={() => {
                setConfirmOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={disconnect.isPending}
              onClick={() => {
                disconnect.mutate();
              }}
            >
              {disconnect.isPending ? <Spinner label="Disconnecting" /> : null}
              Disconnect
            </Button>
          </div>
        </Dialog>
      </div>

      {/* A disconnect whose reload did not converge across the fleet leaves the
          stranded origins visible here instead of navigating away and hiding them. */}
      {disconnectFanout !== null ? <FleetReport summary={disconnectFanout} /> : null}
    </Stack>
  );
}
