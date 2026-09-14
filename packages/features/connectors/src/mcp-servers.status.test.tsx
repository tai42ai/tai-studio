import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  MANIFEST,
  MCP_SCHEMA,
  failedReport,
  fleetOk,
  renderWithProviders,
  status,
} from './test-utils-mcp-servers';
import { McpServersSection } from './mcp-servers';

describe('McpServersSection — mounted + failed status', () => {
  it('lists mounted servers with their status', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpServersSection />, { client });

    expect(await screen.findByText('srv')).toBeInTheDocument();
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    // The hidden Actions header wears the published clip class, not a partial
    // hand-rolled copy of it that stays selectable and readable to a magnifier.
    expect(screen.getAllByText('Actions')[0]).toHaveClass('tai-visually-hidden');
    // The mounted table shows the BOUND server's tool count; failed servers live in
    // their own health section (this test leaves it empty via the harness default).
    expect(screen.getByText('2 tools')).toBeInTheDocument();
    expect(screen.queryByText('Failed servers')).not.toBeInTheDocument();
  });

  it('surfaces failed servers in a dedicated health section with reload + deregister', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue({ bound: { srv: ['a', 'b'] }, failed: [] }),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      listFailedMcps: vi
        .fn()
        .mockResolvedValue(failedReport([{ title: 'bad', status: 'timeout' }])),
    };
    renderWithProviders(<McpServersSection />, { client });

    expect(await screen.findByText('Failed servers')).toBeInTheDocument();
    expect(screen.getByText('bad')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deregister bad' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload all failed' })).toBeInTheDocument();
  });

  it('reloads one failed server and re-reads both the failed roster and the status', async () => {
    const user = userEvent.setup();
    const reloadMcp = vi.fn().mockResolvedValue(fleetOk('reload_mcp'));
    const listFailedMcps = vi
      .fn()
      .mockResolvedValue(failedReport([{ title: 'bad', status: 'timeout' }]));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue({ bound: {}, failed: [] }),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      listFailedMcps,
      reloadMcp,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByText('Failed servers');
    // The failed row's Reload (not the "Reload all failed" button).
    const rowReload = within(screen.getByText('bad').closest('tr') as HTMLElement).getByRole(
      'button',
      { name: /Reload/ },
    );
    await user.click(rowReload);

    expect(reloadMcp).toHaveBeenCalledWith('bad');
    await waitFor(() => {
      expect(listFailedMcps.mock.calls.length).toBeGreaterThan(1);
    });
    expect(client.getMcpStatus.mock.calls.length).toBeGreaterThan(1);
  });

  it('reloads the whole failed roster via Reload all failed', async () => {
    const user = userEvent.setup();
    const reloadFailedMcps = vi.fn().mockResolvedValue(fleetOk('reload_failed_mcps'));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue({ bound: {}, failed: [] }),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      listFailedMcps: vi
        .fn()
        .mockResolvedValue(failedReport([{ title: 'bad', status: 'timeout' }])),
      reloadFailedMcps,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByText('Failed servers');
    await user.click(screen.getByRole('button', { name: 'Reload all failed' }));
    expect(reloadFailedMcps).toHaveBeenCalledTimes(1);
  });

  it('deregisters a failed server only after the house confirm', async () => {
    const user = userEvent.setup();
    const deregisterMcp = vi.fn().mockResolvedValue(fleetOk('deregister_mcp'));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue({ bound: {}, failed: [] }),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      listFailedMcps: vi
        .fn()
        .mockResolvedValue(failedReport([{ title: 'bad', status: 'timeout' }])),
      deregisterMcp,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByText('Failed servers');
    await user.click(screen.getByRole('button', { name: 'Deregister bad' }));
    // The confirm is open but nothing has fired yet — a destructive detach never runs
    // on the row click alone.
    expect(deregisterMcp).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Deregister' }));
    expect(deregisterMcp).toHaveBeenCalledWith('bad');
  });

  it('surfaces a non-converged deregister as a fleet report naming the stranded worker', async () => {
    const user = userEvent.setup();
    // A partial fan-out: detached on serve-a but serve-b never finished — the tools are
    // still live there. The dialog must NOT close on a silent success; the report names
    // the stranded worker so the operator can converge it.
    const deregisterMcp = vi.fn().mockResolvedValue({
      op: 'deregister_mcp',
      reachable: true,
      local_only: false,
      results: [
        { name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
        { name: 'serve-b', outcome: 'timed_out', payload: null, error: null, detail: null },
      ],
      error: null,
    });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue({ bound: {}, failed: [] }),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      listFailedMcps: vi
        .fn()
        .mockResolvedValue(failedReport([{ title: 'bad', status: 'timeout' }])),
      deregisterMcp,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByText('Failed servers');
    await user.click(screen.getByRole('button', { name: 'Deregister bad' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Deregister' }));

    // The dialog stays OPEN on a non-converged detach so the operator sees the stranded
    // worker in context and closes explicitly (mirrors ConnectDialog).
    const openDialog = await screen.findByRole('dialog');
    // The detach broadcast is reported loudly INSIDE the dialog — a partial fan-out is
    // never swallowed, and the report lives beside the confirm it came from.
    const alert = await within(openDialog).findByRole('alert');
    expect(within(alert).getByText(/1 worker did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText('serve-b')).toBeInTheDocument();
    // Nothing was "saved" — a detach is never a config save.
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    // The remediation must be to RE-RUN THE DEREGISTER, not a reload: a reload would
    // re-attach the very server being detached, converging the fleet the wrong way.
    expect(within(alert).getByText(/re-run the deregister to converge it/)).toBeInTheDocument();
    expect(within(alert).queryByText(/re-run the reload/)).not.toBeInTheDocument();

    // Explicit close: the operator dismisses the dialog, and the report goes with it.
    await user.click(within(openDialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('reports a converged deregister calmly, with no fleet-failure alert', async () => {
    const user = userEvent.setup();
    // A lone-worker (converged) detach: the report renders nothing — the surface shows
    // its own success, never a spurious fleet-failure panel.
    const deregisterMcp = vi.fn().mockResolvedValue(fleetOk('deregister_mcp'));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue({ bound: {}, failed: [] }),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      listFailedMcps: vi
        .fn()
        .mockResolvedValue(failedReport([{ title: 'bad', status: 'timeout' }])),
      deregisterMcp,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByText('Failed servers');
    await user.click(screen.getByRole('button', { name: 'Deregister bad' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Deregister' }));

    // The detach ran…
    await waitFor(() => {
      expect(deregisterMcp).toHaveBeenCalledWith('bad');
    });
    // …and the confirm closed (the shared mutation's success clears the target).
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // A converged fan-out raises no fleet-failure alert.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps failed servers out of the mounted table (bound only)', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue({ bound: { srv: ['a'] }, failed: [] }),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      listFailedMcps: vi
        .fn()
        .mockResolvedValue(failedReport([{ title: 'bad', status: 'timeout' }])),
    };
    renderWithProviders(<McpServersSection />, { client });

    // The mounted table lists the bound server; the failed one appears only under the
    // health section, never mixed into the mounted rows.
    await screen.findByText('srv');
    const mounted = (screen.getByText('Mounted servers').closest('div') ?? null) as HTMLElement;
    expect(within(mounted).getByText('srv')).toBeInTheDocument();
    expect(within(mounted).queryByText('bad')).not.toBeInTheDocument();
    // The failed server shows up under its own health section instead.
    expect(screen.getByText('Failed servers')).toBeInTheDocument();
    expect(screen.getByText('bad')).toBeInTheDocument();
  });

  it('reloads a server via its per-server button', async () => {
    const user = userEvent.setup();
    const reloadMcp = vi.fn().mockResolvedValue({
      op: 'reload_mcp',
      reachable: true,
      local_only: false,
      results: [{ name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null }],
      error: null,
    });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      reloadMcp,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByText('srv');
    const [firstReload] = screen.getAllByRole('button', { name: /Reload/ });
    if (firstReload === undefined) throw new Error('expected a reload button');
    await user.click(firstReload);

    expect(reloadMcp).toHaveBeenCalledWith('srv');
    // The invalidation re-runs the status query.
    await waitFor(() => {
      expect(client.getMcpStatus.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('reports a non-converged reload with the reload framing, not "Change saved"', async () => {
    const user = userEvent.setup();
    const reloadMcp = vi.fn().mockResolvedValue({
      op: 'reload_mcp',
      reachable: true,
      local_only: false,
      results: [
        { name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
        { name: 'serve-b', outcome: 'timed_out', payload: null, error: null, detail: null },
      ],
      error: null,
    });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      reloadMcp,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByText('srv');
    const [firstReload] = screen.getAllByRole('button', { name: /Reload/ });
    if (firstReload === undefined) throw new Error('expected a reload button');
    await user.click(firstReload);

    // A single-MCP reload persists nothing, so the alert must NOT claim a save.
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/1 worker did not converge/)).toBeInTheDocument();
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    expect(within(alert).getByText('serve-b')).toBeInTheDocument();
  });

  it('shows an empty state when no servers are mounted', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue({ bound: {}, failed: [] }),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpServersSection />, { client });

    expect(await screen.findByText('No MCP servers are bound')).toBeInTheDocument();
  });

  it('surfaces a status fetch failure as a loud error', async () => {
    const client = {
      getMcpStatus: vi.fn().mockRejectedValue(new Error('status boom')),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpServersSection />, { client });

    expect(await screen.findByText('status boom')).toBeInTheDocument();
  });

  it('surfaces a config-schema fetch failure as a loud error', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockRejectedValue(new Error('schema boom')),
    };
    renderWithProviders(<McpServersSection />, { client });

    expect(await screen.findByText('schema boom')).toBeInTheDocument();
  });
});
