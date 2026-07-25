/**
 * Detail-pane tests: the active baked kwargs render through `JsonTree`; a normal
 * record exposes New version + version history + the soft-delete copy; a conflicted
 * record is delete-only with the quarantine copy; a successful delete clears the
 * `?preset=` selection.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { toolsListKey } from '@tai42/studio-sdk';

import { PresetDetail } from './PresetDetail';
import { presetDetailKey, presetRefereesKey, presetVersionsKey, presetsListKey } from './keys';
import { renderWithProviders, type StubApiClient } from './test-utils';

const detail = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: 'Paris weather',
  active_version: 7,
  tags: ['geo'],
  extensions: [],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
  fixed_kwargs: { city: 'Paris' },
};

const versions = [
  {
    version: 2,
    body: {
      base_tool: 'weather',
      description: 'Paris weather',
      fixed_kwargs: { city: 'Paris' },
      extensions: [],
      tags: ['geo'],
      output_schema: null,
    },
    tags: [],
    created_at: 'now',
    is_current: true,
  },
];

describe('PresetDetail', () => {
  it('renders the active fixed_kwargs via JsonTree and the active version', async () => {
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    // The JsonTree renders the baked kwargs key + value.
    expect(await screen.findByText('city:')).toBeInTheDocument();
    expect(screen.getByText('"Paris"')).toBeInTheDocument();
    // The active version number is shown in the record grid.
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('offers New version + version history and the soft-delete copy on a normal record', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
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
    };
    const { unmount } = renderWithProviders(<PresetDetail name="paris_weather" />, { client });
    expect(
      await screen.findByRole('button', { name: 'Rename preset paris_weather' }),
    ).toBeInTheDocument();
    unmount();

    const conflictedClient: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue({ ...detail, conflicted: true }),
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

  it('renders a rejected rename’s server message verbatim, including the referee list', async () => {
    const user = userEvent.setup();
    const serverMessage =
      "preset 'paris_weather' cannot be renamed: it is referenced by preset(s) ['a_ref', 'z_ref']; update those presets first";
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      renamePreset: vi.fn().mockRejectedValue(new Error(serverMessage)),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    await user.type(screen.getByRole('textbox'), 'london_weather');
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    // The server message — referee list and all — renders verbatim, no truncation.
    expect(await screen.findByText(serverMessage)).toBeInTheDocument();
  });

  it('shows the server conflicted_reason verbatim on a conflicted record', async () => {
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue({
        ...detail,
        conflicted: true,
        conflicted_reason: 'name shadowed by manifest tool weather at boot',
      }),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    expect(
      await screen.findByText('name shadowed by manifest tool weather at boot'),
    ).toBeInTheDocument();
  });

  it('preflight: a non-empty referee list blocks the rename with a danger callout', async () => {
    const user = userEvent.setup();
    const renamePreset = vi.fn();
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      getPresetReferees: vi
        .fn()
        .mockResolvedValue({ name: 'paris_weather', referees: ['a_ref', 'z_ref'] }),
      renamePreset,
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    // The referees callout lists the blockers and the submit is disabled.
    expect(
      await screen.findByText('Referenced by: a_ref, z_ref — update those presets first.'),
    ).toBeInTheDocument();
    const rename = screen.getByRole('button', { name: 'Rename' });
    expect(rename).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'london_weather');
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
    expect(renamePreset).not.toHaveBeenCalled();
  });

  it('preflight: an empty referee list allows the rename', async () => {
    const user = userEvent.setup();
    const renamePreset = vi.fn().mockResolvedValue({
      name: 'london_weather',
      renamed_from: 'paris_weather',
      active_version: 7,
    });
    const getPresetReferees = vi.fn().mockResolvedValue({ name: 'paris_weather', referees: [] });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      getPresetReferees,
      renamePreset,
    };
    const { queryClient } = renderWithProviders(<PresetDetail name="paris_weather" />, { client });
    const remove = vi.spyOn(queryClient, 'removeQueries');

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    await user.type(screen.getByRole('textbox'), 'london_weather');
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(renamePreset).toHaveBeenCalledWith('paris_weather', 'london_weather');
    // The old name's referees cache is dropped alongside its other caches.
    expect(remove).toHaveBeenCalledWith({ queryKey: presetRefereesKey('paris_weather') });
  });

  it('preflight: a referees fetch error degrades to advisory (submit stays enabled)', async () => {
    const user = userEvent.setup();
    const renamePreset = vi.fn().mockResolvedValue({
      name: 'london_weather',
      renamed_from: 'paris_weather',
      active_version: 7,
    });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      getPresetReferees: vi.fn().mockRejectedValue(new Error('referees door 503')),
      renamePreset,
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, { client });

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    // The advisory error shows small, but a legal rename is NOT blocked.
    expect(
      await screen.findByText(/Could not check referees: referees door 503/),
    ).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'london_weather');
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(renamePreset).toHaveBeenCalledWith('paris_weather', 'london_weather');
  });

  it('clears the ?preset= selection after a successful delete', async () => {
    const user = userEvent.setup();
    const deletePreset = vi.fn().mockResolvedValue({ name: 'paris_weather', deleted: true });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      deletePreset,
    };
    const { navigate, queryClient } = renderWithProviders(<PresetDetail name="paris_weather" />, {
      client,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const remove = vi.spyOn(queryClient, 'removeQueries');

    await user.click(await screen.findByRole('button', { name: 'Delete preset paris_weather' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deletePreset).toHaveBeenCalledWith('paris_weather');
    expect(navigate).toHaveBeenCalledWith('presets', {});
    // The list + tools master list are invalidated…
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetsListKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: toolsListKey });
    // …and the deleted preset's own (credential-bearing) caches are dropped so a
    // same-name recreate cannot flash the removed record.
    expect(remove).toHaveBeenCalledWith({ queryKey: presetDetailKey('paris_weather') });
    expect(remove).toHaveBeenCalledWith({ queryKey: presetVersionsKey('paris_weather') });
  });
});
