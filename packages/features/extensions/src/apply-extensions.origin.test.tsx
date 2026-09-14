/**
 * ApplyExtensionsPanel — origin branching, config-bearing combos, the combos-load
 * states, hidden-tool exclusion, and display-name overlay. The manifest save/edit
 * flow lives in the sibling test file; these render the same panel.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  ApiSchemaError,
  type ApiClient,
  type Extension,
  type PresetRecord,
} from '@tai42/api-client';

import { StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';

import { ApplyExtensionsPanel } from './apply-extensions';
import { renderWithProviders } from './test-utils';

const CATALOG: Extension[] = [
  { name: 'marka', kind: 'wrapper' },
  { name: 'markb', kind: 'wrapper' },
  { name: 'backendx', kind: 'backend' },
];

const parisPreset: PresetRecord = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: '',
  active_version: 2,
  extensions: [['marka']],
  output_schema: null,
  input_schema: null,
  conflicted: false,
  conflicted_reason: null,
  uses: [],
  used_by: [],
};

/** Build a stub client; every method the panel might call has a safe default. */
function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listTools: vi.fn().mockResolvedValue(['shout', 'paris_weather']),
    listPresets: vi.fn().mockResolvedValue([parisPreset]),
    listToolTags: vi.fn().mockResolvedValue([]),
    listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }),
    listExtensions: vi.fn().mockResolvedValue(CATALOG),
    getToolExtensions: vi.fn().mockResolvedValue({ combos: [['marka']], available: CATALOG }),
    setToolExtensions: vi.fn().mockResolvedValue({ status: 'ok', env_keys: 0 }),
    getPreset: vi.fn().mockResolvedValue({ ...parisPreset, fixed_kwargs: {} }),
    savePresetVersion: vi.fn().mockResolvedValue({
      version: 3,
      body: { base_tool: 'weather', description: '', fixed_kwargs: {}, extensions: [] },
      tags: [],
      created_at: 'now',
      is_current: true,
    }),
    ...overrides,
  } as unknown as ApiClient;
}

/** Open the tool picker and choose a tool by its option name. */
async function selectTool(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(await screen.findByRole('combobox'));
  await user.click(await screen.findByRole('option', { name }));
}

