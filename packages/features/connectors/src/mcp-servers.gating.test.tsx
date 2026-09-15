import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { McpServersSection } from './mcp-servers';
import {
  failedReport,
  MANIFEST_CONFIGURED,
  MCP_SCHEMA,
  renderWithProviders,
  scopedProjection,
} from './test-utils-mcp-servers';

describe('McpServersSection — write gating (projection ⊆ gate)', () => {
  function gatingClient() {
    return {
      // One bound server, so the mounted table's own (gated) Reload is exercised
      // alongside the failed section's controls.
      getMcpStatus: vi.fn().mockResolvedValue({ bound: { steady: ['a_tool'] }, failed: [] }),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: [] }),
      listFailedMcps: vi
        .fn()
        .mockResolvedValue(failedReport([{ title: 'bad', status: 'timeout' }])),
    };
  }

  it('withdraws every write affordance for a read-only projection', async () => {
    // A scoped, non-admin projection carrying no reachable write routes: every write
    // door reads false, so no control that can only 403 on submit is offered.
    renderWithProviders(<McpServersSection />, {
      client: gatingClient(),
      projection: scopedProjection(),
    });

    // The failed-server section still renders (a reader may SEE what failed)…
    await screen.findByText('Failed servers');
    expect(screen.getByText('bad')).toBeInTheDocument();
    // …the mounted table lists the bound server without its Reload…
    expect(await screen.findByText('steady')).toBeInTheDocument();
    // …but its remediation doors are all withdrawn.
    expect(screen.queryByRole('button', { name: 'Reload all failed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deregister bad' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reload/ })).not.toBeInTheDocument();
    // The config editor renders read-only — its Save door is withdrawn.
    await screen.findByTestId('mcp-entry-0');
    expect(screen.queryByRole('button', { name: /Save config/ })).not.toBeInTheDocument();
  });

  it('offers every write affordance for a full (admin) projection', async () => {
    // The harness defaults to a total (admin) projection.
    renderWithProviders(<McpServersSection />, { client: gatingClient() });

    await screen.findByText('Failed servers');
    expect(screen.getByRole('button', { name: 'Reload all failed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deregister bad' })).toBeInTheDocument();
    expect(await screen.findByTestId('mcp-entry-0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save config/ })).toBeInTheDocument();
  });
});
