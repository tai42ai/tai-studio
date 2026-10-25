/**
 * The read-only route detail under a feature group: each route's method and path,
 * shown as an escaped mono line, with a badge for its role reach — the `read`/`write`
 * class of a route a level opens, or `admin-only`, `self-service` or `public`.
 */
import type { AuthRoute } from '@tai42/api-client';
import { Badge } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

const routeListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 'var(--tai-space-2) 0 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

const routeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

/** The badge of a route a level opens: its `read`/`write` action class. */
function levelBadge(route: AuthRoute): ReactNode {
  switch (route.action) {
    case 'read':
      return <Badge variant="neutral">read</Badge>;
    case 'write':
      return <Badge variant="primary">write</Badge>;
    default:
      throw new Error(
        `Route ${route.path} has role reach "level" but action ${JSON.stringify(route.action)}; a level opens only read/write routes.`,
      );
  }
}

/** The badge variant + label for a route's role reach in the read-only detail. */
function reachBadge(route: AuthRoute): ReactNode {
  switch (route.role_reach) {
    case 'level':
      return levelBadge(route);
    case 'admin_only':
      return (
        <Badge variant="warning">
          {route.action === 'secret' ? 'sensitive — admin only' : 'admin-only'}
        </Badge>
      );
    case 'self_service':
      return <Badge variant="neutral">self-service</Badge>;
    case 'public':
      return <Badge variant="neutral">public</Badge>;
    case null:
      return null;
  }
}

export function RouteDetail({ routes }: { readonly routes: readonly AuthRoute[] }): ReactNode {
  return (
    <ul style={routeListStyle}>
      {routes.map((route) => (
        <li key={`${route.methods.join(',')} ${route.path}`} style={routeRowStyle}>
          <span className="tai-mono">
            {route.methods.join(', ')} {route.path}
          </span>
          {reachBadge(route)}
        </li>
      ))}
    </ul>
  );
}
