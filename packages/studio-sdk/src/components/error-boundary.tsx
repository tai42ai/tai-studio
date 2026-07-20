/**
 * A generic render-error boundary: it contains a throw from its subtree and shows
 * the loud {@link ErrorState} in its place, so one failing region never blanks the
 * page around it. `label` prefixes the caught message to name the contained region
 * (e.g. the plugin whose content threw); `onError` observes the error for logging.
 * There is no in-place retry — the boundary resets by remounting, so callers that
 * want a reset give it a fresh `key`.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { errorMessage } from '../errors';
import { ErrorState } from './primitives';

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Prefixed to the caught error message, naming the contained region. */
  readonly label?: string;
  /** Called with the caught error and React's component stack, for logging. */
  readonly onError?: (error: unknown, info: ErrorInfo) => void;
}

// React passes whatever the subtree threw — an `Error`, but also a bare string
// or any object a plugin chose to throw — so the caught value is `unknown` and
// coerced to a readable string only for display. `hasError` is the caught flag
// (not a sentinel on `error`), so even a falsy throw such as `null` is contained.
interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      const { label } = this.props;
      const text = errorMessage(this.state.error);
      const message = label !== undefined ? `${label}: ${text}` : text;
      return <ErrorState message={message} />;
    }
    return this.props.children;
  }
}
