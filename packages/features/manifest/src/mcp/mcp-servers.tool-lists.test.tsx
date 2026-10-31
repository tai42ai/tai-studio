/**
 * The include/exclude tool lists of each MCP server entry: their pickers follow the
 * status read, and the names they list are checked against the server's advertised
 * tools in both the form and the raw JSON view.
 */
import { ApiError } from '@tai42/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { McpServersSection } from './mcp-servers';
import {
  advertisedTools,
  MANIFEST,
  MANIFEST_CONFIGURED,
  MCP_SCHEMA,
  renderWithProviders,
} from './test-utils-mcp-servers';

describe('McpServersSection — the include/exclude tool pickers follow the status read', () => {
  const editorClient = (getMcpStatus: () => Promise<never>) => ({
    getMcpStatus,
    getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
    getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
    listExtensions: vi.fn().mockResolvedValue([]),
  });

  it('reads "Loading tools…" in a disabled picker while the status read is in flight', async () => {
    const pending = new Promise<never>(() => undefined);
    renderWithProviders(<McpServersSection />, {
      client: editorClient(vi.fn(() => pending)),
    });

    await screen.findByTestId('mcp-entry-0');
    const picker = screen.getByRole('combobox', { name: 'Included tools: choose a tool' });
    expect(picker).toHaveTextContent('Loading tools…');
    expect(picker).toBeDisabled();
    expect(screen.queryByText(/This server advertises no tools/)).toBeNull();
  });

  it('states the failed status read in place of each picker, not the empty line', async () => {
    renderWithProviders(<McpServersSection />, {
      client: editorClient(vi.fn(() => Promise.reject(new ApiError('status down', 500)))),
    });

    await screen.findByTestId('mcp-entry-0');
    const notes = await screen.findAllByText(
      "This server's tools could not be read: status down. Existing entries above stay editable.",
    );
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) expect(note).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('combobox', { name: /choose a tool/ })).toBeNull();
    expect(screen.queryByText(/This server advertises no tools/)).toBeNull();
  });
});

