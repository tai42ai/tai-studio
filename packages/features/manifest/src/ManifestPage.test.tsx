import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ManifestPage } from './ManifestPage';
import { renderWithProviders } from './test-utils';

const MANIFEST = { mcp: [{ title: 'srv' }], user_tools: ['echo'] };

function fullClient() {
  return {
    getManifest: vi.fn().mockResolvedValue(MANIFEST),
    getMcpStatus: vi.fn().mockResolvedValue({ bound: { srv: ['a'] }, failed: [] }),
    listSubMcp: vi.fn().mockResolvedValue({}),
    listTools: vi.fn().mockResolvedValue(['echo']),
  };
}

describe('ManifestPage', () => {
  it('renders the three router tabs with the manifest tab active', async () => {
    renderWithProviders(<ManifestPage search={{}} />, { client: fullClient() });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Manifest', 'MCP', 'Sub-MCP']);
    // The default (manifest) tab's content renders.
    expect(await screen.findByText(/user_tools/)).toBeInTheDocument();
  });

  it('switches to the MCP tab and renders its content', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManifestPage search={{}} />, { client: fullClient() });

    await user.click(screen.getByRole('tab', { name: 'MCP' }));
    expect(await screen.findByText('Mounted servers')).toBeInTheDocument();
  });

  it('switches to the Sub-MCP tab and renders its content', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManifestPage search={{}} />, { client: fullClient() });

    await user.click(screen.getByRole('tab', { name: 'Sub-MCP' }));
    expect(await screen.findByText('Sub-MCP servers')).toBeInTheDocument();
  });
});
