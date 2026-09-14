import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppLink } from '@tai42/studio-sdk';

import {
  DISCARD_PROMPT,
  MANIFEST,
  MCP_SCHEMA,
  renderWithProviders,
  status,
} from './test-utils-mcp-servers';
import { McpServersSection } from './mcp-servers';

describe('McpServersSection — dirty-editor navigation guard', () => {
  /** Base stub for the config editor with one editable entry to dirty. */
  function guardClient() {
    return {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
  }

  it('holds a navigation away from a dirty config editor behind the discard confirm', async () => {
    const user = userEvent.setup();
    // A sibling AppLink drives a real shell navigation through the same
    // NavigationProvider the section mounts its DirtyGuardBoundary under.
    const { navigate } = renderWithProviders(
      <>
        <McpServersSection />
        <AppLink to="tools">Leave</AppLink>
      </>,
      { client: guardClient() },
    );

    const entry = await screen.findByTestId('mcp-entry-0');
    await user.type(within(entry).getByLabelText('Title'), '-edited');

    // Leaving arms the guard: the shared discard confirm appears and the navigation
    // is HELD (the boundary's route guard vetoed the transition pending the answer).
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    expect(await screen.findByText(DISCARD_PROMPT)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();

    // Cancel keeps the edit and stays put — the navigation never fires.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText(DISCARD_PROMPT)).toBeNull();
    });
    expect(within(screen.getByTestId('mcp-entry-0')).getByLabelText('Title')).toHaveValue(
      'srv-edited',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets the navigation through once the discard is confirmed', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(
      <>
        <McpServersSection />
        <AppLink to="tools">Leave</AppLink>
      </>,
      { client: guardClient() },
    );

    const entry = await screen.findByTestId('mcp-entry-0');
    await user.type(within(entry).getByLabelText('Title'), '-edited');

    await user.click(screen.getByRole('link', { name: 'Leave' }));
    await screen.findByText(DISCARD_PROMPT);
    // Confirming the discard releases the held navigation to the shell.
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('tools', undefined);
    });
  });

  it('does not guard a clean editor — navigation passes straight through', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(
      <>
        <McpServersSection />
        <AppLink to="tools">Leave</AppLink>
      </>,
      { client: guardClient() },
    );

    // No edit: the editor is clean, so nothing arms the guard.
    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('link', { name: 'Leave' }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('tools', undefined);
    });
    expect(screen.queryByText(DISCARD_PROMPT)).toBeNull();
  });
});