describe('McpServersSection — the include/exclude lists are checked against the advertised tools', () => {
  const manifestWith = (entry: Record<string, unknown>) => ({ ...MANIFEST, mcp: [entry] });
  const editorClient = (
    entry: Record<string, unknown>,
    tools: readonly { readonly name: string; readonly description?: string }[],
  ) => ({
    // The status binds only the included tool; the server advertises more.
    getMcpStatus: vi.fn().mockResolvedValue({ bound: { srv: ['a'] }, failed: [] }),
    getManifestPreserved: vi.fn().mockResolvedValue(manifestWith(entry)),
    getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
    listExtensions: vi.fn().mockResolvedValue([]),
    listMcpAdvertisedTools: vi.fn((title: string) =>
      Promise.resolve(advertisedTools(title, tools)),
    ),
  });

  it('flags an included name the server does not advertise and warns that it binds nothing', async () => {
    renderWithProviders(<McpServersSection />, {
      client: editorClient({ title: 'srv', include: ['a', 'ghost:chain'] }, [
        { name: 'a' },
        { name: 'b' },
      ]),
    });

    const warning = await screen.findByText(/This server does not advertise ghost:chain/);
    expect(warning).toHaveAttribute('role', 'alert');
    expect(warning).toHaveTextContent(
      'This server does not advertise ghost:chain. Saving keeps it, but it binds no tool from this server.',
    );
    expect(screen.getByText('ghost:chain (not advertised)')).toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
  });

  it('flags an excluded name the server does not advertise and warns that it hides nothing', async () => {
    renderWithProviders(<McpServersSection />, {
      client: editorClient({ title: 'srv', exclude: ['b', 'gone', 'lost'] }, [
        { name: 'a' },
        { name: 'b' },
      ]),
    });

    const warning = await screen.findByText(/This server does not advertise gone, lost/);
    expect(warning).toHaveAttribute('role', 'alert');
    expect(warning).toHaveTextContent(
      'This server does not advertise gone, lost. Saving keeps them, but they hide nothing.',
    );
    expect(screen.getByText('gone (not advertised)')).toBeInTheDocument();
  });

  it('checks the names the raw JSON view lists, reusing each server read', async () => {
    const user = userEvent.setup();
    const client = editorClient({ title: 'srv', include: ['a'] }, [{ name: 'a' }, { name: 'b' }]);
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await waitFor(() => {
      expect(client.listMcpAdvertisedTools).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const textarea = await screen.findByRole('textbox', { name: 'MCP config' });
    fireEvent.change(textarea, { target: { value: '[{"title":"srv","include":["a","gh"]}]' } });
    fireEvent.change(textarea, {
      target: {
        value:
          '[{"title":"srv","include":["a","ghost"],"exclude":["gone","b"]},{"title":"fresh","include":["x"]}]',
      },
    });

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      'The server “srv” does not advertise ghost in its include list. Saving keeps it, but it binds no tool from this server.',
      'The server “srv” does not advertise gone in its exclude list. Saving keeps it, but it hides nothing.',
    ]);
    // One read per server across both views and every keystroke; a server the status
    // does not carry is not read.
    expect(client.listMcpAdvertisedTools).toHaveBeenCalledTimes(1);
    expect(client.listMcpAdvertisedTools).toHaveBeenCalledWith('srv', expect.anything());
  });

  it("states a failed server read in the raw JSON view in place of that server's check", async () => {
    const user = userEvent.setup();
    const client = {
      ...editorClient({ title: 'srv', include: ['a'] }, []),
      listMcpAdvertisedTools: vi.fn().mockRejectedValue(new Error('session refused')),
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const failure = await screen.findByText(
      'The tools of the server “srv” could not be read: session refused. Its listed names are not checked.',
    );
    const alert = failure.closest('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(within(alert as HTMLElement).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('offers every advertised tool to include, found by its description too', async () => {
    const user = userEvent.setup();
    renderWithProviders(<McpServersSection />, {
      client: editorClient({ title: 'srv', include: ['a'] }, [
        { name: 'a' },
        { name: 'b', description: 'Sends a ping' },
      ]),
    });

    await screen.findByTestId('mcp-entry-0');
    await user.click(
      await screen.findByRole('combobox', { name: 'Included tools: choose a tool' }),
    );
    await user.keyboard('ping');
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['bSends a ping']);
  });

  it('says a server the status does not carry is not mounted yet, keeping its list editable', async () => {
    const client = editorClient({ title: 'fresh', exclude: ['x'] }, []);
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    expect(
      await screen.findAllByText(
        'This server is not mounted yet, so its tools cannot be listed. Save it to pick from its tools. Existing entries above stay editable.',
      ),
    ).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove x' })).toBeInTheDocument();
    expect(client.listMcpAdvertisedTools).not.toHaveBeenCalled();
  });

  it('says a server whose start is still in progress is starting, without reading its tools', async () => {
    const user = userEvent.setup();
    const client = {
      ...editorClient({ title: 'slow', exclude: ['x'] }, []),
      getMcpStatus: vi.fn().mockResolvedValue({
        bound: {},
        failed: [
          {
            title: 'slow',
            status: 'unavailable',
            category: 'starting',
            message: 'MCP server slow start still in progress after 10s',
            http_status: null,
          },
        ],
      }),
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    expect(
      await screen.findAllByText(
        'This server is still starting, so its tools cannot be listed yet. Existing entries above stay editable.',
      ),
    ).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove x' })).toBeInTheDocument();
    // The raw JSON view names the start in that server's check, and states no read failure.
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(
      await screen.findByText(
        'The server “slow” is still starting, so its tools cannot be listed yet. Its listed names are not checked.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(client.listMcpAdvertisedTools).not.toHaveBeenCalled();
  });

  it('says a server whose tools read is refused because it is still starting is starting, with no read failure', async () => {
    const user = userEvent.setup();
    const client = {
      ...editorClient({ title: 'srv', exclude: ['x'] }, []),
      listMcpAdvertisedTools: vi
        .fn()
        .mockRejectedValue(
          new ApiError(
            "mcp server 'srv' did not list its tools: MCP server 'srv' start still in progress after 10s",
            503,
            'mcp-server-starting',
          ),
        ),
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    expect(
      await screen.findAllByText(
        'This server is still starting, so its tools cannot be listed yet. Existing entries above stay editable.',
      ),
    ).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove x' })).toBeInTheDocument();
    expect(screen.queryByText(/could not be read/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(
      await screen.findByText(
        'The server “srv” is still starting, so its tools cannot be listed yet. Its listed names are not checked.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/could not be read/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(client.listMcpAdvertisedTools).toHaveBeenCalledWith('srv', expect.anything());
  });
});
