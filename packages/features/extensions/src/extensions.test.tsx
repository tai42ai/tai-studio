import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, Extension } from '@tai42/api-client';

import { ExtensionsPage } from './extensions';
import { renderWithProviders } from './test-utils';

/**
 * A stub client for the CATALOG assertions. The page also mounts the apply panel,
 * which reads the tool universe + the preset list; both resolve empty here
 * so the panel renders quietly (no tool selected, no combos load, no error) and the
 * catalog is what these tests exercise.
 */
function stubClient(listExtensions: ApiClient['listExtensions']): ApiClient {
  return {
    listExtensions,
    listTools: vi.fn().mockResolvedValue([]),
    listPresets: vi.fn().mockResolvedValue([]),
  } as unknown as ApiClient;
}

const catalog: Extension[] = [
  { name: 'search', kind: 'backend' },
  { name: 'search_chain', kind: 'transformer' },
  { name: 'notify', kind: 'wrapper' },
];

describe('ExtensionsPage', () => {
  it('shows the loading placeholder while the catalog is pending', () => {
    // A promise that never resolves keeps the query in its pending state.
    const client = stubClient(vi.fn().mockReturnValue(new Promise<Extension[]>(() => undefined)));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    expect(screen.getByTestId('extensions-loading')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders families grouped by base tool with kind badges', async () => {
    const client = stubClient(vi.fn().mockResolvedValue(catalog));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    // Two families: `search` (search, search_chain) and `notify`.
    const searchHeading = await screen.findByRole('heading', { level: 2, name: /search/ });
    expect(searchHeading).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /notify/ })).toBeInTheDocument();

    // Every entry's name renders as text (the first child of each list item is
    // the name; the second is its kind Badge).
    const memberNames = screen
      .getAllByRole('listitem')
      .map((item) => item.firstElementChild?.textContent);
    expect(memberNames).toEqual(expect.arrayContaining(['search', 'search_chain', 'notify']));

    // The `search` family lists both variants.
    expect(screen.getByText(/2 variants/)).toBeInTheDocument();

    // Kind badges render with the mapped variant.
    const backendBadge = screen.getByText('backend');
    expect(backendBadge).toHaveAttribute('data-variant', 'warning');
    expect(screen.getByText('transformer')).toHaveAttribute('data-variant', 'success');
    expect(screen.getByText('wrapper')).toHaveAttribute('data-variant', 'primary');
  });

  it('each family card cross-links to the tools authoring surface for its base tool', async () => {
    const client = stubClient(vi.fn().mockResolvedValue(catalog));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    // The `search` family's card links to the tools page for the base tool so the
    // read-only catalog reaches the combo-authoring surface.
    const link = await screen.findByRole('link', {
      name: 'Author search extension combos on the tools page',
    });
    expect(link).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Author notify extension combos on the tools page' }),
    ).toBeInTheDocument();
  });

  it('renders the empty state when the catalog is empty', async () => {
    const client = stubClient(vi.fn().mockResolvedValue([]));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    expect(await screen.findByText('No tool extensions')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a loud error state when the request rejects', async () => {
    const client = stubClient(vi.fn().mockRejectedValue(new Error('catalog unavailable')));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('catalog unavailable');
    // A failure is never a silent empty render.
    await waitFor(() => {
      expect(screen.queryByText('No tool extensions')).not.toBeInTheDocument();
    });
  });
});
