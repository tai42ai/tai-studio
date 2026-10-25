/**
 * The trigger-links section on the hooks page: a table of live links (each row a
 * {@link TriggerLinkRow}) plus a "Create trigger link" button that opens the
 * create/QR flow. A per-row revoke opens {@link RevokeTriggerLinkDialog}.
 *
 * Server state is surfaced loudly: loading → `Skeleton`, empty → `EmptyState`, and
 * any failed request → an always-visible `ErrorState` (a swallowed list error would
 * hide the whole revocation surface).
 *
 * Each mutating control gates on the caller's capability for its own route: create on
 * the collection `POST`, revoke on the templated `DELETE /api/hooks/trigger-links/{name}`.
 * A `read`-only grantee sees the list without controls that would 403 on submit.
 */
import { apiRoutes } from '@tai42/api-client';
import {
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  ScrollRegion,
  Skeleton,
  Table,
  TBody,
  TH,
  THead,
  TR,
  useApi,
  useCanWrite,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { CreateTriggerLinkDialog } from './CreateTriggerLinkDialog';
import { triggerLinksListKey } from './keys';
import { RevokeTriggerLinkDialog } from './RevokeTriggerLinkDialog';
import { TriggerLinkRow } from './TriggerLinkRow';

/** The routes the create and the revoke controls gate on (see the header). */
const CREATE_ROUTE = apiRoutes.post_api_hooks_trigger_links;
const REVOKE_ROUTE = apiRoutes.delete_api_hooks_trigger_links_name;

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  margin: '0 0 var(--tai-space-4)',
};

export function TriggerLinksList(): ReactNode {
  const api = useApi();
  const canCreate = useCanWrite(CREATE_ROUTE.path, CREATE_ROUTE.method);
  const canRevoke = useCanWrite(REVOKE_ROUTE.path, REVOKE_ROUTE.method);

  const [creating, setCreating] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);

  const query = useQuery({
    queryKey: triggerLinksListKey(),
    queryFn: ({ signal }) => api.listTriggerLinks(signal),
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
              <TriggerLinkRow
                key={record.name}
                record={record}
                canRevoke={canRevoke}
                onRevoke={setPendingRevoke}
              />
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
        {canCreate ? (
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
        <RevokeTriggerLinkDialog
          name={pendingRevoke}
          onClose={() => {
            setPendingRevoke(null);
          }}
        />
      ) : null}
    </Card>
  );
}
