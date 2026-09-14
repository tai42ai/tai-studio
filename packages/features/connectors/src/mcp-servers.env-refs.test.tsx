import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MCP_SCHEMA, renderWithProviders, status } from './test-utils-mcp-servers';
import { McpServersSection } from './mcp-servers';

describe('McpServersSection — installed mcp-server entry + env-refs checklist', () => {
  // Entry 0 is installer-written (its title matches an installed mcp-server item
  // name); entry 1 is hand-authored.
  const PRESERVED = {
    mcp: [
      { title: 'postgres', config: { command: 'run' } },
      { title: 'handmade', config: { command: 'x' } },
    ],
    user_tools: [],
  };
  const INSTALLED = {
    installed: [
      {
        ref: 'tai42/postgres-mcp',
        version: '1.0.0',
        source: 'marketplace',
        installed_at: '2026-07-01T00:00:00Z',
        latest: null,
        update_available: false,
        incompatible_newer: null,
        missing_upstream: false,
        compat: { status: 'unknown', reason: null },
        items: [{ kind: 'mcp-server', name: 'postgres' }],
      },
    ],
    quarantined: [],
  };
  // Refs come ONLY from get_mcp_env_refs — names + set/unset booleans, never values.
  const ENV_REFS = [
    {
      var: 'DATABASE_URL',
      pointer: '/mcp/0/config/env/DATABASE_URL',
      has_default: false,
      set: false,
    },
    { var: 'API_KEY', pointer: '/mcp/0/config/env/API_KEY', has_default: false, set: true },
    {
      var: 'MANUAL_TOKEN',
      pointer: '/mcp/1/config/env/MANUAL_TOKEN',
      has_default: false,
      set: true,
    },
    // A defaulted-but-unset marker: unset in the effective env, but the `:default`
    // resolves it, so it is green (`default`), not the red bare-unset drift.
    { var: 'REGION', pointer: '/mcp/0/config/env/REGION', has_default: true, set: false },
  ];

  function client() {
    return {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(PRESERVED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      // Real env VALUES exist on this door — the checklist must never fetch or show them.
      getEnvConfig: vi
        .fn()
        .mockResolvedValue({ env: { DATABASE_URL: 'super-secret-value' }, secret_keys: [] }),
      listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(INSTALLED),
      getMcpEnvRefs: vi.fn().mockResolvedValue(ENV_REFS),
    };
  }

  it('renders the installer-written entry read-only with the uninstall-to-remove copy', async () => {
    renderWithProviders(<McpServersSection />, { client: client() });

    expect(
      await screen.findByText('Installed from tai42/postgres-mcp — uninstall to remove'),
    ).toBeInTheDocument();
    // Removal is disabled — uninstalling the plugin is the only way to remove it.
    expect(screen.getByRole('button', { name: 'Remove server 1' })).toBeDisabled();
    // It is NOT an editable entry (no Title input for the installed entry's index).
    expect(screen.queryByTestId('mcp-entry-0')).toBeNull();
  });

  it('renders the env-refs checklist from get_mcp_env_refs alone — never an env value', async () => {
    const stub = client();
    renderWithProviders(<McpServersSection />, { client: stub });

    await screen.findByText('Installed from tai42/postgres-mcp — uninstall to remove');
    // A bare unset marker is drift (red); a set marker is green.
    const unset = screen.getByText('unset');
    expect(unset).toHaveAttribute('data-variant', 'danger');
    expect(screen.getByText('the marker will not resolve')).toBeInTheDocument();
    expect(screen.getByText('DATABASE_URL')).toBeInTheDocument();
    const setBadges = screen.getAllByText('set');
    expect(setBadges[0]).toHaveAttribute('data-variant', 'success');
    // The checklist is a projection of get_mcp_env_refs — the real env value never
    // reaches it (masking is display-side; the checklist fetches no value at all).
    expect(screen.queryByText('super-secret-value')).toBeNull();
    expect(stub.getMcpEnvRefs).toHaveBeenCalled();
  });

  it('renders a defaulted-but-unset marker green (resolves via its default), no drift warning', async () => {
    renderWithProviders(<McpServersSection />, { client: client() });

    await screen.findByText('Installed from tai42/postgres-mcp — uninstall to remove');
    // has_default:true, set:false → the `:default` resolves the marker, so the badge
    // is the green `default` state, never the red bare-unset drift.
    const badge = screen.getByText('default');
    expect(badge).toHaveAttribute('data-variant', 'success');
    expect(screen.getByText('REGION')).toBeInTheDocument();
    // A resolving marker carries NO "will not resolve" copy on its own row.
    const regionRow = screen.getByText('REGION').closest('li');
    if (regionRow === null) throw new Error('expected the REGION checklist row');
    expect(within(regionRow).queryByText('the marker will not resolve')).toBeNull();
  });

  it('renders the same checklist on a hand-authored marker-bearing entry (platform-wide)', async () => {
    renderWithProviders(<McpServersSection />, { client: client() });

    // Entry 1 is editable; its `!ENV` marker still gets the names-only checklist.
    expect(await screen.findByTestId('mcp-entry-1')).toBeInTheDocument();
    expect(screen.getByText('MANUAL_TOKEN')).toBeInTheDocument();
  });
});
