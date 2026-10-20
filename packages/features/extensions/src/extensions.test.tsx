import type { ApiClient, Extension } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

// Real catalog shapes: registered extension names (underscores included) and
// their kinds, deliberately served out of order.
const catalog: Extension[] = [
  { name: 'sync_task', kind: 'backend', multiple: false },
  { name: 'relay', kind: 'transformer', multiple: true },
  { name: 'async_task', kind: 'backend', multiple: false },
  { name: 'monitor', kind: 'wrapper', multiple: true },
];

/** The extension names listed in the kind card a level-3 heading titles. */
function namesInCard(heading: HTMLElement): (string | null)[] {
  const card = heading.closest<HTMLElement>('.tai-card');
  if (card === null) throw new Error('the kind heading sits outside a card');
  return within(card)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

describe('ExtensionsPage', () => {
  it('shows the loading placeholder while the catalog is pending', () => {
    // A promise that never resolves keeps the query in its pending state.
    const client = stubClient(vi.fn().mockReturnValue(new Promise<Extension[]>(() => undefined)));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    expect(screen.getByTestId('extensions-loading')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders one card per extension kind, ordered by kind', async () => {
    const client = stubClient(vi.fn().mockResolvedValue(catalog));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    await screen.findAllByRole('heading', { level: 3 });
    const kindHeadings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.firstElementChild?.textContent);
    expect(kindHeadings).toEqual(['backend', 'transformer', 'wrapper']);
  });

  it('lists every registered extension by its whole name under its kind card', async () => {
    const client = stubClient(vi.fn().mockResolvedValue(catalog));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    const backendHeading = await screen.findByRole('heading', { level: 3, name: /backend/ });
    expect(namesInCard(backendHeading)).toEqual(['async_task', 'sync_task']);
    expect(namesInCard(screen.getByRole('heading', { level: 3, name: /transformer/ }))).toEqual([
      'relay',
    ]);
    expect(namesInCard(screen.getByRole('heading', { level: 3, name: /wrapper/ }))).toEqual([
      'monitor',
    ]);
  });

  it('counts each kind and marks the kind that allows one extension per tool', async () => {
    const client = stubClient(vi.fn().mockResolvedValue(catalog));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    const backendHeading = await screen.findByRole('heading', { level: 3, name: /backend/ });
    expect(backendHeading).toHaveTextContent('backend2 extensionsone per tool');
    expect(screen.getByRole('heading', { level: 3, name: /transformer/ })).toHaveTextContent(
      'transformer1 extension',
    );
    expect(screen.getByRole('heading', { level: 3, name: /wrapper/ })).toHaveTextContent(
      'wrapper1 extension',
    );
    expect(screen.getAllByText('one per tool')).toHaveLength(1);
  });

  it('renders each kind badge with its mapped variant', async () => {
    const client = stubClient(vi.fn().mockResolvedValue(catalog));
    renderWithProviders(<ExtensionsPage search={{}} />, { client });

    expect(await screen.findByText('backend')).toHaveAttribute('data-variant', 'warning');
    expect(screen.getByText('transformer')).toHaveAttribute('data-variant', 'success');
    expect(screen.getByText('wrapper')).toHaveAttribute('data-variant', 'primary');
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
