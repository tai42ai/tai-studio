/**
 * The preset detail panel — rename outcomes and delete: a rejected rename's verbatim
 * server message, the conflicted_reason note, the holder previews (block on a
 * non-empty list, allow on empty, stay advisory on a failed read or no grant, show a
 * refusal's holders in the list), and the post-delete `?preset=` clear.
 */
import { ApiError, apiRoutes } from '@tai42/api-client';
import { toolsListKey } from '@tai42/studio-sdk';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { presetDetailKey, presetRefereesKey, presetsListKey, presetVersionsKey } from './keys';
import { PresetDetail } from './PresetDetail';
import {
  clickWhenInteractable,
  detail,
  emptyMeta,
  fullProjection,
  renderWithProviders,
  type StubApiClient,
  versions,
} from './test-utils';

describe('PresetDetail — rename preflight + delete', () => {
  it('renders a rejected rename’s server message verbatim, including the referee list', async () => {
    const user = userEvent.setup({ delay: null });
    const serverMessage =
      "preset 'paris_weather' cannot be renamed: it is referenced by preset(s) ['a_ref', 'z_ref']; update those presets first";
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      renamePreset: vi.fn().mockRejectedValue(new Error(serverMessage)),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      projection: fullProjection(),
      client,
    });

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
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      projection: fullProjection(),
      client,
    });

    expect(
      await screen.findByText('name shadowed by manifest tool weather at boot'),
    ).toBeInTheDocument();
  });

  it('preflight: a non-empty holder list blocks the rename and links each holder', async () => {
    const user = userEvent.setup({ delay: null });
    const renamePreset = vi.fn();
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      getPresetReferees: vi.fn().mockResolvedValue({
        action: 'rename',
        holders: [
          { kind: 'preset', name: 'a_ref', locator: {}, summary: "preset 'a_ref'" },
          { kind: 'hook', name: 'h1', locator: {}, summary: "hook 'h1'" },
        ],
      }),
      renamePreset,
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      client,
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    expect(await screen.findByText('Still used by — update these first:')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Holders of paris_weather' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(["preset 'a_ref'", "hook 'h1'"]);
    expect(client.getPresetReferees).toHaveBeenCalledWith(
      'paris_weather',
      'rename',
      expect.anything(),
    );
    const rename = screen.getByRole('button', { name: 'Rename' });
    expect(rename).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'london_weather');
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
    expect(renamePreset).not.toHaveBeenCalled();
  });

  it('preflight: an empty holder list allows the rename', async () => {
    const user = userEvent.setup({ delay: null });
    const renamePreset = vi.fn().mockResolvedValue({
      name: 'london_weather',
      renamed_from: 'paris_weather',
      active_version: 7,
    });
    const getPresetReferees = vi.fn().mockResolvedValue({ action: 'rename', holders: [] });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      getPresetReferees,
      renamePreset,
    };
    const { queryClient } = renderWithProviders(<PresetDetail name="paris_weather" />, {
      client,
      projection: fullProjection(),
    });
    const remove = vi.spyOn(queryClient, 'removeQueries');

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    await user.type(screen.getByRole('textbox'), 'london_weather');
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(renamePreset).toHaveBeenCalledWith('paris_weather', 'london_weather');
    // The old name's holder previews are dropped alongside its other caches.
    expect(remove).toHaveBeenCalledWith({ queryKey: presetRefereesKey('paris_weather') });
  });

  it('preflight: a failed holder read degrades to advisory (submit stays enabled)', async () => {
    const user = userEvent.setup({ delay: null });
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
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      client,
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    // The advisory error shows muted, but a legal rename is NOT blocked.
    expect(
      await screen.findByText('Could not check what uses this: referees door 503'),
    ).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'london_weather');
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(renamePreset).toHaveBeenCalledWith('paris_weather', 'london_weather');
  });

  it('no grant: the preview is not read and the rename stays enabled', async () => {
    const user = userEvent.setup({ delay: null });
    const getPresetReferees = vi.fn();
    const renamePreset = vi.fn().mockResolvedValue({
      name: 'london_weather',
      renamed_from: 'paris_weather',
      active_version: 7,
    });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      getPresetReferees,
      renamePreset,
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      client,
      // The rename write is admitted; the referees read is not.
      projection: fullProjection({
        admin: false,
        routes: [{ path: apiRoutes.post_api_presets_name_rename.path, methods: ['POST'] }],
      }),
    });

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    expect(
      await screen.findByText(
        'Checking what still uses this is outside your access — it needs read access to presets.',
      ),
    ).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'london_weather');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(renamePreset).toHaveBeenCalledWith('paris_weather', 'london_weather');
    expect(getPresetReferees).not.toHaveBeenCalled();
  });

  it('a refusal naming holders shows its first line and lists the holders once', async () => {
    const user = userEvent.setup({ delay: null });
    const message = "preset 'paris_weather' cannot be renamed — held by:\n  hook 'h1'";
    const refusal = new ApiError(message, 409, undefined, undefined, {
      error: message,
      holders: [{ kind: 'hook', name: 'h1', locator: {}, summary: "hook 'h1'" }],
    });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      getPresetReferees: vi.fn().mockResolvedValue({ action: 'rename', holders: [] }),
      renamePreset: vi.fn().mockRejectedValue(refusal),
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      client,
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Rename preset paris_weather' }));
    await user.type(screen.getByRole('textbox'), 'london_weather');
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(
      await screen.findByText("preset 'paris_weather' cannot be renamed — held by:"),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "hook 'h1'" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
  });

  it('delete: a non-empty holder list disables Delete', async () => {
    const user = userEvent.setup({ delay: null });
    const deletePreset = vi.fn();
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      getPresetReferees: vi.fn().mockResolvedValue({
        action: 'delete',
        holders: [{ kind: 'schedule', name: 's1', locator: {}, summary: "schedule 's1'" }],
      }),
      deletePreset,
    };
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      client,
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Delete preset paris_weather' }));
    expect(await screen.findByText('Still used by — remove these first:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "schedule 's1'" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(client.getPresetReferees).toHaveBeenCalledWith(
      'paris_weather',
      'delete',
      expect.anything(),
    );
  });

  it('clears the ?preset= selection after a successful delete', async () => {
    const user = userEvent.setup({ delay: null });
    const deletePreset = vi.fn().mockResolvedValue({ name: 'paris_weather', deleted: true });
    const client: StubApiClient = {
      getPreset: vi.fn().mockResolvedValue(detail),
      listPresetVersions: vi.fn().mockResolvedValue(versions),
      listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
      deletePreset,
    };
    const { navigate, queryClient } = renderWithProviders(<PresetDetail name="paris_weather" />, {
      projection: fullProjection(),
      client,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const remove = vi.spyOn(queryClient, 'removeQueries');

    await user.click(await screen.findByRole('button', { name: 'Delete preset paris_weather' }));
    await clickWhenInteractable(user, screen.getByRole('button', { name: 'Delete' }));

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
