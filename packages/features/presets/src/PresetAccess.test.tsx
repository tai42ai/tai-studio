/**
 * Access and body tests across the presets surfaces: each write control shows only
 * once the projection admits its `method path`, a read-only caller reads a status
 * line in the controls' place, the active body draws its schema and map cards, a
 * stored row the server cannot read is answered by the fault view with its one way
 * out, and a deep-linked version is marked in the history.
 */
import { ApiError, apiRoutes, type MeProjection } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PresetDetail } from './PresetDetail';
import { PresetsList } from './PresetsList';
import { PresetVersions } from './PresetVersions';
import {
  clickWhenInteractable,
  detail,
  emptyMeta,
  fullProjection,
  record,
  renderWithProviders,
  type StubApiClient,
  versions,
} from './test-utils';

const READ_ONLY_LINE =
  'Saving a new version is outside your access — this preset is shown read-only.';
const CREATE_LINE = 'Creating presets is outside your access — presets are shown read-only.';

/** A non-admin projection reaching exactly `routes`. */
function scoped(routes: MeProjection['routes']): MeProjection {
  return fullProjection({ admin: false, routes });
}

/** Every presets write the detail and history offer, under its template path. */
const EDITOR_ROUTES: MeProjection['routes'] = [
  { path: '/api/presets', methods: ['GET'] },
  { path: apiRoutes.post_api_presets_name_versions.path, methods: ['GET', 'POST'] },
  { path: apiRoutes.post_api_presets_name_rename.path, methods: ['POST'] },
  { path: apiRoutes.delete_api_presets_name.path, methods: ['GET', 'DELETE'] },
  { path: apiRoutes.post_api_presets_name_rollback.path, methods: ['POST'] },
  { path: apiRoutes.put_api_presets_name_versions_version_tags.path, methods: ['PUT'] },
];

const META_ROUTE = { path: apiRoutes.patch_api_tool_meta_tools_tool_name.path, methods: ['PATCH'] };

function detailClient(over: StubApiClient = {}): StubApiClient {
  return {
    getPreset: vi.fn().mockResolvedValue(detail),
    listPresetVersions: vi.fn().mockResolvedValue(versions),
    listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
    ...over,
  };
}

/** The error a presets read answers when one stored row cannot be read. */
function faultError(preset: string): ApiError {
  return new ApiError(
    `stored preset '${preset}' cannot be read`,
    500,
    'stored-preset-unreadable',
    undefined,
    { preset },
  );
}

