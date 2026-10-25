import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { emptyExtensionSettings } from './fixtures';
import { ManifestPage } from './ManifestPage';
import { renderWithProviders } from './test-utils';

function client(manifest: unknown) {
  return {
    getManifest: vi.fn().mockResolvedValue(manifest),
    listExtensions: vi.fn().mockResolvedValue([]),
  };
}

describe('ManifestPage', () => {
  it('renders the Administration manifest document and its Extensions section', async () => {
    renderWithProviders(<ManifestPage search={{}} />, {
      client: client({
        mcp: [{ title: 'srv' }],
        user_tools: ['echo'],
        extension_settings: emptyExtensionSettings(),
      }),
    });

    expect(screen.getByRole('heading', { name: 'Manifest' })).toBeInTheDocument();
    expect(await screen.findByText(/user_tools/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Extensions' })).toBeInTheDocument();
  });

  it('shows the declared extension settings below an empty document, never "The manifest is empty"', async () => {
    renderWithProviders(<ManifestPage search={{}} />, {
      client: client({
        mcp: [],
        user_tools: [],
        extension_settings: {
          ...emptyExtensionSettings(),
          extensions_modules: ['pkg.ext'],
          backend_module: 'pkg.backend',
          tools: [{ title: 'a', extensions: { echo: [['ask_external']] } }],
        },
      }),
    });

    expect(await screen.findByText('No MCP servers or user tools')).toBeInTheDocument();
    expect(
      screen.getByText('The manifest declares no MCP servers and no user tools.'),
    ).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Extensions' });
    expect(await within(section).findByText('pkg.ext')).toBeInTheDocument();
    expect(within(section).getByText('pkg.backend')).toBeInTheDocument();
    expect(within(section).getByText('tools › a')).toBeInTheDocument();
    expect(screen.queryByText('The manifest is empty')).not.toBeInTheDocument();
  });
});
