/**
 * The router's `defaultNotFoundComponent` for unknown paths. Renders under the root
 * outlet, which sits inside the app's Navigation/Theme providers, so design tokens
 * apply here.
 */
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { EmptyState } from '@tai42/studio-sdk';

const wrapperStyle = { padding: 'var(--tai-space-6)' } as const;

export function NotFoundComponent(): ReactNode {
  return (
    <div style={wrapperStyle}>
      <EmptyState
        title="Page not found"
        description="This page does not exist or may have moved."
        action={
          <Link to="/" className="tai-btn tai-btn-secondary">
            Go home
          </Link>
        }
      />
    </div>
  );
}
