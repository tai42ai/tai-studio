import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ManifestPage } from './ManifestPage';
import { renderWithProviders } from './test-utils';

const MANIFEST = { mcp: [{ title: 'srv' }], user_tools: ['echo'] };

function client() {
  return {
    // The page now shows only the loaded-manifest artifact view.
    getManifest: vi.fn().mockResolvedValue(MANIFEST),
  };
}

describe('ManifestPage', () => {
  it('renders the Administration manifest artifact view', async () => {
    renderWithProviders(<ManifestPage search={{}} />, { client: client() });

    // The page header names the Administration surface.
    expect(screen.getByRole('heading', { name: 'Manifest' })).toBeInTheDocument();
    // The loaded manifest renders as an escaped JSON tree.
    expect(await screen.findByText(/user_tools/)).toBeInTheDocument();
  });

  it('no longer carries the MCP or Sub-MCP tabs (they moved to Connections)', async () => {
    renderWithProviders(<ManifestPage search={{}} />, { client: client() });

    await screen.findByText(/user_tools/);
    // The tab chrome is gone: no tablist, and the moved surfaces are not here.
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText('Mounted servers')).toBeNull();
    expect(screen.queryByText('Sub-MCP servers')).toBeNull();
  });
});
