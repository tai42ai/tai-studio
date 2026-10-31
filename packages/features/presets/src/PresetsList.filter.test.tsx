/**
 * The presets explorer's filter: the search box over the name, display name and
 * description (committed to `?q=` on Enter), the tag chips over the overlay tags
 * (kept in `?tags=`), and opening a preset keeping both.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PresetsList } from './PresetsList';
import { fullProjection, renderWithProviders, type StubApiClient } from './test-utils';

function preset(name: string, description: string) {
  return {
    name,
    base_tool: 'weather',
    description,
    active_version: 1,
    extensions: [],
    output_schema: null,
    conflicted: false,
    conflicted_reason: null,
    uses: [],
    used_by: [],
  };
}

function metaRow(toolName: string, tags: string[], displayName: string | null = null) {
  return { tool_name: toolName, display_name: displayName, folder_id: null, tags, hidden: null };
}

function filterClient(): StubApiClient {
  return {
    listPresets: vi
      .fn()
      .mockResolvedValue([
        preset('paris_weather', 'Paris forecast'),
        preset('tokyo_clock', 'Local time'),
        preset('plain', ''),
      ]),
    listToolMeta: vi.fn().mockResolvedValue({
      folders: [],
      meta: [metaRow('paris_weather', ['geo']), metaRow('tokyo_clock', ['time'], 'World clock')],
    }),
  };
}

const link = (name: string) => screen.queryByRole('link', { name: `Open preset ${name}` });

describe('PresetsList filter', () => {
  it('filters by the committed ?q= over the description', async () => {
    renderWithProviders(<PresetsList search={{ q: 'forecast' }} />, {
      projection: fullProjection(),
      client: filterClient(),
    });

    expect(await screen.findByRole('textbox', { name: 'Filter presets' })).toHaveValue('forecast');
    expect(
      await screen.findByRole('link', { name: 'Open preset paris_weather' }),
    ).toBeInTheDocument();
    expect(link('tokyo_clock')).toBeNull();
  });

  it('filters by the committed ?q= over the display name', async () => {
    renderWithProviders(<PresetsList search={{ q: 'world' }} />, {
      projection: fullProjection(),
      client: filterClient(),
    });

    expect(
      await screen.findByRole('link', { name: 'Open preset tokyo_clock' }),
    ).toBeInTheDocument();
    expect(link('paris_weather')).toBeNull();
  });

  it('commits the trimmed query to ?q= on Enter, keeping the selection and tags', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(
      <PresetsList search={{ preset: 'plain', tags: ['geo'] }} />,
      { projection: fullProjection(), client: filterClient() },
    );

    await user.type(await screen.findByRole('textbox', { name: 'Filter presets' }), ' tok {Enter}');
    expect(navigate).toHaveBeenCalledWith(
      'presets',
      { preset: 'plain', tags: ['geo'], q: 'tok' },
      { replace: true },
    );
  });

  it('filters by the selected overlay tags and writes a toggled chip to ?tags=', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<PresetsList search={{ tags: ['geo'] }} />, {
      projection: fullProjection(),
      client: filterClient(),
    });

    expect(
      await screen.findByRole('link', { name: 'Open preset paris_weather' }),
    ).toBeInTheDocument();
    expect(link('tokyo_clock')).toBeNull();
    const chips = screen.getByRole('group', { name: 'Filter presets by tag' });
    expect(chips).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'time (1)' }));
    expect(navigate).toHaveBeenCalledWith('presets', { tags: ['geo', 'time'], q: undefined });
  });

  it('keeps the filter when a preset is opened from its row', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(
      <PresetsList search={{ tags: ['geo'], q: 'paris' }} />,
      { projection: fullProjection(), client: filterClient() },
    );

    await user.click(await screen.findByText('Paris forecast'));
    expect(navigate).toHaveBeenCalledWith('presets', {
      preset: 'paris_weather',
      tags: ['geo'],
      q: 'paris',
    });
  });

  it('shows no tag chips while the overlay read has failed', async () => {
    renderWithProviders(<PresetsList search={{}} />, {
      projection: fullProjection(),
      client: {
        ...filterClient(),
        listToolMeta: vi.fn().mockRejectedValue(new Error('overlay store unreachable')),
      },
    });

    expect(
      await screen.findByRole('link', { name: 'Open preset paris_weather' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter presets by tag' })).toBeNull();
  });
});
