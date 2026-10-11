/**
 * The Connectors page's provider and connection controls for the provider door: the
 * card's mark (the provider icon, or the connectors glyph for a provider with none),
 * the line saying where its app registration comes from, its administrator actions
 * (Client credentials, Remove), the Remove confirm, and the badge of a connection that
 * needs more permissions.
 */
import type { ConnectionView, ProviderView } from '@tai42/api-client';
import { Badge, Button, ConfirmDialog, ConnectorsIcon, Tooltip, useApi } from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useId } from 'react';

import { PROVIDERS_KEY } from './keys';
import { ConnectorRefusalNotice, readConnectorRefusal } from './notice';

const MARK_SIZE = 28;

/** The provider's icon, or the connectors glyph in the same box when it has none. Both
 * are decorative: the display name beside the mark is the accessible name. */
export function ProviderMark({ provider }: { provider: ProviderView }): ReactNode {
  if (provider.icon_url !== null) {
    return (
      <img
        src={provider.icon_url}
        alt=""
        width={MARK_SIZE}
        height={MARK_SIZE}
        style={{ borderRadius: 'var(--tai-radius-sm)', flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: MARK_SIZE,
        height: MARK_SIZE,
        flexShrink: 0,
        color: 'var(--tai-color-text-muted)',
      }}
    >
      <ConnectorsIcon />
    </span>
  );
}

const CLIENT_SOURCE_LINE: Partial<Record<NonNullable<ProviderView['client_source']>, string>> = {
  dynamic: 'App registered automatically',
  manual: 'Client credentials set',
};

/** Where the provider's app registration comes from, when that is worth a line. */
export function ClientSourceLine({ provider }: { provider: ProviderView }): ReactNode {
  const line =
    provider.client_source === null ? undefined : CLIENT_SOURCE_LINE[provider.client_source];
  if (line === undefined) return null;
  return (
    <p
      style={{
        margin: 'var(--tai-space-1) 0 0',
        fontSize: 'var(--tai-text-sm)',
        color: 'var(--tai-color-text-muted)',
      }}
    >
      {line}
    </p>
  );
}

/** A provider whose client lives in the client store: its credentials can be set here. */
function hasStoredClient(provider: ProviderView): boolean {
  return (
    provider.client_source === 'manual' ||
    provider.client_source === 'dynamic' ||
    provider.client_source === 'unset'
  );
}

/** The card's administrator actions; the caller renders them behind the admin gate. */
export function ProviderAdminActions({
  provider,
  onCredentials,
  onRemove,
}: {
  provider: ProviderView;
  onCredentials: (provider: ProviderView) => void;
  onRemove: (provider: ProviderView) => void;
}): ReactNode {
  return (
    <>
      {hasStoredClient(provider) ? (
        <Button
          variant="ghost"
          onClick={() => {
            onCredentials(provider);
          }}
        >
          Client credentials
        </Button>
      ) : null}
      {provider.removable ? (
        <Button
          variant="ghost"
          className="tai-status-err"
          onClick={() => {
            onRemove(provider);
          }}
        >
          Remove
        </Button>
      ) : null}
    </>
  );
}

/** The Remove confirm. A refusal (a provider that still has connections) keeps it open
 * with the server's message; the store being off takes the muted note instead. */
export function RemoveProviderDialog({
  provider,
  onClose,
}: {
  provider: ProviderView;
  onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.removeProvider(provider.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY });
      onClose();
    },
  });
  const refusal = readConnectorRefusal(remove.error);
  return (
    <ConfirmDialog
      title="Remove this server?"
      confirmLabel="Remove"
      pendingLabel="Removing"
      onConfirm={() => {
        remove.mutate();
      }}
      onClose={onClose}
      isPending={remove.isPending}
      error={refusal === null ? remove.error : null}
      disabledNote={refusal !== null ? <ConnectorRefusalNotice refusal={refusal} /> : undefined}
    >
      <p style={{ margin: 0 }}>
        {`This removes “${provider.display_name}” from the list. Disconnect its accounts first.`}
      </p>
    </ConfirmDialog>
  );
}

/** A connection's "needs more permissions" flag, shown only when a tool asked for scopes
 * the connection lacks. The scopes ride the badge's tooltip and, for a screen reader,
 * the sentence's description. */
export function NeedsMorePermissions({ connection }: { connection: ConnectionView }): ReactNode {
  const scopesId = useId();
  if (connection.scopes_wanted.length === 0) return null;
  const scopes = connection.scopes_wanted.join(' ');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--tai-space-2)',
        marginTop: 'var(--tai-space-1)',
      }}
    >
      <Tooltip content={<code className="tai-mono">{scopes}</code>}>
        <span>
          <Badge variant="warning">Needs more permissions</Badge>
        </span>
      </Tooltip>
      <span aria-describedby={scopesId} style={{ fontSize: 'var(--tai-text-sm)' }}>
        A tool asked for permissions this connection does not have. Reconnect to grant them.
      </span>
      <span id={scopesId} className="tai-visually-hidden">
        {`Permissions asked for: ${scopes}`}
      </span>
    </div>
  );
}
