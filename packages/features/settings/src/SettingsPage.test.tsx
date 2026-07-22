import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient, SettingsSchema } from '@tai42/api-client';
import type { SettingsTabProps } from '@tai42/studio-sdk';
import { loadPlugin, setPluginHostState, type PluginLoaderState } from '@tai42/studio-sdk/host';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';

import { SettingsPage } from './SettingsPage';
import { fullProjection, renderWithProviders, scopedProjection } from './test-utils';

interface StubMethods {
  readonly getConfigMode: ApiClient['getConfigMode'];
  readonly getSettingsSchema?: ApiClient['getSettingsSchema'];
  readonly getEnvConfig?: ApiClient['getEnvConfig'];
  readonly listBackupSections?: ApiClient['listBackupSections'];
}

/** A stub client exposing the reads the page and its default tab consume. */
function stubClient(methods: StubMethods): ApiClient {
  return methods as unknown as ApiClient;
}

const emptySchema = (): Promise<SettingsSchema> => Promise.resolve({ groups: [] });

/** The load-pass state the page reads via `usePluginContributions`. */
function hostState(status: PluginLoaderState['status']): PluginLoaderState {
  return { status, loaded: [], errors: {}, registryError: null };
}

// The registry and the host-state store are module singletons; reset both after
// every case so a seeded plugin tab never leaks into another test.
afterEach(() => {
  __resetContributions();
  __resetPluginHostState();
});

