/**
 * Level 1 of the monitor: the route picker and the route CRUD surface. Every
 * stored conversation route is a row — its name, the door it listens on (a channel
 * medium, or the authed API), the identity that medium reaches us at, and what a
 * turn on it runs. Selecting a row writes `?route=` and drills into that route's
 * threads.
 *
 * A "Create route" button opens the {@link RouteFormDialog}; each row carries an
 * Edit door (the same dialog, prefilled) and a Delete door behind the house
 * `ConfirmDialog` — route deletion is destructive and authority-changing
 * server-side (it drops the routing row and reclaims the thread indexes it owned).
 *
 * Every server-supplied value renders as escaped React text (a table cell); no
 * route field is ever interpreted as markup.
 */
import { useState, type ReactNode, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ScrollRegion,
  Skeleton,
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
import type { ConversationRoute } from '@tai42/api-client';

import { EMPTY_PLACEHOLDER } from './format';
import { conversationRoutesKey } from './keys';
import { ReadFailure } from './read-states';
import { RouteFormDialog } from './RouteFormDialog';

/** The accessible name of a route row's link; the return-focus target after Back. */
export function routeRowLabel(routeName: string): string {
  return `Open route ${routeName}`;
}

export function RoutesTable({
  listRef,
}: {
  readonly listRef: RefObject<HTMLDivElement | null>;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const routes = useQuery({
    queryKey: conversationRoutesKey,
    queryFn: ({ signal }) => api.listConversationRoutes(signal),
  });

  // Create and edit ride the one UPSERT door (`POST /api/conversations/{route_name}`);
  // delete rides the `DELETE` on the same path. Both are DYNAMIC (templated) write
  // routes, so — following the house static-placeholder idiom — the interpolated path
  // resolves to a full-projection gate: a scoped projection can never method-express a
  // templated route, so its write affordances stay withdrawn (projection ⊆ gate). The
  // read table below is unaffected; only the write controls gate.
  const canWrite = useCanWrite('/api/conversations/{route_name}', 'POST');
  const canDelete = useCanWrite('/api/conversations/{route_name}', 'DELETE');

  // `creating` opens the blank form; `editing` opens it prefilled from a row;
  // `pendingDelete` names the row awaiting a destructive-delete confirm.
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ConversationRoute | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (routeName: string) => api.deleteConversationRoute(routeName),
    onSuccess: () => {
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: conversationRoutesKey });
    },
  });

  let body: ReactNode;
  if (routes.isPending) {
    body = <Skeleton height={160} />;
  } else if (routes.isError) {
    body = (
      <ReadFailure
        error={routes.error}
        onRetry={() => void routes.refetch()}
        forbiddenDescription="Reading the conversation routing table needs authority over it."
        notFoundDescription="The conversation routing table is not reachable on this deployment."
      />
    );
  } else if (routes.data.items.length === 0) {
    body = (
      <EmptyState
        title="No conversation routes"
        description="A route binds an inbound door — a channel medium or the authed API — to the agent or tool that answers it. Create one to start monitoring conversations."
      />
    );
  } else {
    body = (
      <ScrollRegion label="Conversation routes">
        <Table data-testid="conversation-routes-table">
          <THead>
            <TR>
              <TH>Route</TH>
              <TH>Door</TH>
              <TH>Identity</TH>
              <TH>Target</TH>
              <TH aria-label="Actions" />
            </TR>
          </THead>
          <TBody>
            {routes.data.items.map((route) => (
              <TR key={route.route_name}>
                <TD>
                  <AppLink
                    to="conversations"
                    search={{ route: route.route_name }}
                    className="tai-table-id"
                    aria-label={routeRowLabel(route.route_name)}
                  >
                    {route.route_name}
                  </AppLink>
                </TD>
                <TD>
                  <Badge>{route.channel ?? route.door}</Badge>
                </TD>
                <TD>
                  <span className="tai-mono">{route.our_identity ?? EMPTY_PLACEHOLDER}</span>
                </TD>
                <TD>
                  <span className="tai-mono">{`${route.target_kind}: ${route.target_name}`}</span>
                </TD>
                <TD style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: 'var(--tai-space-2)',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {canWrite ? (
                      <Button
                        aria-label={`Edit route ${route.route_name}`}
                        onClick={() => {
                          setEditing(route);
                        }}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="danger"
                        aria-label={`Delete route ${route.route_name}`}
                        onClick={() => {
                          // Clear any prior delete failure so this confirm opens clean,
                          // never carrying a stale error from a different route's attempt.
                          deleteMutation.reset();
                          setPendingDelete(route.route_name);
                        }}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
    );
  }

  return (
    // Focusable, unreachable by Tab: it is where focus lands on the way back from
    // a route whose row is no longer listed. Unnamed on purpose — what it holds
    // (the routes table, or the empty note in its place) is what should be read.
    <div ref={listRef} tabIndex={-1} data-testid="conversation-routes-list">
      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--tai-space-3)',
            marginBottom: 'var(--tai-space-4)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }}>Conversation routes</h2>
          {canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setCreating(true);
              }}
            >
              Create route
            </Button>
          ) : null}
        </div>
        {body}
      </Card>
      {creating ? (
        <RouteFormDialog
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
      {editing !== null ? (
        <RouteFormDialog
          initial={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {pendingDelete !== null ? (
        <ConfirmDialog
          title="Delete route"
          confirmLabel="Delete route"
          pendingLabel="Deleting"
          isPending={deleteMutation.isPending}
          error={deleteMutation.isError ? errorMessage(deleteMutation.error) : null}
          onConfirm={() => {
            deleteMutation.mutate(pendingDelete);
          }}
          onClose={() => {
            setPendingDelete(null);
          }}
        >
          <p style={{ margin: 0 }}>
            Delete the route <strong>{pendingDelete}</strong>? This drops the routing row and
            forgets the threads it owned. It cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
