/**
 * The trigger-links section on the hooks page: a table of live links (name, topic,
 * the bound execution key, the trigger-auth door, expiry, a params indicator, hash
 * prefix, and a per-row revoke behind a confirm dialog) plus a "Create trigger
 * link" button that opens the create/QR flow.
 *
 * Server state is surfaced loudly: loading → `Skeleton`, empty → `EmptyState`, and
 * any failed request → an always-visible `ErrorState` (a swallowed list error would
 * hide the whole revocation surface). A rejected revoke keeps the row and shows the
 * failure in the confirm dialog — the kill switch never fails silently.
 *
 * The mutating controls (create + revoke) gate on the caller's WRITE capability for
 * the trigger-links surface. The DELETE route is templated (name-parameterized), so
 * the projection can only represent it method-lessly; the collection POST
 * capability is the sound write witness for BOTH mutations, since they are one
 * hooks-tag `write` tier — a `read`-only grantee sees the list without controls
 * that would 403 on submit.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
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
  useCanWrite,
} from '@tai42/studio-sdk';
import type { TriggerLinkRecord } from '@tai42/api-client';

import { TRIGGER_LINKS_KEY_ROOT, triggerLinksListKey } from './keys';
import { CreateTriggerLinkDialog } from './CreateTriggerLinkDialog';
import { describeTriggerAuth } from './trigger-auth';

/** The write route whose POST capability gates create AND revoke (see the header). */
const TRIGGER_LINKS_WRITE_ROUTE = '/api/hooks/trigger-links';

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  margin: '0 0 var(--tai-space-4)',
};

/** A link carries params when `tool_kwargs` is a NON-EMPTY object; `{}` and `null`
 * both read as param-less. */
function hasParams(record: TriggerLinkRecord): boolean {
  return record.tool_kwargs !== null && Object.keys(record.tool_kwargs).length > 0;
}

/** The expiry cell: "Permanent" for a null expiry, else the locale-formatted
 * instant (an unparseable value shows verbatim). */
function formatExpiryCell(value: string | null): string {
  if (value === null) return 'Permanent';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function TriggerLinksList(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite(TRIGGER_LINKS_WRITE_ROUTE, 'POST');

  const [creating, setCreating] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);

  const query = useQuery({
    queryKey: triggerLinksListKey(),
    queryFn: ({ signal }) => api.listTriggerLinks(signal),
  });

  const revokeMutation = useMutation({
    mutationFn: (name: string) => api.deleteTriggerLink(name),
    onSuccess: () => {
      setPendingRevoke(null);
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === TRIGGER_LINKS_KEY_ROOT,
      });
    },
  });

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  } else if (query.data.items.length === 0) {
    body = (
      <EmptyState
        title="No trigger links"
        description="Create a trigger link to fire a hook topic from a scannable QR or shared URL."
      />
    );
  } else {
    body = (
      <ScrollRegion label="Trigger links">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Topic</TH>
              <TH>Runs as</TH>
              <TH>Trigger auth</TH>
              <TH>Expiry</TH>
              <TH>Params</TH>
              <TH>Hash</TH>
              <TH aria-label="Actions" />
            </TR>
          </THead>
          <TBody>
            {query.data.items.map((record) => (
              <TR key={record.name}>
                <TD>{record.name}</TD>
                <TD>{record.topic}</TD>
                <TD>
                  <code style={{ fontSize: 'var(--tai-text-sm)' }}>{record.execution_key}</code>
                </TD>
                <TD>
                  <Badge variant="neutral">{describeTriggerAuth(record.trigger_auth)}</Badge>
                </TD>
                <TD>{formatExpiryCell(record.expires_at)}</TD>
                <TD>{hasParams(record) ? <Badge variant="neutral">params</Badge> : null}</TD>
                <TD>
                  <code style={{ fontSize: 'var(--tai-text-sm)' }}>{record.token_hash_prefix}</code>
                </TD>
                <TD style={{ textAlign: 'right' }}>
                  {canWrite ? (
                    <Button
                      variant="ghost"
                      aria-label={`Revoke trigger link ${record.name}`}
                      onClick={() => {
                        revokeMutation.reset();
                        setPendingRevoke(record.name);
                      }}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
    );
  }

  return (
    <Card>
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }}>Trigger links</h2>
        {canWrite ? (
          <Button
            variant="primary"
            onClick={() => {
              setCreating(true);
            }}
          >
            Create trigger link
          </Button>
        ) : null}
      </div>
      {body}
      {creating ? (
        <CreateTriggerLinkDialog
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
      {pendingRevoke !== null ? (
        <Dialog
          open
          title="Revoke trigger link"
          description={`Revoke "${pendingRevoke}"? Its URL stops working immediately and cannot be restored — a new link means revoke and re-create.`}
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
                Revoke link
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}
