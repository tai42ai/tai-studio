import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fullExtensionSettings } from '../fixtures';
import { renderWithProviders } from '../test-utils';
import { ManifestTab } from './ManifestTab';

describe('ManifestTab', () => {
  it('renders mcp and user_tools as a JsonTree, without the extension settings', async () => {
    const getManifest = vi.fn().mockResolvedValue({
      mcp: [{ title: 'srv' }],
      user_tools: ['echo'],
      extension_settings: fullExtensionSettings(),
    });
    renderWithProviders(<ManifestTab />, { client: { getManifest } });

    expect(await screen.findByText(/user_tools/)).toBeInTheDocument();
    expect(screen.getByText(/"echo"/)).toBeInTheDocument();
    expect(screen.queryByText(/extension_settings/)).not.toBeInTheDocument();
  });

  it('shows an empty state when the manifest declares no MCP servers and no user tools', async () => {
    const getManifest = vi.fn().mockResolvedValue({
      mcp: [],
      user_tools: [],
      extension_settings: fullExtensionSettings(),
    });
    renderWithProviders(<ManifestTab />, { client: { getManifest } });

    expect(await screen.findByText('No MCP servers or user tools')).toBeInTheDocument();
    expect(
      screen.getByText('The manifest declares no MCP servers and no user tools.'),
    ).toBeInTheDocument();
  });

  it('surfaces a fetch failure as a loud error state', async () => {
    const getManifest = vi.fn().mockRejectedValue(new Error('manifest boom'));
    renderWithProviders(<ManifestTab />, { client: { getManifest } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('manifest boom');
  });
});
