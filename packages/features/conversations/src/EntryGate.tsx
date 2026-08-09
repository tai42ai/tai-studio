/**
 * The Entry gate section on a route's drill-in: a web route can be gated so its
 * chat page is served only to a navigation carrying a live entry code. The section
 * grafts the mission's four gate doors — the conversation monitor's first route
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  ScrollRegion,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { EMPTY_PLACEHOLDER, formatInstant } from './format';
import { conversationRoutesKey, webEntryGateKey } from './keys';
import { MintEntryCodeDialog } from './MintEntryCodeDialog';

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

/** The expiry cell: "Never" for a null expiry, else the locale-formatted instant. */
function formatExpiry(value: string | null): string {
  return value === null ? 'Never' : formatInstant(value);
}

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
  const api = useApi();
  const queryClient = useQueryClient();

  const [minting, setMinting] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const [confirmEnable, setConfirmEnable] = useState(false);

  const gate = useQuery({
    queryKey: webEntryGateKey(identity),
    queryFn: ({ signal }) => api.getWebEntryGate(identity, signal),
  });

  const invalidateGate = (): void => {
    void queryClient.invalidateQueries({ queryKey: webEntryGateKey(identity) });
  };

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => api.setWebEntryGate(identity, enabled),
    onSuccess: () => {
      setConfirmEnable(false);
      invalidateGate();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (codeId: string) => api.revokeWebEntryCode(identity, codeId),
    onSuccess: () => {
      setPendingRevoke(null);
      invalidateGate();
    },
  });

  // Turning the gate ON while no live code exists locks the route to everyone, so
  // it is confirmed first (allowed, just warned); every other flip is immediate.
  const onToggle = (next: boolean): void => {
    toggleMutation.reset();
    if (next && gate.data?.codes.length === 0) {
      setConfirmEnable(true);
      return;
    }
    toggleMutation.mutate(next);
  };

  let body: ReactNode;
  if (gate.isPending) {
    body = <Skeleton height={120} />;
  } else if (gate.isError) {
    body = <ErrorState message={errorMessage(gate.error)} onRetry={() => void gate.refetch()} />;
  } else {
    const { enabled, codes } = gate.data;
    body = (
      <div style={bodyStyle}>
        <Checkbox
          label="Require an entry code"
          checked={enabled}
          disabled={toggleMutation.isPending}
          onCheckedChange={onToggle}
        />
        {toggleMutation.isError && !confirmEnable ? (
          <ErrorState message={errorMessage(toggleMutation.error)} />
        ) : null}
        {codes.length === 0 ? (
          <EmptyState
            title="No entry codes"
            description="Mint a code to hand out — anyone who opens its chat link enters the gated route."
          />
        ) : (
          <ScrollRegion label="Entry codes">
            <Table>
              <THead>
                <TR>
                  <TH>Label</TH>
                  <TH>Created</TH>
                  <TH>Expires</TH>
                  <TH aria-label="Actions" />
                </TR>
              </THead>
              <TBody>
                {codes.map((code) => (
                  <TR key={code.code_id}>
                    <TD>{code.label ?? EMPTY_PLACEHOLDER}</TD>
                    <TD>{formatInstant(code.created_at)}</TD>
                    <TD>{formatExpiry(code.expires_at)}</TD>
                    <TD style={{ textAlign: 'right' }}>
                      <Button
                        variant="danger"
                        aria-label={`Revoke entry code ${code.label ?? code.code_id}`}
                        onClick={() => {
                          revokeMutation.reset();
                          setPendingRevoke(code.code_id);
                        }}
                      >
                        Revoke
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </ScrollRegion>
        )}
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
        <Dialog
          open
          title="Revoke entry code"
          description="Revoke this code? Its chat link stops working immediately and cannot be restored — a new code means revoke and mint."
          onOpenChange={(next) => {
            if (!next) setPendingRevoke(null);
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
            {revokeMutation.isError ? (
              <ErrorState message={errorMessage(revokeMutation.error)} />
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-3)' }}>
              <Button
                onClick={() => {
                  setPendingRevoke(null);
                }}
                disabled={revokeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  revokeMutation.mutate(pendingRevoke);
                }}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? <Spinner label="Revoking" /> : null}
                Revoke code
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}
