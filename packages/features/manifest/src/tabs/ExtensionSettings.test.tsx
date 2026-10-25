import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { emptyExtensionSettings, fullExtensionSettings } from '../fixtures';
import { renderWithProviders } from '../test-utils';
import { ExtensionSettings } from './ExtensionSettings';

function manifest(extension_settings = fullExtensionSettings()) {
  return { mcp: [], user_tools: [], extension_settings };
}

describe('ExtensionSettings', () => {
  it('renders the modules, the backend and one row per (entry, tool)', async () => {
    const getManifest = vi.fn().mockResolvedValue(manifest());
    renderWithProviders(<ExtensionSettings />, { client: { getManifest } });

    expect(await screen.findByText('pkg.ext')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'In the manifest' })).toBeInTheDocument();
    expect(screen.getByText('pkg.more')).toBeInTheDocument();
    expect(screen.getByText('pkg.backend')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Extension maps declared in the manifest' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'tools › a',
      'mcp › srv',
      'api_tools',
    ]);
    expect(rows.map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toEqual([
      'echo',
      'fetch',
      'shout',
    ]);
  });

  it('shows a config element marker as its !ENV string once expanded', async () => {
    const getManifest = vi.fn().mockResolvedValue(manifest());
    renderWithProviders(<ExtensionSettings />, { client: { getManifest } });

    await screen.findByText('pkg.ext');
    expect(screen.queryByText(/EXT_TOKEN/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText(/!ENV \$\{EXT_TOKEN\}/)).toBeInTheDocument();
  });

  it('shows the empty copy when the manifest declares nothing', async () => {
    const getManifest = vi.fn().mockResolvedValue(manifest(emptyExtensionSettings()));
    renderWithProviders(<ExtensionSettings />, { client: { getManifest } });

    expect(await screen.findByText('No extension settings')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The manifest declares no extension modules, no backend module and no extension maps.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the muted no-maps line when a module is set but no map is', async () => {
    const getManifest = vi
      .fn()
      .mockResolvedValue(
        manifest({ ...emptyExtensionSettings(), extensions_modules: ['pkg.ext'] }),
      );
    renderWithProviders(<ExtensionSettings />, { client: { getManifest } });

    expect(
      await screen.findByText('No tool in the manifest has extensions attached.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // The unset backend reads as None.
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('renders a read failure as an error with Retry', async () => {
    const getManifest = vi.fn().mockRejectedValue(new Error('manifest boom'));
    renderWithProviders(<ExtensionSettings />, { client: { getManifest } });

    expect(await screen.findByRole('alert')).toHaveTextContent('manifest boom');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
