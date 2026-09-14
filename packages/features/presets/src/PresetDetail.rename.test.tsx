/**
 * The preset detail panel — rename outcomes and delete: a rejected rename's verbatim
 * server message, the conflicted_reason note, the referee preflight (blocks on a
 * non-empty list, allows on empty, degrades to advisory on a fetch error), and the
 * post-delete `?preset=` clear.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { toolsListKey } from '@tai42/studio-sdk';

import { PresetDetail } from './PresetDetail';
import { presetDetailKey, presetRefereesKey, presetVersionsKey, presetsListKey } from './keys';
import { detail, emptyMeta, renderWithProviders, versions, type StubApiClient } from './test-utils';

describe('PresetDetail — rename preflight + delete', () => {
  it('renders a rejected rename’s server message verbatim, including the referee list', async () => {
    const user = userEvent.setup();
    const serverMessage =
      "preset 'paris_weather' cannot be renamed: it is referenced by preset(s) ['a_ref', 'z_ref']; update those presets first";
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
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
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
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
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
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
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
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
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
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
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
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
