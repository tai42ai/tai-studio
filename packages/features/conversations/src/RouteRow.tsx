/**
 * One conversation-route row: its name (a link that drills into the route's
 * threads), the door it listens on, the identity that medium reaches us at, its
 * target, and the write-gated Edit / Delete actions. Every server-supplied value
 * renders as escaped React text; no route field is interpreted as markup.
 */
import type { ReactNode } from 'react';

import { AppLink, Badge, Button, TD, TR } from '@tai42/studio-sdk';
import type { ConversationRoute } from '@tai42/api-client';

import { EMPTY_PLACEHOLDER } from './format';

/** The accessible name of a route row's link; the return-focus target after Back. */
export function routeRowLabel(routeName: string): string {
  return `Open route ${routeName}`;
}

export function RouteRow({
  route,
  canWrite,
  canDelete,
  onEdit,
  onDelete,
}: {
  readonly route: ConversationRoute;
  readonly canWrite: boolean;
  readonly canDelete: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  return (
    <TR>
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
          style={{ display: 'inline-flex', gap: 'var(--tai-space-2)', justifyContent: 'flex-end' }}
        >
          {canWrite ? (
            <Button aria-label={`Edit route ${route.route_name}`} onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="ghost"
              aria-label={`Delete route ${route.route_name}`}
              onClick={onDelete}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </TD>
    </TR>
  );
}
