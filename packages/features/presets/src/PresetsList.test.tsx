/**
 * Master-table tests: every column renders, a conflicted row shows the danger
 * badge + delete-to-resolve note, selecting a row navigates `?preset=`, and the
 * four-state render (loading skeleton / loud error / empty / data) holds.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PresetsList } from './PresetsList';
import { fullProjection, renderWithProviders, type StubApiClient } from './test-utils';

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

/** The active-explorer table row of a preset, found by its accessible name link. */
async function findPresetRow(name: string): Promise<HTMLElement> {
  const link = await screen.findByRole('link', { name: `Open preset ${name}` });
  const row = link.closest('tr');
  if (row === null) throw new Error(`no table row holds preset ${name}`);
  return row;
}

describe('PresetsList', () => {
  it('renders every column for a row, with OVERLAY tags + display name', async () => {
    // Tags and the display name are the tool_meta overlay's, not the record's.
    const client = listClient(
      [normal],
      [metaRow('paris_weather', { display_name: 'Paris Weather', tags: ['geo'] })],
    );
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client,
    });

    const row = await findPresetRow('paris_weather');
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
    // The single extension set → an extension count of 1.
    expect(within(row).getByText('1')).toBeInTheDocument();
  });

  it('labels the extension-count column Extensions (not the internal word)', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client: listClient([normal]),
    });

    await findPresetRow('paris_weather');
    expect(screen.getByRole('columnheader', { name: 'Extensions' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Combos' })).toBeNull();
  });

  it('renders a tag as a static chip whose class the table keeps on one line', async () => {
    // The chip carries `tai-chip`, which the stylesheet pins to `white-space: nowrap`
    // inside a `.tai-table` so a hyphenated tag never splits across two lines; the
    // wrapping-between-chips is the cell's own `.tai-row`. jsdom loads no CSS, so the
    // class presence is what this asserts; narrow-viewport.test.ts guards the rule.
    const client = listClient([normal], [metaRow('paris_weather', { tags: ['palette-node'] })]);
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client,
    });

    const chip = await screen.findByText('palette-node');
    expect(chip).toHaveClass('tai-chip', 'tai-chip-static');
  });

  it('omits the display-name sub-line and shows — for tags when the overlay row is absent', async () => {
    // No overlay entry for the tool → no display name, and the Tags cell falls back
    // to the em-dash rather than inventing tags.
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client: listClient([normal]),
    });

    const row = await findPresetRow('paris_weather');
    expect(within(row).queryByTestId('preset-display-name-paris_weather')).toBeNull();
    expect(within(row).queryByText('geo')).toBeNull();
  });

  it('shows the conflicted badge + the server reason only on a conflicted row', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
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
      projection: fullProjection(),
      client: listClient([{ ...conflicted, conflicted_reason: null }]),
    });

    const stale = await screen.findByTestId('preset-conflicted-stale_preset');
    expect(within(stale).getByText(/delete to resolve/i)).toBeInTheDocument();
  });

  it('splits conflicted rows into their own Conflicted section, apart from the active table', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client: listClient([normal, conflicted]),
    });

    const section = await screen.findByTestId('presets-conflicted-section');
    // The conflicted row lives inside the Conflicted section…
    expect(within(section).getByTestId('preset-row-stale_preset')).toBeInTheDocument();
    // …and the active row lives outside it.
    expect(within(section).queryByRole('link', { name: 'Open preset paris_weather' })).toBeNull();
    expect(await findPresetRow('paris_weather')).toBeInTheDocument();
  });

  it('renders no Conflicted section when every preset is active', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client: listClient([normal]),
    });

    await findPresetRow('paris_weather');
    expect(screen.queryByTestId('presets-conflicted-section')).toBeNull();
  });

  it('navigates ?preset= when a row is selected', async () => {
    const user = userEvent.setup({ delay: null });
    const { navigate } = renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client: listClient([normal]),
    });

    await user.click(await screen.findByRole('link', { name: 'Open preset paris_weather' }));
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
  });

  it('opens the preset when the row body (a non-link cell) is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const { navigate } = renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client: listClient([normal]),
    });

    await findPresetRow('paris_weather');
    // The description cell is plain, non-interactive text — a body click.
    await user.click(screen.getByText('Paris weather'));
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
  });

  it('navigates once — not twice — when the name link itself is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const { navigate } = renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client: listClient([normal]),
    });

    await user.click(await screen.findByRole('link', { name: 'Open preset paris_weather' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
  });

  it('marks the selected row link as the current page', async () => {
    renderWithProviders(<PresetsList selected="paris_weather" />, {
      projection: fullProjection(),
      client: listClient([normal]),
    });

    const link = await screen.findByRole('link', { name: 'Open preset paris_weather' });
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('gives the selected preset the shared selected look, active or conflicted', async () => {
    const view = renderWithProviders(<PresetsList selected="paris_weather" />, {
      projection: fullProjection(),
      client: listClient([normal, conflicted]),
    });
    expect(await findPresetRow('paris_weather')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('preset-row-stale_preset')).not.toHaveAttribute('data-selected');
    view.unmount();

    renderWithProviders(<PresetsList selected="stale_preset" />, {
      projection: fullProjection(),
      client: listClient([normal, conflicted]),
    });
    expect(await screen.findByTestId('preset-row-stale_preset')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(await findPresetRow('paris_weather')).not.toHaveAttribute('data-selected');
  });

  it('shows a loud error state when the list request fails', async () => {
    const client: StubApiClient = {
      listPresets: vi.fn().mockRejectedValue(new Error('boom: list failed')),
      listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }),
    };
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('boom: list failed');
  });

  it('shows the empty state when there are no presets', async () => {
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
      client: listClient([]),
    });

    expect(await screen.findByText('No presets yet')).toBeInTheDocument();
  });

  it('HIDES the create affordance and shows the muted OFF note when the versioning kind is OFF', async () => {
    // A versioning-OFF deployment refuses preset create (501) and reads an empty
    // store: the create button is WITHDRAWN and the muted OFF note stands where the
    // create-oriented empty state would otherwise mislead.
    renderWithProviders(<PresetsList selected={undefined} />, {
      projection: fullProjection(),
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
      projection: fullProjection(),
      client: listClient([normal]),
      systemKinds: [{ kind: 'versioning', state: 'active', plugin: 'pg', detail: '' }],
    });

    await findPresetRow('paris_weather');
    expect(screen.getByRole('button', { name: 'Create preset' })).toBeInTheDocument();
    expect(screen.queryByTestId('feature-disabled')).toBeNull();
  });

  describe('folders', () => {
    const folderRow = (id: string, name: string, parentId: string | null = null) => ({
      id,
      name,
      parent_id: parentId,
    });

    function folderClient(): StubApiClient {
      return {
        listPresets: vi.fn().mockResolvedValue([normal]),
        listToolMeta: vi.fn().mockResolvedValue({
          folders: [
            folderRow('f-mine', 'Forecasts'),
            folderRow('f-theirs', 'Other tools'),
            folderRow('f-empty', 'Fresh'),
          ],
          meta: [
            { ...metaRow('paris_weather'), folder_id: 'f-mine' },
            { ...metaRow('http_get'), folder_id: 'f-theirs' },
          ],
        }),
      };
    }

    it('draws the folders holding a preset or nothing, and not those holding only other tools', async () => {
      renderWithProviders(<PresetsList selected={undefined} />, {
        projection: fullProjection(),
        client: folderClient(),
      });

      expect(await screen.findByRole('button', { name: 'Forecasts' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fresh' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Other tools' })).toBeNull();
      // The filed preset is inside its folder, not at the root.
      expect(screen.queryByRole('link', { name: 'Open preset paris_weather' })).toBeNull();
    });

    it('opens a folder to show the presets filed in it, with a breadcrumb back', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<PresetsList selected={undefined} />, {
        projection: fullProjection(),
        client: folderClient(),
      });

      await user.click(await screen.findByRole('button', { name: 'Forecasts' }));
      expect(await findPresetRow('paris_weather')).toBeInTheDocument();
      const path = screen.getByRole('navigation', { name: 'Folder path' });
      await user.click(within(path).getByRole('button', { name: 'All presets' }));
      expect(screen.getByRole('button', { name: 'Forecasts' })).toBeInTheDocument();
    });

    it('offers the folder actions to a writer', async () => {
      renderWithProviders(<PresetsList selected={undefined} />, {
        projection: fullProjection(),
        client: folderClient(),
      });

      expect(
        await screen.findByRole('button', { name: 'Rename folder Forecasts' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Move folder Forecasts' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete folder Fresh' })).toBeInTheDocument();
    });

    it('offers each folder action only on its own route', async () => {
      renderWithProviders(<PresetsList selected={undefined} />, {
        projection: fullProjection({
          admin: false,
          routes: [{ path: '/api/tool-meta/folders/{folder_id}/rename', methods: ['POST'] }],
        }),
        client: folderClient(),
      });

      expect(
        await screen.findByRole('button', { name: 'Rename folder Forecasts' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move folder Forecasts' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Delete folder Fresh' })).toBeNull();
    });

    it('offers no folder action to a caller who may only file a tool', async () => {
      renderWithProviders(<PresetsList selected={undefined} />, {
        projection: fullProjection({
          admin: false,
          routes: [{ path: '/api/tool-meta/tools/{tool_name}', methods: ['PATCH'] }],
        }),
        client: folderClient(),
      });

      expect(await screen.findByRole('button', { name: 'Forecasts' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^(Rename|Move|Delete) folder / })).toBeNull();
    });

    it('names the Edit dialog in an empty folder only to a caller who may file a preset', async () => {
      const user = userEvent.setup({ delay: null });
      const hint = 'File a preset here from its Edit dialog.';
      const view = renderWithProviders(<PresetsList selected={undefined} />, {
        projection: fullProjection(),
        client: folderClient(),
      });
      await user.click(await screen.findByRole('button', { name: 'Fresh' }));
      expect(await screen.findByText(hint)).toBeInTheDocument();
      view.unmount();

      renderWithProviders(<PresetsList selected={undefined} />, {
        projection: fullProjection({ admin: false }),
        client: folderClient(),
      });
      await user.click(await screen.findByRole('button', { name: 'Fresh' }));
      expect(await screen.findByText('This folder is empty')).toBeInTheDocument();
      expect(screen.queryByText(hint)).toBeNull();
    });

    it('shows the no-active-presets state, not a folder tree, when no preset is active', async () => {
      renderWithProviders(<PresetsList selected={undefined} />, {
        projection: fullProjection(),
        client: {
          listPresets: vi.fn().mockResolvedValue([conflicted]),
          listToolMeta: vi.fn().mockResolvedValue({
            folders: [folderRow('f-empty', 'Fresh')],
            meta: [],
          }),
        },
      });

      expect(await screen.findByText('No active presets')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Fresh' })).toBeNull();
    });

    it('states a failed overlay read loudly and still lists every preset at the root', async () => {
      renderWithProviders(<PresetsList selected={undefined} />, {
        projection: fullProjection(),
        client: {
          listPresets: vi.fn().mockResolvedValue([normal]),
          listToolMeta: vi.fn().mockRejectedValue(new Error('overlay store unreachable')),
        },
      });

      expect(await findPresetRow('paris_weather')).toBeInTheDocument();
      expect(await screen.findByRole('alert')).toHaveTextContent('overlay store unreachable');
    });
  });
});
