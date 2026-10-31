import type { ApiClient } from '@tai42/api-client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiProvider } from '../hooks/useApi';
import { WriteFailure } from './write-failure';

const STARTING_MESSAGE =
  "tool selection of 'relay' cannot be checked: the server did not list its tools: MCP server 'relay' start still in progress after 10s; it continues up to the start budget 60s";
const NOT_LOADED_MESSAGE =
  "tool selection of 'relay' cannot be checked: the server did not list its tools: MCP server 'relay' is not loaded on this worker; a reload binds it";

/**
 * The client's readers of the two listing refusals, each answering for the one error this
 * test raises.
 */
const STARTING = new Error(STARTING_MESSAGE);
const NOT_LOADED = new Error(NOT_LOADED_MESSAGE);
const client = {
  isMcpStartingError: (error: unknown) => error === STARTING,
  isMcpNotLoadedError: (error: unknown) => error === NOT_LOADED,
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
    expect(refusal).toHaveTextContent(STARTING_MESSAGE);
    expect(refusal).toHaveTextContent('Nothing was changed. Try again once it has started.');
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('shows a write refused because the worker has not loaded an MCP server on the warn ground, naming the reload', () => {
    renderFailure(NOT_LOADED);
    const refusal = screen.getByRole('alert');
    expect(refusal).toHaveClass('tai-warn-state');
    expect(refusal).toHaveTextContent('An MCP server is not loaded on the worker that answered');
    expect(refusal).toHaveTextContent(NOT_LOADED_MESSAGE);
    expect(refusal).toHaveTextContent('Nothing was changed. Reload the server, then try again.');
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('shows any other failure in the error state with its message', () => {
    renderFailure(new Error('upstream down'));
    const failure = screen.getByRole('alert');
    expect(failure).toHaveClass('tai-error-state');
    expect(failure).toHaveTextContent('Something went wrong');
    expect(failure).toHaveTextContent('upstream down');
    expect(screen.queryByText('An MCP server is still starting')).toBeNull();
    expect(
      screen.queryByText('An MCP server is not loaded on the worker that answered'),
    ).toBeNull();
  });
});