describe('ApplyExtensionsPanel — origin branch', () => {
  it('a preset tool reads/writes through the presets API, never the manifest route', async () => {
    const user = userEvent.setup();
    const getPreset = vi.fn().mockResolvedValue({ ...parisPreset, fixed_kwargs: {} });
    const savePresetVersion = vi.fn().mockResolvedValue({
      version: 3,
      body: { base_tool: 'weather', description: '', fixed_kwargs: {}, extensions: [] },
      tags: [],
      created_at: 'now',
      is_current: true,
    });
    const getToolExtensions = vi.fn();
    const setToolExtensions = vi.fn();
    const client = makeClient({
      getPreset,
      savePresetVersion,
      getToolExtensions,
      setToolExtensions,
    });
    renderWithProviders(<ApplyExtensionsPanel />, { client });

    await selectTool(user, 'paris_weather');

    // The active version's combos load via the presets API (branch preview shown).
    expect(await screen.findByText('paris_weather_marka')).toBeInTheDocument();
    await waitFor(() => {
      expect(getPreset).toHaveBeenCalledWith('paris_weather', expect.anything());
    });
    expect(getToolExtensions).not.toHaveBeenCalled();

    // Edit and save → savePresetVersion with extensions ALONE; manifest write untouched.
    await user.click(await screen.findByRole('checkbox', { name: 'markb' }));
    await user.click(screen.getByRole('button', { name: 'Save extensions' }));

    await waitFor(() => {
      expect(savePresetVersion).toHaveBeenCalledWith('paris_weather', {
        extensions: [['marka', 'markb']],
      });
    });
    expect(setToolExtensions).not.toHaveBeenCalled();
  });

  it('a manifest tool goes through getToolExtensions, never getPreset', async () => {
    const user = userEvent.setup();
    const getToolExtensions = vi
      .fn()
      .mockResolvedValue({ combos: [['marka']], available: CATALOG });
    const getPreset = vi.fn();
    renderWithProviders(<ApplyExtensionsPanel />, {
      client: makeClient({ getToolExtensions, getPreset }),
    });

    await selectTool(user, 'shout');
    await screen.findByText('Extension set 1');

    expect(getToolExtensions).toHaveBeenCalledWith('shout', expect.anything());
    expect(getPreset).not.toHaveBeenCalled();
  });

  it('a conflicted preset row falls through to the manifest branch, never the presets API', async () => {
    // A conflicted preset is quarantined (its edit routes are 409 delete-only), so the row
    // is EXCLUDED from the preset branch and the tool falls through to the manifest read/write
    // path — where a foreign live tool of the same name is served. It must read via
    // getToolExtensions, never getPreset/savePresetVersion.
    const user = userEvent.setup();
    const conflictedPreset: PresetRecord = {
      name: 'clash',
      base_tool: 'weather',
      description: '',
      active_version: 2,
      extensions: [['marka']],
      output_schema: null,
      input_schema: null,
      conflicted: true,
      conflicted_reason: 'name collided with an existing tool at startup',
      uses: [],
      used_by: [],
    };
    const getToolExtensions = vi
      .fn()
      .mockResolvedValue({ combos: [['marka']], available: CATALOG });
    const getPreset = vi.fn();
    const savePresetVersion = vi.fn();
    renderWithProviders(<ApplyExtensionsPanel />, {
      client: makeClient({
        listTools: vi.fn().mockResolvedValue(['clash']),
        listPresets: vi.fn().mockResolvedValue([conflictedPreset]),
        getToolExtensions,
        getPreset,
        savePresetVersion,
      }),
    });

    await selectTool(user, 'clash');
    await screen.findByText('Extension set 1');

    expect(getToolExtensions).toHaveBeenCalledWith('clash', expect.anything());
    expect(getPreset).not.toHaveBeenCalled();
    expect(savePresetVersion).not.toHaveBeenCalled();
  });
});

describe('ApplyExtensionsPanel — config-bearing combos', () => {
  it('names the branch on the element NAME and preserves an untouched combo config across a sibling edit', async () => {
    const user = userEvent.setup();
    const configSchema = { type: 'object', title: 'Weather', properties: {} };
    const configPreset: PresetRecord = {
      ...parisPreset,
      extensions: [[{ name: 'output_schema', config: { schema: configSchema } }], ['marka']],
    };
    const catalog: Extension[] = [...CATALOG, { name: 'output_schema', kind: 'wrapper' }];
    const savePresetVersion = vi.fn().mockResolvedValue({
      version: 3,
      body: { base_tool: 'weather', description: '', fixed_kwargs: {}, extensions: [] },
      tags: [],
      created_at: 'now',
      is_current: true,
    });
    renderWithProviders(<ApplyExtensionsPanel />, {
      client: makeClient({
        listPresets: vi.fn().mockResolvedValue([configPreset]),
        getPreset: vi.fn().mockResolvedValue({ ...configPreset, fixed_kwargs: {} }),
        listExtensions: vi.fn().mockResolvedValue(catalog),
        savePresetVersion,
      }),
    });

    await selectTool(user, 'paris_weather');

    // The branch tool for the `{ name, config }` element is named on its NAME alone —
    // identical to what a bare `"output_schema"` string would produce.
    expect(await screen.findByText('paris_weather_output_schema')).toBeInTheDocument();
    expect(screen.getByText('paris_weather_marka')).toBeInTheDocument();

    // Edit the SECOND combo (add markb); the first (config-bearing) combo is untouched.
    const secondRow = screen.getByTestId('combo-row-1');
    await user.click(within(secondRow).getByRole('checkbox', { name: 'markb' }));
    await user.click(screen.getByRole('button', { name: 'Save extensions' }));

    // The untouched combo keeps its `{ name, config }` element verbatim (config survives).
    await waitFor(() => {
      expect(savePresetVersion).toHaveBeenCalledWith('paris_weather', {
        extensions: [
          [{ name: 'output_schema', config: { schema: configSchema } }],
          ['marka', 'markb'],
        ],
      });
    });
  });
});

