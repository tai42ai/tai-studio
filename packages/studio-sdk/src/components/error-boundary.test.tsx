import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './error-boundary';

/** A component whose render throws the given value. */
function Throw({ value }: { readonly value: unknown }): ReactElement {
  throw value;
}

describe('ErrorBoundary', () => {
  // React logs a handled boundary error to console.error; silence that one line
  // around each render so the caught throw doesn't spam the test output.
  function renderContained(node: ReactElement): void {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(node);
    } finally {
      errorSpy.mockRestore();
    }
  }

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <span>all good</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('contains a thrown Error and shows its message in a loud state', () => {
    renderContained(
      <ErrorBoundary>
        <Throw value={new Error('boom')} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('prefixes the caught message with the label', () => {
    renderContained(
      <ErrorBoundary label="acme">
        <Throw value={new Error('boom')} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('acme: boom');
  });

  it('shows a useful message for a non-Error throw instead of "undefined"', () => {
    renderContained(
      <ErrorBoundary label="acme">
        <Throw value="oops" />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('acme: oops');
    expect(alert).not.toHaveTextContent('undefined');
  });

  it('contains even a falsy throw such as null', () => {
    renderContained(
      <ErrorBoundary label="acme">
        <Throw value={null} />
        <span>sibling</span>
      </ErrorBoundary>,
    );
    // The subtree is replaced by the loud state — a null throw must not slip past.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('sibling')).not.toBeInTheDocument();
  });

  it('reports the caught value to onError', () => {
    const onError = vi.fn();
    renderContained(
      <ErrorBoundary onError={onError}>
        <Throw value="oops" />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe('oops');
  });
});
