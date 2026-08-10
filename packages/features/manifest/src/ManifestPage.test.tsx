import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ManifestPage } from './ManifestPage';
import { renderWithProviders } from './test-utils';

const MANIFEST = { mcp: [{ title: 'srv' }], user_tools: ['echo'] };

/** The MCP-entry schema the config editor drives its form from. */
const MCP_SCHEMA = {
  $defs: {
    MCPConfig: {
      type: 'object',
      title: 'MCPConfig',
      properties: { command: { type: 'string', title: 'Command' } },
    },
  },
  type: 'object',
  title: 'TaiMCPConfig',
  required: ['title', 'config'],
  properties: {
    title: { type: 'string', title: 'Title' },
    config: { $ref: '#/$defs/MCPConfig' },
  },
} as const;

function fullClient() {
  return {
    // ManifestTab reads the RESOLVED manifest; the MCP config editor reads the
    // reference-preserving one.
    getManifest: vi.fn().mockResolvedValue(MANIFEST),
    getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
    getMcpStatus: vi.fn().mockResolvedValue({ bound: { srv: ['a'] }, failed: [] }),
    getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
    listExtensions: vi.fn().mockResolvedValue([]),
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

  it('confirms before a tab switch discards unsaved MCP config edits', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManifestPage search={{}} />, { client: fullClient() });

    // Open the MCP tab and dirty the config editor.
    await user.click(screen.getByRole('tab', { name: 'MCP' }));
    const title = await screen.findByLabelText('Title');
    await user.type(title, ' edited');

    // Switching tabs while dirty opens the confirm and HOLDS the switch (the panel
    // unmounts on switch, so an unconfirmed switch would silently drop the edits).
    await user.click(screen.getByRole('tab', { name: 'Manifest' }));
    expect(
      await screen.findByText('This editor has unsaved changes. Leaving now discards them.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.queryByText(/user_tools/)).toBeNull();

    // Confirming the discard completes the switch to the Manifest tab.
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByText(/user_tools/)).toBeInTheDocument();
  });
});
