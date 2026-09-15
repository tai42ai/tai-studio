/**
 * The CONNECTION DETAIL view: the UI-safe connection record (no secrets
 * are present), sub-service toggles saved via `patchSubServices`, a RECONNECT
 * action, and a DISCONNECT action behind a confirm dialog. Both reconnect and a
 * consent-requiring sub-service change may return an `authorize_url` and re-enter
 * the OAuth popup flow.
 */
import {
  type ConnectionView,
  type FleetReportSummary,
  summarizeFleetFanout,
} from '@tai42/api-client';
import {
  AlertTriangleIcon,
  AppLink,
  ArrowLeftIcon,
  Button,
  EmptyState,
  ErrorState,
  FleetReport,
  Skeleton,
  Spinner,
  Stack,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

import type { SubServiceChoice } from './connection-detail-cards';
import {
  ConnectionNotices,
  ConnectionSummaryCard,
  DisconnectDialog,
  SubServicesCard,
} from './connection-detail-cards';
import { connectionKey, CONNECTIONS_KEY, PROVIDERS_KEY } from './keys';
import { readConnectorRefusal } from './notice';
import { useOAuthPopup } from './oauth';

/** The captured result of a disconnect that stays on the page to surface an outcome. */
interface DisconnectOutcome {
  readonly revokeOutcome: 'success' | 'failed' | 'skipped';
  readonly revokeStatus: number | null;
  readonly fleet: FleetReportSummary | null;
}

/**
 * The upstream-revoke outcome of a completed disconnect. A `failed` revoke is a
 * warning that access may still be live upstream; a `skipped` revoke is a neutral
 * note (nothing to revoke); a `success` revoke needs no note (and navigates away).
 */
function RevokeNote({
  outcome,
  status,
}: {
  outcome: DisconnectOutcome['revokeOutcome'];
  status: number | null;
}): ReactNode {
  if (outcome === 'failed') {
    const statusNote = status !== null ? ` (it answered ${String(status)})` : '';
    return (
      <div role="alert" className="tai-warn-state tai-stack tai-stack-2">
        <strong className="tai-status tai-status-warn">
          <AlertTriangleIcon />
          Upstream access may still be live
        </strong>
        <p>{`The connection was removed here, but the provider did not confirm that its access was revoked${statusNote}. Review and revoke it in the provider's own settings.`}</p>
      </div>
    );
  }
  if (outcome === 'skipped') {
    return (
      <p
        role="status"
        style={{
          margin: 0,
          fontSize: 'var(--tai-text-sm)',
          color: 'var(--tai-color-text-muted)',
        }}
      >
        The connection was removed. No upstream revocation applied to this connection.
      </p>
    );
  }
  return null;
}

/** The connection read + its provider metadata, plus the sub-service choices and the
 *  unreachable-sub-service labels derived from them. */
function useConnectionData(connectionId: string) {
  const api = useApi();
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
    const provider = providersQuery.data?.providers.find((p) => p.id === connection.provider_id);
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

  // Sub-services the single-connection probe found unreachable, mapped to their
  // display labels (falling back to the id when provider metadata is unavailable).
  const unreachableLabels = useMemo<string[]>(() => {
    if (connection === undefined) return [];
    return connection.unreachable_sub_services.map(
      (id) => choices.find((choice) => choice.id === id)?.label ?? id,
    );
  }, [connection, choices]);

  return { connectionQuery, providersQuery, connection, choices, unreachableLabels };
}

/** The sub-service selection, the patch/reconnect/disconnect mutations, and the OAuth
 *  popup a reconnect or consent-requiring change re-enters. */
function useConnectionMutations(connectionId: string, connection: ConnectionView | undefined) {
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

  // A sub-service change that requires consent but returns no authorization URL is a
  // silent no-op unless surfaced: the operator asked for access the change cannot grant
  // without a reconnect. Loud inline alert, cleared when a fresh save/reconnect starts.
  const [consentBlocked, setConsentBlocked] = useState(false);

  const patch = useMutation({
    mutationFn: (subServices: string[]) => api.patchSubServices(connectionId, subServices),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: connectionKey(connectionId) });
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      // Hold the server's authoritative enabled set until the refetch lands, rather
      // than dropping to `null` and flickering back through the stale cached set.
      setEnabled(new Set(result.enabled_sub_services));
      if (result.authorize_url !== null) {
        oauth.start(result.authorize_url);
      } else if (result.consent_required) {
        setConsentBlocked(true);
      }
    },
  });

  const reconnect = useMutation({
    mutationFn: (subServices: string[]) => api.reconnect(connectionId, subServices),
    onSuccess: (result) => {
      oauth.start(result.authorize_url);
    },
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  // A disconnect that stranded a fleet sibling, or whose upstream revoke failed/was
  // skipped, keeps this view mounted to surface the honest outcome rather than
  // navigating away and discarding it.
  const [disconnectOutcome, setDisconnectOutcome] = useState<DisconnectOutcome | null>(null);
  const disconnect = useMutation({
    mutationFn: () => api.disconnect(connectionId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      setConfirmOpen(false);
      const summary = summarizeFleetFanout(result.fanout);
      const fleetConverged = summary === null || summary.status === 'converged';
      // Navigate away only on a fully-clean disconnect (upstream access confirmed
      // revoked AND the reload converged). A failed/skipped revoke or a stranded fleet
      // keeps the view open with the honest note below.
      if (result.upstream_revoke_outcome === 'success' && fleetConverged) {
        navigate('connectors', {});
        return;
      }
      setDisconnectOutcome({
        revokeOutcome: result.upstream_revoke_outcome,
        revokeStatus: result.upstream_revoke_status,
        fleet: summary,
      });
    },
  });

  return {
    oauth,
    oauthFleet,
    effectiveEnabled,
    toggle,
    consentBlocked,
    setConsentBlocked,
    patch,
    reconnect,
    confirmOpen,
    setConfirmOpen,
    disconnect,
    disconnectOutcome,
  };
}

/** The connection detail's data + actions: the reads and their derivations, the
 *  mutations and OAuth flow, and the mutation-refusal/error and busy derivations. */
function useConnectionActions(connectionId: string) {
  const data = useConnectionData(connectionId);
  const actions = useConnectionMutations(connectionId, data.connection);

  // A mutation may refuse with a named 501 (store off, or this provider's OAuth
  // credentials unset) — surface that as the muted, actionable note, and reserve the
  // loud ErrorState for genuine errors (validation, upstream, 5xx).
  const mutationErrorObj =
    actions.patch.error ?? actions.reconnect.error ?? actions.disconnect.error;
  const refusal = readConnectorRefusal(mutationErrorObj);
  const mutationError =
    refusal === null && mutationErrorObj instanceof Error ? mutationErrorObj.message : null;
  const busy =
    actions.patch.isPending ||
    actions.reconnect.isPending ||
    actions.disconnect.isPending ||
    actions.oauth.pending;

  return { ...data, ...actions, refusal, mutationError, busy };
}

export function ConnectionDetail({ connectionId }: { connectionId: string }): ReactNode {
  const {
    connectionQuery,
    providersQuery,
    connection,
    choices,
    unreachableLabels,
    effectiveEnabled,
    toggle,
    consentBlocked,
    setConsentBlocked,
    patch,
    reconnect,
    confirmOpen,
    setConfirmOpen,
    disconnect,
    disconnectOutcome,
    oauth,
    oauthFleet,
    refusal,
    mutationError,
    busy,
  } = useConnectionActions(connectionId);

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

  return (
    <Stack gap={4}>
      <div>
        <AppLink to="connectors" search={{}} className="tai-btn tai-btn-ghost">
          <ArrowLeftIcon />
          Back
        </AppLink>
      </div>
      <ConnectionSummaryCard connection={connection} />

      {choices.length > 0 ? (
        <SubServicesCard
          choices={choices}
          effectiveEnabled={effectiveEnabled}
          busy={busy}
          patchPending={patch.isPending}
          onToggle={toggle}
          onSave={() => {
            setConsentBlocked(false);
            patch.mutate([...effectiveEnabled]);
          }}
        />
      ) : null}

      <ConnectionNotices
        providersError={providersQuery.isError}
        unreachableLabels={unreachableLabels}
        consentBlocked={consentBlocked}
        refusal={refusal}
        mutationError={mutationError}
        patchFleet={patch.isSuccess ? summarizeFleetFanout(patch.data.fanout) : null}
        oauthNotice={oauth.notice}
        onClearOauthNotice={oauth.clearNotice}
        oauthFleet={oauthFleet}
      />

      <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
        {/* Reconnect re-enters the OAuth grant. A `none` (no-auth) connection has no
            grant to renew, so reconnecting it is a no-op/error — the action is hidden. */}
        {connection.kind !== 'none' ? (
          <Button
            disabled={busy}
            onClick={() => {
              setConsentBlocked(false);
              reconnect.mutate([...effectiveEnabled]);
            }}
          >
            {reconnect.isPending ? <Spinner label="Reconnecting" /> : null}
            Reconnect
          </Button>
        ) : null}
        <DisconnectDialog
          alias={connection.alias}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          busy={busy}
          disconnectPending={disconnect.isPending}
          onConfirm={() => {
            disconnect.mutate();
          }}
        />
      </div>

      {/* A disconnect that stayed on the page: the upstream revoke outcome (a failed
          revoke is a warning that access may still be live; a skipped revoke is a
          neutral note) plus any stranded fleet origins, instead of navigating away and
          hiding them. */}
      {disconnectOutcome !== null ? (
        <>
          <RevokeNote
            outcome={disconnectOutcome.revokeOutcome}
            status={disconnectOutcome.revokeStatus}
          />
          {disconnectOutcome.fleet !== null ? (
            <FleetReport summary={disconnectOutcome.fleet} />
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}
