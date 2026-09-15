/**
 * The read-only route detail under a feature group: each route's method + action
 * class, shown as an escaped mono line with an action badge.
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

/** The badge variant + label for a route's action class in the read-only detail. */
function actionBadge(action: AuthRoute['action']): ReactNode {
  switch (action) {
    case 'read':
      return <Badge variant="neutral">read</Badge>;
    case 'write':
      return <Badge variant="primary">write</Badge>;
    case 'fenced':
      return <Badge variant="warning">admin-only</Badge>;
    case 'secret':
      return <Badge variant="warning">sensitive — admin only</Badge>;
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
          {actionBadge(route.action)}
        </li>
      ))}
    </ul>
  );
}
