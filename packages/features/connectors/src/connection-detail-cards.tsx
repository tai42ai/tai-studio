/**
 * Presentational pieces of the connection detail view: the read-only summary, the
 * sub-service toggle card, the disconnect confirm dialog, and the contextual notice
 * cluster. All are stateless — the orchestrator owns the data and actions.
 */
import type { ConnectionView, FleetReportSummary } from '@tai42/api-client';
import {
  AlertTriangleIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  ErrorState,
  FleetReport,
  Spinner,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { ConnectorRefusalNotice, Notice, readConnectorRefusal } from './notice';
import type { OAuthNotice } from './oauth';

export interface SubServiceChoice {
  readonly id: string;
  readonly label: string;
}

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

function DetailRow({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 'var(--tai-space-3)' }}>
      <dt style={{ minWidth: '10rem', color: 'var(--tai-color-text-muted)' }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

/** The connection's read-only summary: its title, auth-health badge, and the UI-safe
 *  record fields (no secrets present). */
export function ConnectionSummaryCard({
  connection,
}: {
  readonly connection: ConnectionView;
}): ReactNode {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
        <h1 className="tai-page-title" style={{ margin: 0 }}>
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
    </>
  );
}

/** The sub-service toggles and their Save. Rendered only when the connection exposes
 *  sub-services to choose from. */
export function SubServicesCard({
  choices,
  effectiveEnabled,
  busy,
  patchPending,
  onToggle,
  onSave,
}: {
  readonly choices: readonly SubServiceChoice[];
  readonly effectiveEnabled: ReadonlySet<string>;
  readonly busy: boolean;
  readonly patchPending: boolean;
  readonly onToggle: (id: string, checked: boolean) => void;
  readonly onSave: () => void;
}): ReactNode {
  return (
    <Card>
      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
        <legend style={{ fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>Sub-services</legend>
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
                onToggle(choice.id, checked);
              }}
            />
          ))}
        </div>
      </fieldset>
      <div style={{ marginTop: 'var(--tai-space-3)' }}>
        <Button variant="primary" disabled={busy} onClick={onSave}>
          {patchPending ? <Spinner label="Saving" /> : null}
          Save sub-services
        </Button>
      </div>
    </Card>
  );
}

/**
 * The connection's contextual notices: a provider-metadata load failure, sub-services
 * that failed a reachability probe, a consent-required change that returned no URL, a
 * mutation refusal/error, and the fleet/OAuth reports a write or completion produces.
 */
export function ConnectionNotices({
  providersError,
  unreachableLabels,
  consentBlocked,
  refusal,
  mutationError,
  patchFleet,
  oauthNotice,
  onClearOauthNotice,
  oauthFleet,
}: {
  readonly providersError: boolean;
  readonly unreachableLabels: readonly string[];
  readonly consentBlocked: boolean;
  readonly refusal: ReturnType<typeof readConnectorRefusal>;
  readonly mutationError: string | null;
  readonly patchFleet: FleetReportSummary | null;
  readonly oauthNotice: OAuthNotice | null;
  readonly onClearOauthNotice: () => void;
  readonly oauthFleet: FleetReportSummary | null;
}): ReactNode {
  return (
    <>
      {providersError ? (
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

      {/* A sub-service whose MCP server did not answer the live reachability probe:
          distinct from auth health (a healthy connection can still have a down
          sub-service), so it is context the operator came to find, not an interrupt. */}
      {unreachableLabels.length > 0 ? (
        <div role="status" className="tai-warn-state tai-stack tai-stack-2">
          <strong className="tai-status tai-status-warn">
            <AlertTriangleIcon />
            Some sub-services did not respond
          </strong>
          <p>{`These sub-services did not answer a reachability check: ${unreachableLabels.join(', ')}. Their MCP server may be down — this is separate from the connection's auth health.`}</p>
        </div>
      ) : null}

      {/* A consent-requiring change that returned no authorization URL cannot take
          effect without a reconnect — surface it loudly rather than as a silent no-op. */}
      {consentBlocked ? (
        <div role="alert" className="tai-warn-state tai-stack tai-stack-2">
          <strong className="tai-status tai-status-warn">
            <AlertTriangleIcon />
            Consent required
          </strong>
          <p>
            This change needs the provider&rsquo;s consent, but no authorization link was returned.
            Reconnect this connection to grant it.
          </p>
        </div>
      ) : null}

      {refusal !== null ? (
        <ConnectorRefusalNotice refusal={refusal} />
      ) : mutationError !== null ? (
        <ErrorState message={mutationError} />
      ) : null}
      {/* A sub-service change that writes the manifest broadcasts a reload to the
          fleet; surface any failed propagation honestly (nothing on a converged
          save or a consent-only toggle that wrote nothing). */}
      {patchFleet !== null ? <FleetReport summary={patchFleet} /> : null}
      {oauthNotice !== null ? <Notice notice={oauthNotice} onDismiss={onClearOauthNotice} /> : null}
      {/* A reconnect / consent OAuth completion whose reload did not converge surfaces
          the stranded origins here instead of closing behind a bare success notice. */}
      {oauthFleet !== null ? <FleetReport summary={oauthFleet} /> : null}
    </>
  );
}

/** The disconnect confirm dialog: its own trigger button plus the in-dialog
 *  cancel/confirm. Disconnect revokes upstream access where possible. */
export function DisconnectDialog({
  alias,
  open,
  onOpenChange,
  busy,
  disconnectPending,
  onConfirm,
}: {
  readonly alias: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly busy: boolean;
  readonly disconnectPending: boolean;
  readonly onConfirm: () => void;
}): ReactNode {
  return (
    <Dialog
      title="Disconnect this connection?"
      description={`This removes “${alias}” and revokes its access upstream where possible.`}
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button variant="danger" disabled={busy}>
          Disconnect
        </Button>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
        <Button
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button variant="danger" disabled={disconnectPending} onClick={onConfirm}>
          {disconnectPending ? <Spinner label="Disconnecting" /> : null}
          Disconnect
        </Button>
      </div>
    </Dialog>
  );
}