describe('SettingsPage', () => {
  it('shows the loading placeholder while the mode read is pending', () => {
    const client = stubClient({
      getConfigMode: vi
        .fn()
        .mockReturnValue(new Promise<{ config_mode: string; read_only: boolean }>(() => undefined)),
    });
    renderWithProviders(<SettingsPage search={{}} />, { client });

    expect(screen.getByTestId('settings-loading')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the mode badge and the four tabs', async () => {
    const client = stubClient({
      getConfigMode: vi.fn().mockResolvedValue({ config_mode: 'env-file', read_only: false }),
      getSettingsSchema: vi.fn(emptySchema),
    });
    // A full projection reaches every tab's reads, so all four core tabs are shown.
    renderWithProviders(<SettingsPage search={{}} />, { client, projection: fullProjection() });

    const badge = await screen.findByText('env-file');
    expect(badge).toHaveAttribute('data-variant', 'primary');
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument();

    for (const label of ['Settings', 'Environment', 'API keys', 'Backup']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('flags read-only mode with a badge', async () => {
    const client = stubClient({
      getConfigMode: vi.fn().mockResolvedValue({ config_mode: 'vault', read_only: true }),
      getSettingsSchema: vi.fn(emptySchema),
    });
    // A full projection covers /api/config, so the mode read runs and its card renders.
    renderWithProviders(<SettingsPage search={{}} />, { client, projection: fullProjection() });

    expect(await screen.findByText('Read-only')).toBeInTheDocument();
  });

  it('surfaces a loud error state when the mode read rejects', async () => {
    const client = stubClient({
      getConfigMode: vi.fn().mockRejectedValue(new Error('config unavailable')),
    });
    // A full projection covers /api/config, so the mode read runs and its rejection
    // surfaces as the loud ErrorState (a covered-but-failing read is a real error).
    renderWithProviders(<SettingsPage search={{}} />, { client, projection: fullProjection() });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('config unavailable');
    await waitFor(() => {
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });
  });
});

describe('SettingsPage plugin tabs', () => {
  const modeClient = (): ApiClient =>
    stubClient({
      getConfigMode: vi.fn().mockResolvedValue({ config_mode: 'env-file', read_only: false }),
      getSettingsSchema: vi.fn(emptySchema),
    });

  const CORE_LABELS = ['Settings', 'Environment', 'API keys', 'Backup', 'Roles'];

  it('renders a contributed tab after the core tabs once the load pass is ready', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerSettingsTab({
        id: 'general',
        title: 'Acme Settings',
        component: ({ pluginId }: SettingsTabProps): ReactElement => (
          <div data-testid="acme-tab-body">acme content for {pluginId}</div>
        ),
      });
    });
    setPluginHostState(hostState('ready'));

    renderWithProviders(<SettingsPage search={{}} />, {
      client: modeClient(),
      projection: fullProjection(),
    });
    await screen.findByText('env-file');

    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent);
    // The core tabs come first, then the single plugin tab.
    expect(labels).toEqual([...CORE_LABELS, 'Acme Settings']);
  });

  it('renders only the core tabs while the load pass is still loading', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerSettingsTab({ id: 'general', title: 'Acme Settings', component: () => null });
    });
    setPluginHostState(hostState('loading'));

    renderWithProviders(<SettingsPage search={{}} />, {
      client: modeClient(),
      projection: fullProjection(),
    });
    await screen.findByText('env-file');

    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(labels).toEqual(CORE_LABELS);
  });

  it('keeps two plugins that share a tab id from colliding (namespaced values)', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerSettingsTab({
        id: 'general',
        title: 'General',
        component: (): ReactElement => <div data-testid="acme-general">acme general</div>,
      });
    });
    await loadPlugin('globex', (ctx) => {
      ctx.registerSettingsTab({
        id: 'general',
        title: 'General',
        component: (): ReactElement => <div data-testid="globex-general">globex general</div>,
      });
    });
    setPluginHostState(hostState('ready'));

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage search={{}} />, {
      client: modeClient(),
      projection: fullProjection(),
    });
    await screen.findByText('env-file');

    // Same id AND same title from two plugins: both tabs coexist because each
    // carries a distinct `plugin:{pluginId}:{id}` value. Activating one shows only
    // that plugin's panel — a regression to a bare, non-namespaced `id` value would
    // make the two tabs share a value and reveal both panels at once.
    const generalTabs = screen.getAllByRole('tab', { name: 'General' });
    expect(generalTabs).toHaveLength(2);
    // acme sorts before globex, so the first tab is acme's.
    const [acmeTab, globexTab] = generalTabs;
    if (acmeTab === undefined || globexTab === undefined) {
      throw new Error('expected two General tabs');
    }

    await user.click(acmeTab);
    expect(await screen.findByTestId('acme-general')).toBeInTheDocument();
    expect(screen.queryByTestId('globex-general')).not.toBeInTheDocument();

    await user.click(globexTab);
    expect(await screen.findByTestId('globex-general')).toBeInTheDocument();
    expect(screen.queryByTestId('acme-general')).not.toBeInTheDocument();
  });

  it('orders plugin tabs by (pluginId, title) after the core tabs', async () => {
    // Registered out of sorted order and across plugins so a dropped, title-only,
    // or pluginId-only sort would each yield a different sequence. The correct
    // (pluginId, title) order is acme:Alpha, acme:Zulu, beta:Mid.
    await loadPlugin('beta', (ctx) => {
      ctx.registerSettingsTab({ id: 'b1', title: 'Mid', component: () => null });
    });
    await loadPlugin('acme', (ctx) => {
      ctx.registerSettingsTab({ id: 'a1', title: 'Zulu', component: () => null });
      ctx.registerSettingsTab({ id: 'a2', title: 'Alpha', component: () => null });
    });
    setPluginHostState(hostState('ready'));

    renderWithProviders(<SettingsPage search={{}} />, {
      client: modeClient(),
      projection: fullProjection(),
    });
    await screen.findByText('env-file');

    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(labels).toEqual([...CORE_LABELS, 'Alpha', 'Zulu', 'Mid']);
  });

  it('gates plugin tabs on requiredCapabilities for a scoped session', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerSettingsTab({
        id: 'covered',
        title: 'Covered',
        component: () => null,
        requiredCapabilities: { routes: ['/api/special'] },
      });
      ctx.registerSettingsTab({
        id: 'denied',
        title: 'Denied',
        component: () => null,
        requiredCapabilities: { routes: ['/api/secret'] },
      });
      ctx.registerSettingsTab({ id: 'absent', title: 'Absent', component: () => null });
    });
    setPluginHostState(hostState('ready'));

    renderWithProviders(<SettingsPage search={{}} />, {
      client: modeClient(),
      projection: scopedProjection({ routes: [{ path: '/api/special', methods: ['GET'] }] }),
    });
    // This scope does not reach `/api/config`, so there is no mode card; the
    // always-shown API keys tab is the render signal instead.
    await screen.findByRole('tab', { name: 'API keys' });

    // The scoped projection reaches `/api/special`, so the covered tab shows…
    expect(await screen.findByRole('tab', { name: 'Covered' })).toBeInTheDocument();
    // …the uncovered requirement hides its tab…
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Denied' })).not.toBeInTheDocument();
    });
    // …and an ABSENT requirement renders for full projections only, so it is hidden.
    expect(screen.queryByRole('tab', { name: 'Absent' })).not.toBeInTheDocument();
  });

  it('shows a full session every plugin tab, requirement or not', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerSettingsTab({ id: 'absent', title: 'Absent', component: () => null });
      ctx.registerSettingsTab({
        id: 'gated',
        title: 'Gated',
        component: () => null,
        requiredCapabilities: { routes: ['/api/special'] },
      });
    });
    setPluginHostState(hostState('ready'));

    renderWithProviders(<SettingsPage search={{}} />, {
      client: modeClient(),
      projection: fullProjection(),
    });
    await screen.findByText('env-file');

    expect(await screen.findByRole('tab', { name: 'Absent' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Gated' })).toBeInTheDocument();
  });

  it('contains a throwing plugin tab in its own error boundary without breaking the others', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerSettingsTab({
        id: 'boom',
        title: 'Boom',
        component: (): ReactElement => {
          throw new Error('plugin tab exploded');
        },
      });
    });
    setPluginHostState(hostState('ready'));

    // React logs a handled boundary error to console.error; silence that one line.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage search={{}} />, {
        client: modeClient(),
        projection: fullProjection(),
      });
      await screen.findByText('env-file');

      // Activating the plugin tab mounts its content, which throws; the boundary
      // shows the loud, contained ErrorState naming the plugin.
      await user.click(screen.getByRole('tab', { name: 'Boom' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('acme: plugin tab exploded');

      // The core tabs are untouched — switching back to a core tab unmounts the
      // contained error and renders the core content normally.
      await user.click(screen.getByRole('tab', { name: 'Settings' }));
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('SettingsPage — capability-gated sub-tab visibility', () => {
  // Tab visibility is the capability boundary: a core tab is shown only when the
  // projection reaches its backing READ route. Settings/Environment read the admin-only
  // `secret` routes `/api/config/settings-schema` + `/api/config/env`, Backup reads
  // `/api/backup`; the API keys tab is a self-limited own-key surface, so it is always
  // shown. The sibling plain read `/api/config/mode` is editor-reachable and must NOT open
  // the config tabs on its own — gating on the bare `/api/config` prefix would 403-wall
  // editors on the tabs' secret reads.
  const CONFIG_READ = { path: '/api/config/settings-schema', methods: ['GET'] };
  const MODE_READ = { path: '/api/config/mode', methods: ['GET'] };
  const BACKUP_READ = { path: '/api/backup/sections', methods: ['GET'] };

  /** A client stubbing every core tab's reads (including the always-on API keys tab,
   * so it never errors when it is the default active tab). */
  function visibilityClient(): ApiClient {
    return {
      getConfigMode: vi.fn().mockResolvedValue({ config_mode: 'env-file', read_only: false }),
      getSettingsSchema: vi.fn(emptySchema),
      getEnvConfig: vi.fn(() => Promise.resolve({ env: {}, secret_keys: [] })),
      listBackupSections: vi.fn(() => Promise.resolve([])),
      listTokensPayload: vi.fn(() => Promise.resolve([])),
      listScopes: vi.fn(() => Promise.resolve({})),
      getAuthCapabilities: vi.fn(() => Promise.resolve({ mintable: false })),
    } as unknown as ApiClient;
  }

  it('a full projection shows every core tab', async () => {
    renderWithProviders(<SettingsPage search={{}} />, {
      client: visibilityClient(),
      projection: fullProjection(),
    });
    await screen.findByText('env-file');

    for (const label of ['Settings', 'Environment', 'API keys', 'Backup']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('a projection reaching /api/config shows Settings + Environment but not Backup', async () => {
    renderWithProviders(<SettingsPage search={{}} />, {
      client: visibilityClient(),
      projection: scopedProjection({ routes: [CONFIG_READ] }),
    });
    await screen.findByText('env-file');

    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Environment' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'API keys' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Backup' })).not.toBeInTheDocument();
  });

  it('a projection reaching /api/backup shows Backup but not Settings/Environment', async () => {
    renderWithProviders(<SettingsPage search={{}} />, {
      client: visibilityClient(),
      projection: scopedProjection({ routes: [BACKUP_READ] }),
    });
    await screen.findByRole('tab', { name: 'Backup' });

    // Backup is covered but `/api/config` is not, so the mode read is skipped and no
    // mode card renders — only the Backup and always-on API keys tabs show.
    expect(screen.queryByText('env-file')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Backup' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'API keys' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Environment' })).not.toBeInTheDocument();
  });

  it('a projection reaching neither shows only the always-on API keys tab', async () => {
    renderWithProviders(<SettingsPage search={{}} />, {
      client: visibilityClient(),
      projection: scopedProjection({ routes: [] }),
    });
    await screen.findByRole('tab', { name: 'API keys' });

    // Neither `/api/config` nor `/api/backup` is covered: the mode read is skipped, no
    // mode card renders, and only the always-on API keys tab remains.
    expect(screen.queryByText('env-file')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'API keys' })).toBeInTheDocument();
    for (const label of ['Settings', 'Environment', 'Backup']) {
      expect(screen.queryByRole('tab', { name: label })).not.toBeInTheDocument();
    }
  });

  it('hides Settings/Environment for an editor reaching only /api/config/mode', async () => {
    // `GET /api/config/env` and `GET /api/config/settings-schema` are admin-only `secret`
    // routes; a scoped editor/viewer reaches only the plain `GET /api/config/mode` read.
    // The bare `/api/config` prefix would over-show both tabs (which then 403 on their
    // secret reads), so the gate is the secret routes themselves: `mode` alone must not
    // open the tabs, and the mode read must not fire.
    const getConfigMode = vi.fn().mockResolvedValue({ config_mode: 'env-file', read_only: false });
    const client = {
      getConfigMode,
      getSettingsSchema: vi.fn(emptySchema),
      getEnvConfig: vi.fn(() => Promise.resolve({ env: {}, secret_keys: [] })),
      listTokensPayload: vi.fn(() => Promise.resolve([])),
      listScopes: vi.fn(() => Promise.resolve({})),
      getAuthCapabilities: vi.fn(() => Promise.resolve({ mintable: false })),
    } as unknown as ApiClient;

    renderWithProviders(<SettingsPage search={{}} />, {
      client,
      projection: scopedProjection({ routes: [MODE_READ] }),
    });

    // Only the always-on API keys tab renders: no mode card, no Settings/Environment tab.
    expect(await screen.findByRole('tab', { name: 'API keys' })).toBeInTheDocument();
    expect(screen.queryByText('env-file')).not.toBeInTheDocument();
    for (const label of ['Settings', 'Environment', 'Backup']) {
      expect(screen.queryByRole('tab', { name: label })).not.toBeInTheDocument();
    }
    // The mode read (gated with the admin config tabs) was never issued.
    expect(getConfigMode).not.toHaveBeenCalled();
  });

  it('skips the mode read for a scoped session covering /api/auth but not /api/config', async () => {
    // The regression this guards: a scoped owner reaching `/api/auth` (own keys) but
    // NOT `/api/config` must still get the always-shown API keys tab. Letting the mode
    // read fire would 403 and wall the whole settings surface. The stub RESOLVES here;
    // the assertion is that the read is never issued in the first place.
    const getConfigMode = vi.fn().mockResolvedValue({ config_mode: 'env-file', read_only: false });
    const client = {
      getConfigMode,
      listTokensPayload: vi.fn(() => Promise.resolve([])),
      listScopes: vi.fn(() => Promise.resolve({})),
      getAuthCapabilities: vi.fn(() => Promise.resolve({ mintable: false })),
    } as unknown as ApiClient;

    renderWithProviders(<SettingsPage search={{}} />, {
      client,
      projection: scopedProjection({ routes: [{ path: '/api/auth', methods: ['GET'] }] }),
    });

    // The API keys tab renders — never a full-page ErrorState — and no mode card shows.
    expect(await screen.findByRole('tab', { name: 'API keys' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('env-file')).not.toBeInTheDocument();
    for (const label of ['Settings', 'Environment', 'Backup']) {
      expect(screen.queryByRole('tab', { name: label })).not.toBeInTheDocument();
    }
    // The mode read (a `/api/config` door) was never issued.
    expect(getConfigMode).not.toHaveBeenCalled();
  });
});
