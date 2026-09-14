/**
 * The preset detail panel — the record view and overlay details: fixed_kwargs +
 * active version, the overlay display name / tags edit (two-field merge-patch, SDK
 * reload, tool_meta-off note), the New version / output-schema / conflicted-record
 * surfaces, and the basic rename affordance + a successful rename.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { toolsListKey } from '@tai42/studio-sdk';
import { StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';
import { ApiError } from '@tai42/api-client';

import { PresetDetail } from './PresetDetail';
import { presetDetailKey, presetToolMetaKey, presetVersionsKey, presetsListKey } from './keys';
import { detail, emptyMeta, renderWithProviders, versions, type StubApiClient } from './test-utils';

describe('PresetDetail', () => {
  it('renders the active fixed_kwargs via JsonTree and the active version', async () => {
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    // The JsonTree renders the baked kwargs key + value.
    expect(await screen.findByText('city:')).toBeInTheDocument();
    expect(screen.getByText('"Paris"')).toBeInTheDocument();
    // The active version number is shown in the record grid.
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders the overlay display name + tags from listToolMeta', async () => {
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          {
            tool_name: 'paris_weather',
            display_name: 'Paris Weather',
            folder_id: null,
            tags: ['geo'],
            hidden: null,
          },
        ],
      }),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    // Both come from the overlay, not the record (the record has neither field now).
    expect(await screen.findByText('Paris Weather')).toBeInTheDocument();
    expect(screen.getByText('geo')).toBeInTheDocument();
  });

  it('edits the overlay display name + tags via the two-field merge-patch', async () => {
    const user = userEvent.setup();
    const upsertToolMeta = vi.fn().mockResolvedValue({
      tool_name: 'paris_weather',
      display_name: 'Paris Weather',
      folder_id: null,
      tags: ['geo', 'eu'],
      hidden: null,
    });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          {
            tool_name: 'paris_weather',
            display_name: null,
            folder_id: null,
            tags: ['geo'],
            hidden: null,
          },
        ],
      }),
      upsertToolMeta,
    };
    const { queryClient } = renderWithProviders(<PresetDetail name="paris_weather" />, { client });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    // Edit stays disabled until the overlay read lands (its tags seed the editor).
    const edit = await screen.findByRole('button', { name: 'Edit details for paris_weather' });
    await waitFor(() => {
      expect(edit).toBeEnabled();
    });
    await user.click(edit);

    const nameInput = screen.getByLabelText('Display name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Paris Weather');
    // The tags input carries an explicit aria-label inside its Field, so target the
    // textbox by role to disambiguate it from the Field's own "Tags" group label.
    await user.type(screen.getByRole('textbox', { name: 'Tags' }), 'eu');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'Save details' }));

    // The write is a merge-patch of ONLY display_name + tags (folder/hidden untouched).
    expect(upsertToolMeta).toHaveBeenCalledWith('paris_weather', {
      display_name: 'Paris Weather',
      tags: ['geo', 'eu'],
    });
    // The overlay map behind the detail grid + list is refetched on success.
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: presetToolMetaKey });
    });
  });

  it('reloads the SDK display-name overlay on a successful details edit', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const upsertToolMeta = vi.fn().mockResolvedValue({
      tool_name: 'paris_weather',
      display_name: 'Paris Weather',
      folder_id: null,
      tags: ['geo'],
      hidden: null,
    });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          {
            tool_name: 'paris_weather',
            display_name: null,
            folder_id: null,
            tags: ['geo'],
            hidden: null,
          },
        ],
      }),
      upsertToolMeta,
    };
    renderWithProviders(
      <StaticToolDisplayNamesProvider names={{}} reload={reload}>
        <PresetDetail name="paris_weather" />
      </StaticToolDisplayNamesProvider>,
      { client },
    );

    const edit = await screen.findByRole('button', { name: 'Edit details for paris_weather' });
    await waitFor(() => {
      expect(edit).toBeEnabled();
    });
    await user.click(edit);

    const nameInput = screen.getByLabelText('Display name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Paris Weather');
    await user.click(screen.getByRole('button', { name: 'Save details' }));

    // The edit may have changed the display name, so the app-level overlay refreshes.
    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it('swaps the edit dialog to the muted OFF note and withdraws Edit details on a tool_meta 501', async () => {
    const user = userEvent.setup();
    const upsertToolMeta = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'the tool-metadata overlay is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
          501,
          'tool-meta-not-configured',
        ),
      );
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      upsertToolMeta,
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    // Edit is enabled once the overlay read lands; open it and attempt a save.
    const edit = await screen.findByRole('button', { name: 'Edit details for paris_weather' });
    await waitFor(() => {
      expect(edit).toBeEnabled();
    });
    await user.click(edit);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save details' }));

    // The write revealed the tool_meta store off: the dialog body swaps to the muted
    // OFF note (the server's message) — NOT a loud red ErrorState (role="alert").
    const note = await within(dialog).findByTestId('feature-disabled');
    expect(note).toHaveTextContent(
      'the tool-metadata overlay is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
    );
    expect(within(dialog).queryByRole('alert')).toBeNull();
    // The form's own inputs are gone — the OFF note stands in place of the editor.
    expect(within(dialog).queryByLabelText('Display name')).toBeNull();

    // …and the Edit-details affordance is withdrawn entirely — a write it can only
    // refuse is no longer offered (queried with hidden, since the open dialog marks
    // the page background aria-hidden).
    expect(
      screen.queryByRole('button', { name: 'Edit details for paris_weather', hidden: true }),
    ).toBeNull();
  });

  it('offers New version + version history and the soft-delete copy on a normal record', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    expect(await screen.findByRole('button', { name: 'New version' })).toBeInTheDocument();
    expect(screen.getByText('Version history')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete preset paris_weather' }));
    expect(
      screen.getByText(/soft-deletes the preset and tears down its tool/i),
    ).toBeInTheDocument();
  });

  it('renders the Output schema section only when output_schema is set', async () => {
    const withSchema = {
      ...detail,
      output_schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    };
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(withSchema),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    // The output-schema JsonTree section renders its heading + a schema key.
    expect(await screen.findByText('Output schema')).toBeInTheDocument();
    expect(screen.getByText('properties:')).toBeInTheDocument();
  });

  it('is delete-only with the quarantine copy on a conflicted record', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue({ ...detail, conflicted: true }),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    expect(await screen.findByText(/not\s+registered/i)).toBeInTheDocument();
    // No New version affordance and no version history for a conflicted record.
    expect(screen.queryByRole('button', { name: 'New version' })).toBeNull();
    expect(screen.queryByText('Version history')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Delete preset paris_weather' }));
    expect(
      screen.getByText(/removes the quarantined record\. no live tool is touched/i),
    ).toBeInTheDocument();
  });

  it('offers Rename on a normal record and withholds it on a conflicted one', async () => {
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
    };
    const { unmount } = renderWithProviders(<PresetDetail name="paris_weather" />, { client });
    expect(
      await screen.findByRole('button', { name: 'Rename preset paris_weather' }),
    ).toBeInTheDocument();
    unmount();

    const conflictedClient: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue({ ...detail, conflicted: true }),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client: conflictedClient });
    await screen.findByText(/not\s+registered/i);
    // A conflicted record is delete-only — no Rename affordance, exactly like Versions.
    expect(screen.queryByRole('button', { name: 'Rename preset paris_weather' })).toBeNull();
  });

  it('blocks an empty-name submit with a field error and makes no api call', async () => {
    const user = userEvent.setup();
    const renamePreset = vi.fn();
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      renamePreset,
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.getByText('A new name is required.')).toBeInTheDocument();
    expect(renamePreset).not.toHaveBeenCalled();
  });

  it('renames, navigates to the new name, and moves the caches', async () => {
    const user = userEvent.setup();
    const renamePreset = vi.fn().mockResolvedValue({
      name: 'london_weather',
      renamed_from: 'paris_weather',
      active_version: 7,
    });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      renamePreset,
    };
    const { navigate, queryClient } = renderWithProviders(<PresetDetail name="paris_weather" />, {
      client,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const remove = vi.spyOn(queryClient, 'removeQueries');

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    await user.type(screen.getByRole('textbox'), 'london_weather');
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(renamePreset).toHaveBeenCalledWith('paris_weather', 'london_weather');
    // The renamed preset stays selected under its NEW name.
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'london_weather' });
    // The list + tool universe + the NEW name's history are invalidated…
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetsListKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: toolsListKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetVersionsKey('london_weather') });
    // …and the OLD name's (credential-bearing) caches are dropped.
    expect(remove).toHaveBeenCalledWith({ queryKey: presetDetailKey('paris_weather') });
    expect(remove).toHaveBeenCalledWith({ queryKey: presetVersionsKey('paris_weather') });
  });
});
