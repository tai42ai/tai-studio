import { ApiError } from '@tai42/api-client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test-utils';
import { LoadedExtensions } from './LoadedExtensions';

const CATALOG = [
  { name: 'wrap_b', kind: 'wrapper', multiple: true, config_schema: null },
  { name: 'ask_external', kind: 'transformer', multiple: true, config_schema: null },
  { name: 'wrap_a', kind: 'wrapper', multiple: true, config_schema: null },
  { name: 'queue', kind: 'backend', multiple: false, config_schema: null },
];

describe('LoadedExtensions', () => {
  it('shows a loading skeleton while the catalog is in flight', () => {
    const listExtensions = vi.fn(() => new Promise<never>(() => undefined));
    const { container } = renderWithProviders(<LoadedExtensions />, {
      client: { listExtensions },
    });

    expect(container.querySelectorAll('.tai-skeleton').length).toBe(3);
  });

  it('renders a failure as an error with Retry that re-reads', async () => {
    const listExtensions = vi
      .fn()
      .mockRejectedValueOnce(new Error('catalog boom'))
      .mockResolvedValueOnce(CATALOG);
    renderWithProviders(<LoadedExtensions />, { client: { listExtensions } });

    expect(await screen.findByRole('alert')).toHaveTextContent('catalog boom');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Kind: wrapper' })).toBeInTheDocument();
    expect(listExtensions).toHaveBeenCalledTimes(2);
  });

  it('renders a 403 as the no-grant notice, with no Retry and no error', async () => {
    const listExtensions = vi.fn().mockRejectedValue(new ApiError('forbidden', 403));
    renderWithProviders(<LoadedExtensions />, { client: { listExtensions } });

    expect(
      await screen.findByText('Loaded extensions are not available to this session'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This part lists the extension modules the server loaded, by kind. Reading it needs read access to extensions.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the empty copy when nothing is loaded', async () => {
    const listExtensions = vi.fn().mockResolvedValue([]);
    renderWithProviders(<LoadedExtensions />, { client: { listExtensions } });

    expect(await screen.findByText('No extensions are loaded')).toBeInTheDocument();
    expect(screen.getByText('This server registered no extensions.')).toBeInTheDocument();
  });

  it('groups the catalog by kind, in kind order, members by name', async () => {
    const listExtensions = vi.fn().mockResolvedValue(CATALOG);
    renderWithProviders(<LoadedExtensions />, { client: { listExtensions } });

    await screen.findByRole('heading', { name: 'Kind: backend' });
    expect(
      screen.getByRole('heading', { level: 3, name: 'Loaded extensions' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Kind: backend',
      'Kind: transformer',
      'Kind: wrapper',
    ]);
    const wrapper = screen.getByRole('region', { name: 'Kind: wrapper' });
    expect(
      within(wrapper)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['wrap_a', 'wrap_b']);
    // Only the single-select kind carries the qualifier.
    expect(screen.getAllByText('(one per combo)')).toHaveLength(1);
    expect(
      within(screen.getByRole('region', { name: 'Kind: backend' })).getByText('(one per combo)'),
    ).toBeInTheDocument();
  });

  it('renders a kind served as both single- and multi-select as an error', async () => {
    const listExtensions = vi.fn().mockResolvedValue([
      { name: 'w1', kind: 'wrapper', multiple: true, config_schema: null },
      { name: 'w2', kind: 'wrapper', multiple: false, config_schema: null },
    ]);
    renderWithProviders(<LoadedExtensions />, { client: { listExtensions } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'extension kind wrapper is served as both single- and multi-select',
    );
  });
});