describe('PresetsList access', () => {
  const listClient = (): StubApiClient => ({
    listPresets: vi.fn().mockResolvedValue([record]),
    listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
  });

  it('withholds Create and says why when the projection lacks POST /api/presets', async () => {
    renderWithProviders(<PresetsList search={{}} />, {
      client: listClient(),
      projection: scoped([{ path: '/api/presets', methods: ['GET'] }]),
    });
    expect(await screen.findByText(CREATE_LINE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create preset' })).not.toBeInTheDocument();
  });

  it('offers Create with no status line on a full projection', async () => {
    renderWithProviders(<PresetsList search={{}} />, {
      client: listClient(),
      projection: fullProjection(),
    });
    expect(await screen.findByRole('button', { name: 'Create preset' })).toBeInTheDocument();
    expect(screen.queryByText(CREATE_LINE)).not.toBeInTheDocument();
  });
});

describe('PresetDetail access', () => {
  it('a viewer reads the body and history with no write control', async () => {
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      client: detailClient(),
      projection: scoped([{ path: '/api/presets', methods: ['GET'] }]),
    });
    expect(await screen.findByText(READ_ONLY_LINE)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fixed kwargs' })).toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    for (const name of [
      'New version',
      'Edit details for paris_weather',
      'Rename preset paris_weather',
      'Delete preset paris_weather',
      'Roll back to version 2',
      'Edit tags for version 2',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('an editor gets every control under its template path, with no status line', async () => {
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      client: detailClient(),
      projection: scoped([...EDITOR_ROUTES, META_ROUTE]),
    });
    expect(await screen.findByRole('button', { name: 'New version' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit details for paris_weather' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename preset paris_weather' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete preset paris_weather' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Roll back to version 2' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit tags for version 2' })).toBeInTheDocument();
    expect(screen.queryByText(READ_ONLY_LINE)).not.toBeInTheDocument();
  });

  it('a presets editor without PATCH on the overlay gets no Edit details and no line', async () => {
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      client: detailClient(),
      projection: scoped(EDITOR_ROUTES),
    });
    expect(await screen.findByRole('button', { name: 'New version' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit details for paris_weather' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(READ_ONLY_LINE)).not.toBeInTheDocument();
  });

  it('draws the input schema, input map and output map cards when the body sets them', async () => {
    const { container } = renderWithProviders(<PresetDetail name="paris_weather" />, {
      client: detailClient({
        getPreset: vi.fn().mockResolvedValue({
          ...detail,
          input_schema: { type: 'object', properties: { town: { type: 'string' } } },
          input_map: '{city: .town}',
          output_map: { id: 'shape-result' },
        }),
      }),
      projection: fullProjection(),
    });
    expect(await screen.findByRole('heading', { name: 'Input schema' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Input map' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Output map' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Output schema' })).not.toBeInTheDocument();
    expect(container.textContent).toContain('{city: .town}');
    expect(screen.getByText('template: shape-result')).toBeInTheDocument();
  });

  it('draws no schema or map card when the body sets none', async () => {
    renderWithProviders(<PresetDetail name="paris_weather" />, {
      client: detailClient(),
      projection: fullProjection(),
    });
    expect(await screen.findByRole('heading', { name: 'Fixed kwargs' })).toBeInTheDocument();
    for (const name of ['Input schema', 'Input map', 'Output schema', 'Output map']) {
      expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
    }
  });
});

describe('the stored-preset fault view', () => {
  const DENIED =
    "Deleting preset 'broken' is outside your access — it needs write access to presets.";

  it('the list offers the delete of the unreadable row, with no Retry', async () => {
    renderWithProviders(<PresetsList search={{}} />, {
      client: { listPresets: vi.fn().mockRejectedValue(faultError('broken')) },
      projection: fullProjection(),
    });
    expect(
      await screen.findByRole('button', { name: "Delete preset 'broken'" }),
    ).toBeInTheDocument();
    expect(screen.getByText("stored preset 'broken' cannot be read")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('deletes the row, rereads the presets and leaves the selection it named', async () => {
    const user = userEvent.setup({ delay: null });
    const deletePreset = vi.fn().mockResolvedValue({ name: 'broken', deleted: true });
    const { navigate, queryClient } = renderWithProviders(<PresetDetail name="broken" />, {
      client: {
        getPreset: vi.fn().mockRejectedValue(faultError('broken')),
        listPresetVersions: vi.fn().mockResolvedValue([]),
        listToolMeta: vi.fn().mockResolvedValue(emptyMeta),
        getPresetReferees: vi.fn().mockResolvedValue({ action: 'delete', holders: [] }),
        deletePreset,
      },
      projection: fullProjection(),
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: "Delete preset 'broken'" }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        "Deletes the stored preset; a registered preset's tool (and its branch tools) is torn down with it, a quarantined record is removed alone.",
      ),
    ).toBeInTheDocument();
    await clickWhenInteractable(user, within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deletePreset).toHaveBeenCalledWith('broken');
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('presets', {});
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['presets'] });
  });

  it('keeps the selection when the faulted row is another preset', async () => {
    const user = userEvent.setup({ delay: null });
    const { navigate } = renderWithProviders(<PresetsList search={{ preset: 'paris_weather' }} />, {
      client: {
        listPresets: vi.fn().mockRejectedValue(faultError('broken')),
        getPresetReferees: vi.fn().mockResolvedValue({ action: 'delete', holders: [] }),
        deletePreset: vi.fn().mockResolvedValue({ name: 'broken', deleted: true }),
      },
      projection: fullProjection(),
    });
    await user.click(await screen.findByRole('button', { name: "Delete preset 'broken'" }));
    const dialog = await screen.findByRole('dialog');
    await clickWhenInteractable(user, within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says the delete is outside the access on a ready projection without the grant', async () => {
    renderWithProviders(<PresetsList search={{}} />, {
      client: { listPresets: vi.fn().mockRejectedValue(faultError('broken')) },
      projection: scoped([{ path: '/api/presets', methods: ['GET'] }]),
    });
    expect(await screen.findByText(DENIED)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: "Delete preset 'broken'" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['loading', undefined],
    ['failed', new Error('me read failed')],
  ])('draws neither the delete nor the line while the projection is %s', async (_, projection) => {
    renderWithProviders(<PresetsList search={{}} />, {
      client: { listPresets: vi.fn().mockRejectedValue(faultError('broken')) },
      projection,
    });
    expect(await screen.findByText("stored preset 'broken' cannot be read")).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: "Delete preset 'broken'" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(DENIED)).not.toBeInTheDocument();
  });

  it('keeps the plain error with Retry for any other read failure', async () => {
    renderWithProviders(<PresetsList search={{}} />, {
      client: { listPresets: vi.fn().mockRejectedValue(new ApiError('boom', 500)) },
      projection: fullProjection(),
    });
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete preset/ })).not.toBeInTheDocument();
  });
});

describe('PresetVersions deep link', () => {
  it('marks the linked version row', async () => {
    renderWithProviders(<PresetVersions name="paris_weather" version={2} />, {
      client: { listPresetVersions: vi.fn().mockResolvedValue(versions) },
      projection: fullProjection(),
    });
    const button = await screen.findByRole('button', { name: 'Roll back to version 2' });
    expect(button.closest('tr')).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText(/is not in this preset's history/)).not.toBeInTheDocument();
  });

  it('says so when the linked version is not in the history', async () => {
    renderWithProviders(<PresetVersions name="paris_weather" version={9} />, {
      client: { listPresetVersions: vi.fn().mockResolvedValue(versions) },
      projection: fullProjection(),
    });
    expect(
      await screen.findByText("Version 9 is not in this preset's history."),
    ).toBeInTheDocument();
    expect(document.querySelector('tr[aria-current]')).toBeNull();
  });
});
