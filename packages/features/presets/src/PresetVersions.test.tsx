/**
 * Version-history tests: rows render newest-first with the current badge, and a
 * rollback confirm calls `rollbackPreset` and invalidates the list + detail keys.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { toolsListKey } from '@tai42/studio-sdk';

import { PresetVersions } from './PresetVersions';
import { presetDetailKey, presetVersionsKey, presetsListKey } from './keys';
import { renderWithProviders, type StubApiClient } from './test-utils';

function version(v: number, isCurrent: boolean) {
  return {
    version: v,
    body: {
      base_tool: 'weather',
      description: '',
      fixed_kwargs: {},
      extensions: [],
      tags: [],
      output_schema: null,
    },
    tags: [],
    created_at: `t${String(v)}`,
    is_current: isCurrent,
  };
}

describe('PresetVersions', () => {
  it('renders versions newest-first with a current badge', async () => {
    // Server order is historical-first; the panel must present newest-first.
    const client: StubApiClient = {
      listPresetVersions: vi.fn().mockResolvedValue([version(1, false), version(2, true)]),
    };
    const { container } = renderWithProviders(<PresetVersions name="paris_weather" />, { client });

    await screen.findByTestId('version-row-2');
    const rows = [...container.querySelectorAll('[data-testid^="version-row-"]')];
    expect(rows[0]?.getAttribute('data-testid')).toBe('version-row-2');
    expect(rows[1]?.getAttribute('data-testid')).toBe('version-row-1');
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('threads per-version tags into a Tags column', async () => {
    const tagged = { ...version(2, true), tags: ['stable'] };
    const client: StubApiClient = {
      listPresetVersions: vi.fn().mockResolvedValue([version(1, false), tagged]),
    };
    renderWithProviders(<PresetVersions name="paris_weather" />, { client });

    await screen.findByTestId('version-row-2');
    expect(screen.getByRole('columnheader', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getByText('stable')).toBeInTheDocument();
  });

  it('edits a version tag through the dialog and invalidates the versions key', async () => {
    const user = userEvent.setup();
    const setPresetVersionTags = vi
      .fn()
      .mockResolvedValue({ name: 'paris_weather', version: 2, tags: ['stable', 'reviewed'] });
    const tagged = { ...version(2, true), tags: ['stable'] };
    const client: StubApiClient = {
      listPresetVersions: vi.fn().mockResolvedValue([version(1, false), tagged]),
      setPresetVersionTags,
    };
    const { queryClient } = renderWithProviders(<PresetVersions name="paris_weather" />, {
      client,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Edit tags for version 2' }));
    await user.type(screen.getByLabelText('Tags'), 'reviewed');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'Save tags' }));

    expect(setPresetVersionTags).toHaveBeenCalledWith('paris_weather', 2, ['stable', 'reviewed']);
    // Tags are an annotation on an immutable body — only the versions key is invalidated.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetVersionsKey('paris_weather') });
  });

  it('rolls back through the confirm and invalidates the list + detail keys', async () => {
    const user = userEvent.setup();
    const rollbackPreset = vi.fn().mockResolvedValue({ name: 'paris_weather', active_version: 1 });
    const client: StubApiClient = {
      listPresetVersions: vi.fn().mockResolvedValue([version(1, false), version(2, true)]),
      rollbackPreset,
    };
    const { queryClient } = renderWithProviders(<PresetVersions name="paris_weather" />, {
      client,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Roll back to version 1' }));
    await user.click(screen.getByRole('button', { name: 'Roll back' }));

    expect(rollbackPreset).toHaveBeenCalledWith('paris_weather', 1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetsListKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetDetailKey('paris_weather') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetVersionsKey('paris_weather') });
    // Rollback rebinds the live tool, so the tools master list must refetch too.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: toolsListKey });
  });
});