describe('ApplyExtensionsPanel — combos load states', () => {
  it('shows the loading placeholder while combos are pending', async () => {
    const user = userEvent.setup();
    const getToolExtensions = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<ApplyExtensionsPanel />, { client: makeClient({ getToolExtensions }) });

    await selectTool(user, 'shout');
    expect(await screen.findByTestId('combos-loading')).toBeInTheDocument();
  });

  it('shows the empty state when the tool has no combos', async () => {
    const user = userEvent.setup();
    const getToolExtensions = vi.fn().mockResolvedValue({ combos: [], available: CATALOG });
    renderWithProviders(<ApplyExtensionsPanel />, { client: makeClient({ getToolExtensions }) });

    await selectTool(user, 'shout');
    expect(await screen.findByText('No extensions applied')).toBeInTheDocument();
  });

  it('surfaces a zod mismatch (ApiSchemaError) LOUDLY as the combos error state', async () => {
    const user = userEvent.setup();
    const getToolExtensions = vi
      .fn()
      .mockRejectedValue(new ApiSchemaError('/api/tools/shout/extensions', 'combos drift'));
    renderWithProviders(<ApplyExtensionsPanel />, { client: makeClient({ getToolExtensions }) });

    await selectTool(user, 'shout');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/did not match its expected schema/);
  });
});

describe('ApplyExtensionsPanel — hidden-tool exclusion', () => {
  it('excludes an EFFECTIVE-hidden tool, keeping an overlay-`false` unhidden one', async () => {
    // `secret` is plugin-hidden with no overlay opinion → excluded. `open_tool` is
    // plugin-hidden but the overlay forces it visible (`hidden: false`) → offered.
    const user = userEvent.setup();
    renderWithProviders(<ApplyExtensionsPanel />, {
      client: makeClient({
        listTools: vi.fn().mockResolvedValue(['shout', 'secret', 'open_tool']),
        listPresets: vi.fn().mockResolvedValue([]),
        listToolTags: vi.fn().mockResolvedValue([
          { name: 'shout', tags: [], hidden: false },
          { name: 'secret', tags: [], hidden: true },
          { name: 'open_tool', tags: [], hidden: true },
        ]),
        listToolMeta: vi.fn().mockResolvedValue({
          folders: [],
          meta: [
            {
              tool_name: 'open_tool',
              display_name: null,
              folder_id: null,
              tags: [],
              hidden: false,
            },
          ],
        }),
      }),
    });

    await user.click(await screen.findByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'shout' })).toBeInTheDocument();
    // The overlay UNHIDES the plugin-hidden `open_tool`, so it IS offered.
    expect(screen.getByRole('option', { name: 'open_tool' })).toBeInTheDocument();
    // The effective-hidden `secret` is absent from the picker.
    expect(screen.queryByRole('option', { name: 'secret' })).toBeNull();
  });
});

describe('ApplyExtensionsPanel — display names', () => {
  it('labels a picker option "Display (raw)" from the tool-meta overlay', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StaticToolDisplayNamesProvider names={{ shout: 'Shout' }}>
        <ApplyExtensionsPanel />
      </StaticToolDisplayNamesProvider>,
      { client: makeClient({ listTools: vi.fn().mockResolvedValue(['shout']) }) },
    );

    await user.click(await screen.findByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'Shout (shout)' })).toBeInTheDocument();
  });
});
