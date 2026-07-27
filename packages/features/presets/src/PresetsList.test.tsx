/**
 * Master-table tests: every column renders, a conflicted row shows the danger
 * badge + delete-to-resolve note, selecting a row navigates `?preset=`, and the
 * four-state render (loading skeleton / loud error / empty / data) holds.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PresetsList } from './PresetsList';
import { renderWithProviders, type StubApiClient } from './test-utils';

const normal = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: 'Paris weather',
  active_version: 3,
  tags: ['geo'],
  extensions: [['chain']],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
};

const conflicted = {
  name: 'stale_preset',
  base_tool: 'weather',
  description: '',
  active_version: 1,
  tags: [],
  extensions: [],
  output_schema: null,
  conflicted: true,
  conflicted_reason: 'name collided with an existing tool at startup',
};

describe('PresetsList', () => {
  it('renders every column for a row', async () => {
    const client: StubApiClient = { listPresets: vi.fn().mockResolvedValue([normal]) };
    renderWithProviders(<PresetsList selected={undefined} />, { client });

    const row = await screen.findByTestId('preset-row-paris_weather');
    expect(
      within(row).getByRole('link', { name: 'Open preset paris_weather' }),
    ).toBeInTheDocument();
    expect(within(row).getByText('weather')).toBeInTheDocument();
    expect(within(row).getByText('Paris weather')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText('geo')).toBeInTheDocument();
    // The single extension combo → a combo count of 1.
    expect(within(row).getByText('1')).toBeInTheDocument();
  });

  it('shows the conflicted badge + the server reason only on a conflicted row', async () => {
    const client: StubApiClient = {
      listPresets: vi.fn().mockResolvedValue([normal, conflicted]),
    };
    renderWithProviders(<PresetsList selected={undefined} />, { client });

    const stale = await screen.findByTestId('preset-conflicted-stale_preset');
    expect(within(stale).getByText('Conflicted')).toBeInTheDocument();
    // The server's conflicted_reason renders verbatim (Item 3).
    expect(
      within(stale).getByText('name collided with an existing tool at startup'),
    ).toBeInTheDocument();

    // The normal row carries no conflicted marker.
    expect(screen.queryByTestId('preset-conflicted-paris_weather')).toBeNull();
  });

  it('falls back to the generic sentence when conflicted_reason is null', async () => {
    const client: StubApiClient = {
      listPresets: vi.fn().mockResolvedValue([{ ...conflicted, conflicted_reason: null }]),
    };
    renderWithProviders(<PresetsList selected={undefined} />, { client });

    const stale = await screen.findByTestId('preset-conflicted-stale_preset');
    expect(within(stale).getByText(/delete to resolve/i)).toBeInTheDocument();
  });

  it('splits conflicted rows into their own Conflicted section, apart from the active table', async () => {
    const client: StubApiClient = {
      listPresets: vi.fn().mockResolvedValue([normal, conflicted]),
    };
    renderWithProviders(<PresetsList selected={undefined} />, { client });

    const section = await screen.findByTestId('presets-conflicted-section');
    // The conflicted row lives inside the Conflicted section…
    expect(within(section).getByTestId('preset-row-stale_preset')).toBeInTheDocument();
    // …and the active row lives outside it.
    expect(within(section).queryByTestId('preset-row-paris_weather')).toBeNull();
    expect(screen.getByTestId('preset-row-paris_weather')).toBeInTheDocument();
  });

  it('renders no Conflicted section when every preset is active', async () => {
    const client: StubApiClient = { listPresets: vi.fn().mockResolvedValue([normal]) };
    renderWithProviders(<PresetsList selected={undefined} />, { client });

    await screen.findByTestId('preset-row-paris_weather');
    expect(screen.queryByTestId('presets-conflicted-section')).toBeNull();
  });

  it('navigates ?preset= when a row is selected', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { listPresets: vi.fn().mockResolvedValue([normal]) };
    const { navigate } = renderWithProviders(<PresetsList selected={undefined} />, { client });

    await user.click(await screen.findByRole('link', { name: 'Open preset paris_weather' }));
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
  });

  it('marks the selected row link as the current page', async () => {
    const client: StubApiClient = { listPresets: vi.fn().mockResolvedValue([normal]) };
    renderWithProviders(<PresetsList selected="paris_weather" />, { client });

    const link = await screen.findByRole('link', { name: 'Open preset paris_weather' });
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('shows a loud error state when the list request fails', async () => {
    const client: StubApiClient = {
      listPresets: vi.fn().mockRejectedValue(new Error('boom: list failed')),
    };
    renderWithProviders(<PresetsList selected={undefined} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('boom: list failed');
  });

  it('shows the empty state when there are no presets', async () => {
    const client: StubApiClient = { listPresets: vi.fn().mockResolvedValue([]) };
    renderWithProviders(<PresetsList selected={undefined} />, { client });

    expect(await screen.findByText('No presets yet')).toBeInTheDocument();
  });
});
