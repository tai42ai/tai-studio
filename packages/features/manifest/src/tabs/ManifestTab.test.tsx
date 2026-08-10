import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test-utils';
import { ManifestTab } from './ManifestTab';

describe('ManifestTab', () => {
  it('renders the manifest as a JsonTree', async () => {
    const getManifest = vi
      .fn()
      .mockResolvedValue({ mcp: [{ title: 'srv' }], user_tools: ['echo'] });
    renderWithProviders(<ManifestTab />, { client: { getManifest } });

    expect(await screen.findByText(/user_tools/)).toBeInTheDocument();
    expect(screen.getByText(/"echo"/)).toBeInTheDocument();
  });

  it('shows an empty state when the manifest carries nothing', async () => {
    const getManifest = vi.fn().mockResolvedValue({ mcp: [], user_tools: [] });
    renderWithProviders(<ManifestTab />, { client: { getManifest } });

    expect(await screen.findByText('The manifest is empty')).toBeInTheDocument();
  });

  it('surfaces a fetch failure as a loud error state', async () => {
    const getManifest = vi.fn().mockRejectedValue(new Error('manifest boom'));
    renderWithProviders(<ManifestTab />, { client: { getManifest } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('manifest boom');
  });
});
