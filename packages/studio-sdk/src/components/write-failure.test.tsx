import type { ApiClient } from '@tai42/api-client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiProvider } from '../hooks/useApi';
import { WriteFailure } from './write-failure';

const MESSAGE =
  "tool selection of 'relay' cannot be checked: the server did not list its tools: MCP server 'relay' start still in progress after 10s; it continues up to the start budget 60s";

/** The client's reader of the starting refusal, answering for the one error this test raises. */
const STARTING = new Error(MESSAGE);
const client = {
  isMcpStartingError: (error: unknown) => error === STARTING,
} as unknown as ApiClient;

function renderFailure(error: unknown): void {
  render(
    <ApiProvider value={client}>
      <WriteFailure error={error} />
    </ApiProvider>,
  );
}

describe('WriteFailure', () => {
  it('shows a write refused while an MCP server is still starting on the warn ground, naming the start', () => {
    renderFailure(STARTING);
    const refusal = screen.getByRole('alert');
    expect(refusal).toHaveClass('tai-warn-state');
    expect(refusal).toHaveTextContent('An MCP server is still starting');
    expect(refusal).toHaveTextContent(MESSAGE);
    expect(refusal).toHaveTextContent('Nothing was changed. Try again once it has started.');
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('shows any other failure in the error state with its message', () => {
    renderFailure(new Error('upstream down'));
    const failure = screen.getByRole('alert');
    expect(failure).toHaveClass('tai-error-state');
    expect(failure).toHaveTextContent('Something went wrong');
    expect(failure).toHaveTextContent('upstream down');
    expect(screen.queryByText('An MCP server is still starting')).toBeNull();
  });
});
