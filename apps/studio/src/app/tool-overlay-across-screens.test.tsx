/**
 * The tool overlay (folders, tags, display names) is one cache shared by every
 * screen: an overlay write made on the tools screen refreshes the presets screen's
 * overlay read, so a preset filed on one screen is refiled on the other with no
 * reload. Both real pages share one query client, the way the shell mounts them,
 * over a stub client that keeps the overlay as the server would.
 */
import type {
  ApiClient,
  MeProjection,
  ToolMetaOverlay,
  ToolMetaPatch,
  ToolMetaRecord,
} from '@tai42/api-client';
import { PresetsPage } from '@tai42/feature-presets';
import { ToolsPage } from '@tai42/feature-tools';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  SystemKindsProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SESSION_KEY = 'tai-studio.apiKey';

const PROJECTION: MeProjection = {
  access_control_enabled: true,
  user_id: 'u-admin',
  owner_user_id: null,
  principal: null,
  admin: true,
  public_resource_id: 'public',
  scopes: ['*'],
  routes: [],
  route_patterns: [],
  sub_mcp: [],
  tools: [],
  agents: [],
  mintable: false,
};

const PRESET = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: 'Paris weather',
  active_version: 1,
  extensions: [],
  output_schema: null,
  input_schema: null,
  input_map: null,
  output_map: null,
  conflicted: false,
  conflicted_reason: null,
  uses: [],
  used_by: [],
};

/** A stub client whose overlay write lands in the overlay the next read returns. */
function overlayClient(): Partial<ApiClient> {
  let overlay: ToolMetaOverlay = {
    folders: [{ id: 'f-forecasts', name: 'Forecasts', parent_id: null }],
    meta: [],
  };
  return {
    listTools: vi.fn().mockResolvedValue(['paris_weather']),
    listToolTags: vi.fn().mockResolvedValue([]),
    listPresets: vi.fn().mockResolvedValue([PRESET]),
    listToolMeta: vi.fn(() => Promise.resolve(overlay)),
    upsertToolMeta: vi.fn((toolName: string, patch: ToolMetaPatch) => {
      const current: ToolMetaRecord = overlay.meta.find(
        (entry) => entry.tool_name === toolName,
      ) ?? {
        tool_name: toolName,
        display_name: null,
        tags: [],
        badges: [],
        folder_id: null,
        hidden: null,
      };
      const row: ToolMetaRecord = {
        tool_name: toolName,
        display_name: patch.display_name === undefined ? current.display_name : patch.display_name,
        tags: [...(patch.tags ?? current.tags)],
        badges: [...(patch.badges ?? current.badges)],
        folder_id: patch.folder_id === undefined ? current.folder_id : patch.folder_id,
        hidden: patch.hidden === undefined ? current.hidden : patch.hidden,
      };
      overlay = {
        ...overlay,
        meta: [...overlay.meta.filter((entry) => entry.tool_name !== toolName), row],
      };
      return Promise.resolve(row);
    }),
    getSystemKinds: () => Promise.resolve([]),
    getMe: () => Promise.resolve(PROJECTION),
  };
}

function renderBothScreens(client: Partial<ApiClient>): void {
  globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={client as ApiClient}>
          <SystemKindsProvider>
            <CapabilityProvider>
              <ThemeProvider>
                <NavigationProvider
                  value={{
                    navigate: vi.fn(),
                    resolvePath: () => '/x',
                    navigatePlugin: vi.fn(),
                    resolvePluginPath: () => '/x',
                  }}
                >
                  <section aria-label="Tools screen">
                    <ToolsPage search={{}} />
                  </section>
                  <section aria-label="Presets screen">
                    <PresetsPage search={{}} />
                  </section>
                </NavigationProvider>
              </ThemeProvider>
            </CapabilityProvider>
          </SystemKindsProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  globalThis.sessionStorage.removeItem(SESSION_KEY);
  globalThis.localStorage.clear();
});

describe('the tool overlay across screens', () => {
  it('refiles a preset on the presets screen when the tools screen moves it into a folder', async () => {
    const user = userEvent.setup({ delay: null });
    renderBothScreens(overlayClient());
    const presets = screen.getByRole('region', { name: 'Presets screen' });
    const tools = screen.getByRole('region', { name: 'Tools screen' });

    // Unfiled, the preset sits at the presets screen's root.
    expect(
      await within(presets).findByRole('link', { name: 'Open preset paris_weather' }),
    ).toBeInTheDocument();

    const edit = await within(tools).findByRole('button', { name: 'Edit tool paris_weather' });
    await user.click(edit);
    const dialog = await screen.findByRole('dialog', { name: 'Edit paris_weather' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Folder' }));
    await user.click(await screen.findByRole('option', { name: 'Forecasts' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // Filed into Forecasts, it leaves the presets screen's root with no reload.
    await waitFor(() => {
      expect(within(presets).queryByRole('link', { name: 'Open preset paris_weather' })).toBeNull();
    });
    expect(within(presets).getByRole('button', { name: 'Forecasts' })).toBeInTheDocument();
  });
});
