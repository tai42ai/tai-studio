/**
 * The Entry gate section on a route's drill-in: a web route can be gated so its
 * chat page is served only to a navigation carrying a live entry code. The section
 * grafts the four gate doors — the conversation monitor's first route
 * mutations — onto the otherwise read-only monitor.
 *
 * Placement is by CLASSIFICATION, not prop: `RouteThreads` hands only the route
 * NAME, so the section looks the route up in the shared route catalogue (the route
 * picker's query, same cache key) to learn its door/channel/identity. It renders
 * nothing until that resolves to a `channel`/`web` route carrying an identity —
 * every other route, and every non-web channel, shows nothing new. The classifying
 * read's own failure is the route picker's to surface; the gate's four operations
 * each surface their failures LOUDLY here.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  ErrorState,
  Skeleton,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { conversationRoutesKey } from './keys';
import { MintEntryCodeDialog } from './MintEntryCodeDialog';
import { useEntryGate } from './useEntryGate';
import { EntryCodesTable } from './EntryCodesTable';
import { RevokeCodeDialog } from './RevokeCodeDialog';

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  margin: '0 0 var(--tai-space-4)',
};

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

export function EntryGate({ route }: { readonly route: string }): ReactNode {
  const api = useApi();
  const routes = useQuery({
    queryKey: conversationRoutesKey,
    queryFn: ({ signal }) => api.listConversationRoutes(signal),
  });

  // On the drill-in EntryGate is the only consumer of the route catalogue — the
  // route picker that otherwise surfaces this read's failure is unmounted here — so
  // its error is surfaced rather than swallowed. A still-loading read or a resolved
  // non-web route renders nothing.
  if (routes.isError) {
    return (
      <Card>
        <ErrorState message={errorMessage(routes.error)} onRetry={() => void routes.refetch()} />
      </Card>
    );
  }

  const record = routes.data?.items.find((item) => item.route_name === route);
  const identity =
    record?.door === 'channel' && record.channel === 'web' ? record.our_identity : null;
  if (identity === null) return null;
  return <EntryGatePanel identity={identity} />;
}

function EntryGatePanel({ identity }: { readonly identity: string }): ReactNode {
  const [minting, setMinting] = useState(false);
  const {
    gate,
    toggleMutation,
    revokeMutation,
    onToggle,
    confirmEnable,
    setConfirmEnable,
    pendingRevoke,
    setPendingRevoke,
  } = useEntryGate(identity);

  let body: ReactNode;
  if (gate.isPending) {
    body = <Skeleton height={120} />;
  } else if (gate.isError) {
    body = <ErrorState message={errorMessage(gate.error)} onRetry={() => void gate.refetch()} />;
  } else {
    body = (
      <div style={bodyStyle}>
        <Checkbox
          label="Require an entry code"
          checked={gate.data.enabled}
          disabled={toggleMutation.isPending}
          onCheckedChange={onToggle}
        />
        {toggleMutation.isError && !confirmEnable ? (
          <ErrorState message={errorMessage(toggleMutation.error)} />
        ) : null}
        <EntryCodesTable
          codes={gate.data.codes}
          onRevoke={(codeId) => {
            revokeMutation.reset();
            setPendingRevoke(codeId);
          }}
        />
      </div>
    );
  }

  return (
    <Card>
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }}>Entry gate</h2>
        <Button
          variant="primary"
          onClick={() => {
            setMinting(true);
          }}
        >
          Mint entry code
        </Button>
      </div>
      {body}
      {minting ? (
        <MintEntryCodeDialog
          identity={identity}
          onClose={() => {
            setMinting(false);
          }}
        />
      ) : null}
      {confirmEnable ? (
        <ConfirmDialog
          title="Turn on the entry gate"
          confirmLabel="Turn on anyway"
          pendingLabel="Turning on"
          confirmVariant="primary"
          isPending={toggleMutation.isPending}
          error={toggleMutation.isError ? toggleMutation.error : null}
          onConfirm={() => {
            toggleMutation.mutate(true);
          }}
          onClose={() => {
            toggleMutation.reset();
            setConfirmEnable(false);
          }}
        >
          <p style={{ margin: 0 }}>
            No live codes exist, so nobody can enter this route until you mint one. Turn the gate on
            anyway?
          </p>
        </ConfirmDialog>
      ) : null}
      {pendingRevoke !== null ? (
        <RevokeCodeDialog
          isError={revokeMutation.isError}
          error={revokeMutation.error}
          isPending={revokeMutation.isPending}
          onCancel={() => {
            setPendingRevoke(null);
          }}
          onConfirm={() => {
            revokeMutation.mutate(pendingRevoke);
          }}
        />
      ) : null}
    </Card>
  );
}
