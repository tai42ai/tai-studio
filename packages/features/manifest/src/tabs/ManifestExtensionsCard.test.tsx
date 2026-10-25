import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fullExtensionSettings } from '../fixtures';
import { renderWithProviders } from '../test-utils';
import { ManifestExtensionsCard } from './ManifestExtensionsCard';

describe('ManifestExtensionsCard', () => {
  it('is a section named by its Extensions heading, holding both parts', async () => {
    const client = {
      listExtensions: vi
        .fn()
        .mockResolvedValue([
          { name: 'ask_external', kind: 'transformer', multiple: true, config_schema: null },
        ]),
      getManifest: vi.fn().mockResolvedValue({
        mcp: [],
        user_tools: [],
        extension_settings: fullExtensionSettings(),
      }),
    };
    renderWithProviders(<ManifestExtensionsCard />, { client });

    expect(screen.getByRole('heading', { level: 2, name: 'Extensions' })).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Extensions' });
    expect(
      within(section).getByRole('heading', { level: 3, name: 'Loaded extensions' }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('heading', { level: 3, name: 'In the manifest' }),
    ).toBeInTheDocument();
    expect(await within(section).findByText('Kind: transformer')).toBeInTheDocument();
    expect(await within(section).findByText('pkg.backend')).toBeInTheDocument();
  });
});
