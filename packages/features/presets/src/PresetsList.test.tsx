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
  extensions: [['chain']],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
  uses: [],
  used_by: [],
};

const conflicted = {
  name: 'stale_preset',
  base_tool: 'weather',
  description: '',
  active_version: 1,
  extensions: [],
  output_schema: null,
  conflicted: true,
  conflicted_reason: 'name collided with an existing tool at startup',
  uses: [],
  used_by: [],
};

/** One tool_meta overlay row (display name + user tags), keyed by tool name. */
function metaRow(
  toolName: string,
  over: Partial<{ display_name: string | null; tags: string[] }> = {},
) {
  return {
    tool_name: toolName,
    display_name: null,
    folder_id: null,
    tags: [],
    hidden: null,
    ...over,
  };
}

/** A client feeding the list its presets plus an (optionally empty) overlay map. */
function listClient(
  presets: readonly unknown[],
  meta: readonly ReturnType<typeof metaRow>[] = [],
): StubApiClient {
  return {
    listPresets: vi.fn().mockResolvedValue(presets),
    listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta }),
  };
}

describe('PresetsList', () => {
  it('renders every column for a row, with OVERLAY tags + display name', async () => {
    // Tags and the display name are the tool_meta overlay's, not the record's.
    const client = listClient(
      [normal],
      [metaRow('paris_weather', { display_name: 'Paris Weather', tags: ['geo'] })],
    );
    renderWithProviders(<PresetsList selected={undefined} />, { client });

    const row = await screen.findByTestId('preset-row-paris_weather');
    expect(
      within(row).getByRole('link', { name: 'Open preset paris_weather' }),
    ).toBeInTheDocument();
    expect(within(row).getByText('weather')).toBeInTheDocument();
    expect(within(row).getByText('Paris weather')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    // The overlay display name renders as a muted sub-line on the Name cell…
    expect(within(row).getByTestId('preset-display-name-paris_weather')).toHaveTextContent(
      'Paris Weather',
    );
    // …and the overlay tag renders in the Tags column.
    expect(within(row).getByText('geo')).toBeInTheDocument();
    // The single extension combo → a combo count of 1.
    expect(within(row).getByText('1')).toBeInTheDocument();
  });

  it('omits the display-name sub-line and shows — for tags when the overlay row is absent', async () => {
    // No overlay entry for the tool → no display name, and the Tags cell falls back
    // to the em-dash rather than inventing tags.
    renderWithProviders(<PresetsList selected={undefined} />, { client: listClient([normal]) });

    const row = await screen.findByTestId('preset-row-paris_weather');
    expect(within(row).queryByTestId('preset-display-name-paris_weather')).toBeNull();
    expect(within(row).queryByText('geo')).toBeNull();
  });

  it('shows the conflicted badge + the server reason only on a conflicted row', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, {
      client: listClient([normal, conflicted]),
    });

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
    renderWithProviders(<PresetsList selected={undefined} />, {
      client: listClient([{ ...conflicted, conflicted_reason: null }]),
    });

    const stale = await screen.findByTestId('preset-conflicted-stale_preset');
    expect(within(stale).getByText(/delete to resolve/i)).toBeInTheDocument();
  });

  it('splits conflicted rows into their own Conflicted section, apart from the active table', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, {
      client: listClient([normal, conflicted]),
    });

    const section = await screen.findByTestId('presets-conflicted-section');
    // The conflicted row lives inside the Conflicted section…
    expect(within(section).getByTestId('preset-row-stale_preset')).toBeInTheDocument();
    // …and the active row lives outside it.
    expect(within(section).queryByTestId('preset-row-paris_weather')).toBeNull();
    expect(screen.getByTestId('preset-row-paris_weather')).toBeInTheDocument();
  });

  it('renders no Conflicted section when every preset is active', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, { client: listClient([normal]) });

    await screen.findByTestId('preset-row-paris_weather');
    expect(screen.queryByTestId('presets-conflicted-section')).toBeNull();
  });

  it('navigates ?preset= when a row is selected', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<PresetsList selected={undefined} />, {
      client: listClient([normal]),
    });

    await user.click(await screen.findByRole('link', { name: 'Open preset paris_weather' }));
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
  });

  it('marks the selected row link as the current page', async () => {
    renderWithProviders(<PresetsList selected="paris_weather" />, { client: listClient([normal]) });

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
      listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }),
    };
    renderWithProviders(<PresetsList selected={undefined} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('boom: list failed');
  });

  it('shows the empty state when there are no presets', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, { client: listClient([]) });

    expect(await screen.findByText('No presets yet')).toBeInTheDocument();
  });

  it('HIDES the create affordance and shows the muted OFF note when the versioning kind is OFF', async () => {
    // A versioning-OFF deployment refuses preset create (501) and reads an empty
    // store: the create button is WITHDRAWN and the muted OFF note stands where the
    // create-oriented empty state would otherwise mislead.
    renderWithProviders(<PresetsList selected={undefined} />, {
      client: listClient([]),
      systemKinds: [
        {
          kind: 'versioning',
          state: 'off',
          plugin: null,
          detail: 'TAI_DATABASE_DEFAULT_PG_PASSWORD not configured',
        },
      ],
    });

    const note = await screen.findByTestId('feature-disabled');
    expect(note).toHaveTextContent('Preset versioning is not configured');
    // The proactive OFF note shows the kind-status row's server `detail` verbatim.
    expect(note).toHaveTextContent('TAI_DATABASE_DEFAULT_PG_PASSWORD not configured');
    // The create affordance is gone; Refresh (a read) stays.
    expect(screen.queryByRole('button', { name: 'Create preset' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    // The create-oriented empty state is replaced, not shown alongside.
    expect(screen.queryByText('No presets yet')).toBeNull();
  });

  it('KEEPS the create affordance when the versioning kind is active', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, {
      client: listClient([normal]),
      systemKinds: [{ kind: 'versioning', state: 'active', plugin: 'pg', detail: '' }],
    });

    await screen.findByTestId('preset-row-paris_weather');
    expect(screen.getByRole('button', { name: 'Create preset' })).toBeInTheDocument();
    expect(screen.queryByTestId('feature-disabled')).toBeNull();
  });
});
