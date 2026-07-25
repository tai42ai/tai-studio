/**
 * App-level error surfaces, both built on the SDK's loud `ErrorState` so a caught
 * failure shows its message rather than blanking the page.
 *
 * `RouteErrorComponent` is the router's `defaultErrorComponent`: any error thrown
 * by a route component or loader renders here, with a Retry that invalidates the
 * router — re-running the route's loaders and, because the fresh `loadedAt` is the
 * error boundary's reset key, clearing the boundary too. That covers both a
 * render throw and a loader throw (whose error is persisted on the match and would
 * re-throw on the next render, so merely resetting the boundary would be a no-op).
 *
 * `AppErrorBoundary` is a React error boundary wrapping the shell, so a render
 * throw OUTSIDE the routed tree (the navigation layer, the router provider) is
 * still caught and shown loudly. React logs the caught error to the console on its
 * own; this only adds the visible surface and a Retry that re-mounts the subtree.
 */
import { Component, type ReactNode } from 'react';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { ErrorState, errorMessage } from '@tai42/studio-sdk';

const wrapperStyle = { padding: 'var(--tai-space-6)' } as const;

export function RouteErrorComponent({ error }: ErrorComponentProps): ReactNode {
  const router = useRouter();
  return (
    <div style={wrapperStyle}>
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => {
          void router.invalidate();
        }}
      />
    </div>
  );
}

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      return (
        <div style={wrapperStyle}>
          <ErrorState message={errorMessage(error)} onRetry={this.reset} />
        </div>
      );
    }
    return this.props.children;
  }
}
