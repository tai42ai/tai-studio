import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test-utils';
import { McpTab } from './McpTab';

/** The MCP-ENTRY schema (`TaiMCPConfig`) as the schema route emits it: an object
 *  with a required `title` string and a required nested `config` object. */
const MCP_SCHEMA = {
  $defs: {
    MCPConfig: {
      type: 'object',
      title: 'MCPConfig',
      properties: {
        command: { type: 'string', title: 'Command' },
      },
      required: ['command'],
    },
  },
  type: 'object',
  title: 'TaiMCPConfig',
  required: ['title', 'config'],
  properties: {
    title: { type: 'string', title: 'Title' },
    config: { $ref: '#/$defs/MCPConfig' },
  },
} as const;

const MANIFEST = { mcp: [{ title: 'srv' }], user_tools: ['echo'] };
const MANIFEST_CONFIGURED = {
  mcp: [{ title: 'srv', config: { command: 'run' } }],
  user_tools: ['echo'],
};

/** A 400 from the save route (`Manifest.model_validate` rejected). Mirrors the
 *  api-client `ApiError` shape without pulling the client into this feature. */
class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function status() {
  return { bound: { srv: ['a', 'b'] }, failed: [{ title: 'bad', status: 'timeout' }] };
}

describe('McpTab', () => {
  it('lists mounted servers with their status', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
    };
    renderWithProviders(<McpTab />, { client });

    expect(await screen.findByText('srv')).toBeInTheDocument();
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    // The hidden Actions header wears the published clip class, not a partial
    // hand-rolled copy of it that stays selectable and readable to a magnifier.
    expect(screen.getByText('Actions')).toHaveClass('tai-visually-hidden');
    expect(screen.getByText('bad')).toBeInTheDocument();
    expect(screen.getByText('2 tools')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();
  });

  it('reloads a server via its per-server button', async () => {
    const user = userEvent.setup();
    const reloadMcp = vi.fn().mockResolvedValue({
      op: 'reload_mcp',
      reachable: true,
      local_only: false,
      results: [
        { origin: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
      ],
      error: null,
    });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      reloadMcp,
    };
    renderWithProviders(<McpTab />, { client });

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
        { origin: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
        { origin: 'serve-b', outcome: 'timed_out', payload: null, error: null, detail: null },
      ],
      error: null,
    });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      reloadMcp,
    };
    renderWithProviders(<McpTab />, { client });

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
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
    };
    renderWithProviders(<McpTab />, { client });

    expect(await screen.findByText('No MCP servers are mounted')).toBeInTheDocument();
  });

  it('surfaces a status fetch failure as a loud error', async () => {
    const client = {
      getMcpStatus: vi.fn().mockRejectedValue(new Error('status boom')),
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
    };
    renderWithProviders(<McpTab />, { client });

    expect(await screen.findByText('status boom')).toBeInTheDocument();
  });

  it('surfaces a config-schema fetch failure as a loud error', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockRejectedValue(new Error('schema boom')),
    };
    renderWithProviders(<McpTab />, { client });

    expect(await screen.findByText('schema boom')).toBeInTheDocument();
  });

  it('renders a schema-driven form per entry from the fetched schema', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
    };
    renderWithProviders(<McpTab />, { client });

    const entry = await screen.findByTestId('mcp-entry-0');
    expect(screen.getByText('Server 1')).toBeInTheDocument();
    expect(within(entry).getByLabelText('Title')).toHaveValue('srv');
    expect(within(entry).getByLabelText('Command')).toHaveValue('run');
  });

  it('round-trips add/edit/remove into the saved mcp array', async () => {
    const user = userEvent.setup();
    const setMcpConfig = vi.fn().mockResolvedValue({
      status: 'ok',
      env_keys: 1,
      fanout: { mode: 'local-only', note: 'lone worker' },
    });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');

    // ADD a second entry (seeded from the schema).
    await user.click(screen.getByRole('button', { name: 'Add server' }));

    // EDIT the new entry's Title.
    const second = await screen.findByTestId('mcp-entry-1');
    await user.type(within(second).getByLabelText('Title'), 'new');

    // REMOVE the first entry.
    await user.click(screen.getByRole('button', { name: 'Remove server 1' }));

    await user.click(screen.getByRole('button', { name: /Save config/ }));

    await waitFor(() => {
      expect(setMcpConfig).toHaveBeenCalledWith([{ title: 'new', config: {} }]);
    });
    expect(await screen.findByText(/Saved \(1 env keys\)/)).toBeInTheDocument();
  });

  it('re-seeds from the save-triggered refetch without detaching the operator', async () => {
    // The refetch that follows a save returns the config the server now holds, so
    // the state the editor is seeded from moves under it. The re-seed has to land
    // WITHOUT tearing the editor down: the operator is standing on Save config, and
    // the "Saved" note is this component's own mutation state.
    const user = userEvent.setup();
    const setMcpConfig = vi.fn().mockResolvedValue({
      status: 'ok',
      env_keys: 2,
      fanout: { mode: 'local-only', note: 'lone worker' },
    });
    const getManifest = vi
      .fn()
      .mockResolvedValueOnce(MANIFEST_CONFIGURED)
      .mockResolvedValue({
        mcp: [{ title: 'srv renamed', config: { command: 'run' } }],
        user_tools: ['echo'],
      });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest,
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client });

    const entry = await screen.findByTestId('mcp-entry-0');
    await user.type(within(entry).getByLabelText('Title'), ' renamed');
    const save = screen.getByRole('button', { name: /Save config/ });
    await user.click(save);

    // The refetch landed and the form carries the server's config.
    await waitFor(() => {
      expect(within(screen.getByTestId('mcp-entry-0')).getByLabelText('Title')).toHaveValue(
        'srv renamed',
      );
    });
    // The save's own note survived the re-seed...
    expect(screen.getByText(/Saved \(2 env keys\)/)).toBeInTheDocument();
    // ...and the keyboard caret is still on Save, not on the body.
    expect(save).toHaveFocus();
  });

  it('warns and confirms before discarding unsaved edits when toggling to JSON', async () => {
    const user = userEvent.setup();
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
    };
    renderWithProviders(<McpTab />, { client });

    const entry = await screen.findByTestId('mcp-entry-0');
    const title = within(entry).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'edited');

    // Toggling with unsaved edits opens the confirm dialog and does NOT switch.
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'MCP config' })).toBeNull();

    // Confirming switches and carries the edit across (serialized to JSON).
    await user.click(screen.getByRole('button', { name: 'Switch view' }));
    const textarea = await screen.findByRole('textbox', { name: 'MCP config' });
    expect((textarea as HTMLTextAreaElement).value).toContain('edited');
  });

  it('rejects invalid config JSON with a loud field error and sends no request', async () => {
    const user = userEvent.setup();
    const setMcpConfig = vi.fn().mockResolvedValue({ status: 'ok', env_keys: 0 });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const textarea = await screen.findByRole('textbox', { name: 'MCP config' });
    fireEvent.change(textarea, { target: { value: 'not json' } });
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(setMcpConfig).not.toHaveBeenCalled();
  });

  it('rejects a non-array config with a loud field error and sends no request', async () => {
    const user = userEvent.setup();
    const setMcpConfig = vi.fn().mockResolvedValue({ status: 'ok', env_keys: 0 });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const textarea = await screen.findByRole('textbox', { name: 'MCP config' });
    fireEvent.change(textarea, { target: { value: '{"not":"an array"}' } });
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    expect(await screen.findByText(/must be a JSON array/)).toBeInTheDocument();
    expect(setMcpConfig).not.toHaveBeenCalled();
  });

  it('saves a valid config array through setMcpConfig from the JSON view', async () => {
    const user = userEvent.setup();
    const setMcpConfig = vi.fn().mockResolvedValue({ status: 'ok', env_keys: 3 });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const textarea = await screen.findByRole('textbox', { name: 'MCP config' });
    fireEvent.change(textarea, { target: { value: '[{"title":"next"}]' } });
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    await waitFor(() => {
      expect(setMcpConfig).toHaveBeenCalledWith([{ title: 'next' }]);
    });
    expect(await screen.findByText(/Saved \(3 env keys\)/)).toBeInTheDocument();
  });

  it('renders a server 400 loudly as escaped text, never an HTML sink', async () => {
    const user = userEvent.setup();
    const evil = 'invalid manifest: <script>alert(1)</script>';
    const setMcpConfig = vi.fn().mockRejectedValue(new ApiError(evil, 400));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      setMcpConfig,
    };
    const { container } = renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    const alert = await screen.findByText(evil);
    expect(alert).toBeInTheDocument();
    // The message rendered as TEXT — no live <script> element was injected.
    expect(container.querySelector('script')).toBeNull();
  });
});
