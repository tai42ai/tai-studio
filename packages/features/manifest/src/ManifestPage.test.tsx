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
});
