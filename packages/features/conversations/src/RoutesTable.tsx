/**
 * Level 1 of the monitor: the route picker. Every stored conversation route is a
 * row — its name, the door it listens on (a channel medium, or the authed API),
 * the identity that medium reaches us at, and what a turn on it runs. Selecting a
 * row writes `?route=` and drills into that route's threads.
 *
 * Every server-supplied value renders as escaped React text (a table cell); no
 * route field is ever interpreted as markup.
 */
import type { ReactNode, RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Card,
  EmptyState,
  ScrollRegion,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  useApi,
} from '@tai42/studio-sdk';

import { EMPTY_PLACEHOLDER } from './format';
import { conversationRoutesKey } from './keys';
import { ReadFailure } from './read-states';

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
  const routes = useQuery({
    queryKey: conversationRoutesKey,
    queryFn: ({ signal }) => api.listConversationRoutes(signal),
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
      <Card>{body}</Card>
    </div>
  );
}
