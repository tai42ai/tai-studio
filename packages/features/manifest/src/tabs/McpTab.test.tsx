import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
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
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
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
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpTab />, { client });

    expect(await screen.findByText('No MCP servers are mounted')).toBeInTheDocument();
  });

  it('surfaces a status fetch failure as a loud error', async () => {
    const client = {
      getMcpStatus: vi.fn().mockRejectedValue(new Error('status boom')),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpTab />, { client });

    expect(await screen.findByText('status boom')).toBeInTheDocument();
  });

  it('surfaces a config-schema fetch failure as a loud error', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockRejectedValue(new Error('schema boom')),
    };
    renderWithProviders(<McpTab />, { client });

    expect(await screen.findByText('schema boom')).toBeInTheDocument();
  });

  it('renders a schema-driven form per entry from the fetched schema', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
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
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
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
    const getManifestPreserved = vi
      .fn()
      .mockResolvedValueOnce(MANIFEST_CONFIGURED)
      .mockResolvedValue({
        mcp: [{ title: 'srv renamed', config: { command: 'run' } }],
        user_tools: ['echo'],
      });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved,
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
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
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
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
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
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
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
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
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
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
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
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

  it('renders a connector-managed entry read-only with its provenance', async () => {
    const managedManifest = {
      mcp: [
        {
          title: 'github',
          config: {},
          include: ['create_issue'],
          managed: { connection_id: 'c-1', provider_id: 'github', sub_service: 'issues' },
        },
      ],
      user_tools: ['echo'],
    };
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(managedManifest),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpTab />, { client });

    // The provenance is surfaced and removal is disabled — the connection owns it.
    expect(
      await screen.findByText(/Managed by connection c-1 \(provider github, issues\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Disconnect to remove/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove server 1' })).toBeDisabled();
    // No schema-driven editor is rendered for a managed entry (it is read-only)…
    expect(screen.queryByTestId('mcp-entry-0')).toBeNull();
    // …but its bound tool is shown.
    expect(screen.getByText('create_issue')).toBeInTheDocument();
  });

  it('composes a discovered tool with an extension into the include list', async () => {
    const user = userEvent.setup();
    const setMcpConfig = vi.fn().mockResolvedValue({
      status: 'ok',
      env_keys: 0,
      fanout: { mode: 'local-only', note: 'lone worker' },
    });
    const client = {
      // The status query binds `srv` with tools a, b — the discovered set the picker draws from.
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([{ name: 'chain', kind: 'wrapper' }]),
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');

    // Pick a discovered tool, stack an extension onto it, and add the composed token.
    await user.click(screen.getByRole('combobox', { name: 'Included tools: choose a tool' }));
    await user.click(await screen.findByRole('option', { name: 'a' }));
    await user.click(screen.getByRole('checkbox', { name: 'chain' }));
    await user.click(screen.getByRole('button', { name: 'Add to included tools' }));

    // The composed `tool:ext` token lands as a removable chip.
    expect(screen.getByText('a:chain')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save config/ }));
    await waitFor(() => {
      expect(setMcpConfig).toHaveBeenCalledWith([
        { title: 'srv', config: { command: 'run' }, include: ['a:chain'] },
      ]);
    });
  });

  it('keeps the draft and surfaces a conflict when the server config moves under unsaved edits', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpTab />, { client, queryClient });

    const entry = await screen.findByTestId('mcp-entry-0');
    await user.type(within(entry).getByLabelText('Title'), ' draft');

    // A background cache update lands a DIFFERENT server config under the unsaved edit.
    // The editor seeds from the PRESERVED manifest, so the move arrives on that key.
    act(() => {
      queryClient.setQueryData(['manifest', 'preserved'], {
        mcp: [{ title: 'srv', config: { command: 'server-changed' } }],
        user_tools: ['echo'],
      });
    });

    // The draft is preserved (not silently clobbered) and the conflict is surfaced loudly.
    expect(
      await screen.findByText(/changed on the server while you had unsaved edits/),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('mcp-entry-0')).getByLabelText('Title')).toHaveValue(
      'srv draft',
    );

    // Choosing to load the server version replaces the draft with the server's config.
    await user.click(screen.getByRole('button', { name: /load the server version/ }));
    expect(within(screen.getByTestId('mcp-entry-0')).getByLabelText('Command')).toHaveValue(
      'server-changed',
    );
  });

  it('seeds both the form and the raw JSON view from the PRESERVED manifest (markers intact)', async () => {
    const user = userEvent.setup();
    const preserved = {
      mcp: [{ title: 'srv', config: { command: '!ENV ${API_KEY}' } }],
      user_tools: ['echo'],
    };
    const getManifest = vi.fn().mockResolvedValue(MANIFEST_CONFIGURED);
    const getManifestPreserved = vi.fn().mockResolvedValue(preserved);
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifest,
      getManifestPreserved,
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpTab />, { client });

    // The FORM view is seeded from the preserved read: the `!ENV` reference is
    // intact, not a resolved plaintext secret.
    const entry = await screen.findByTestId('mcp-entry-0');
    expect(within(entry).getByLabelText('Command')).toHaveValue('!ENV ${API_KEY}');
    expect(getManifestPreserved).toHaveBeenCalled();
    // The editor never reads the RESOLVED manifest — that surface is ManifestTab's.
    expect(getManifest).not.toHaveBeenCalled();

    // The RAW view round-trips the same preserved buffer, markers and all.
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const textarea = await screen.findByRole('textbox', { name: 'MCP config' });
    expect((textarea as HTMLTextAreaElement).value).toContain('!ENV ${API_KEY}');
  });

  it('invalidates BOTH the preserved and the resolved manifest keys on save', async () => {
    const user = userEvent.setup();
    const setMcpConfig = vi.fn().mockResolvedValue({
      status: 'ok',
      env_keys: 0,
      fanout: { mode: 'local-only', note: 'lone worker' },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client, queryClient });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    await waitFor(() => {
      expect(setMcpConfig).toHaveBeenCalled();
    });
    // A save moves both manifest views; neither may be left stale.
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['manifest', 'preserved'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['manifest'] });
    });
  });

  // -- SecretRefField / combined env+manifest op ----------------------------

  /** An MCP-entry schema carrying a secret-bearing `env` map (a string→string
   *  record) alongside the transport `title`. */
  const SECRET_SCHEMA = {
    type: 'object',
    title: 'TaiMCPConfig',
    required: ['title'],
    properties: {
      title: { type: 'string', title: 'Title' },
      env: { type: 'object', title: 'Env', additionalProperties: { type: 'string' } },
    },
  } as const;

  const withEnvBlank = {
    mcp: [{ title: 'srv', env: { API_KEY: '' } }],
    user_tools: ['echo'],
  };
  const withEnvMarker = {
    mcp: [{ title: 'srv', env: { API_KEY: '!ENV ${SECRET_1}' } }],
    user_tools: ['echo'],
  };

  function reload(env_keys: number) {
    return { status: 'ok', env_keys, fanout: { mode: 'local-only', note: 'lone worker' } };
  }

  it('mounts SecretRefField for an env-map entry, showing the reference masked (not plaintext)', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvMarker),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: ['SECRET_1'] }),
    };
    renderWithProviders(<McpTab />, { client });

    // The env entry renders through the renderer's SecretRefField, not the built-in
    // record value input: a masked reference chip with a change affordance, and the
    // key name is not shown until revealed.
    expect(await screen.findByTestId('mcp-secret-0-API_KEY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change reference' })).toBeInTheDocument();
    expect(screen.queryByText('SECRET_1')).toBeNull();
  });

  it('runs the combined op on a pasted secret (env-then-marker, pointer head mcp) and never leaks the plaintext', async () => {
    const user = userEvent.setup();
    const PLAINTEXT = 'supersecret-PLAINTEXT';
    const setMcpSecretEnv = vi.fn().mockResolvedValue(reload(1));
    const setMcpConfig = vi.fn().mockResolvedValue(reload(1));
    const getManifestPreserved = vi
      .fn()
      .mockResolvedValueOnce(withEnvBlank)
      .mockResolvedValue(withEnvMarker);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved,
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: [] }),
      setMcpSecretEnv,
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client, queryClient });

    await screen.findByTestId('mcp-entry-0');
    const secretInput = screen.getByLabelText('API_KEY');
    expect(secretInput).toHaveAttribute('type', 'password');
    await user.type(secretInput, PLAINTEXT);
    await user.click(screen.getByRole('button', { name: 'Use secret' }));

    // The combined op fires with the pasted value, a key hint, and a manifest
    // pointer whose HEAD segment is `mcp` (the marker target). No whole-manifest
    // save rides a paste — the server writes env FIRST then the marker.
    await waitFor(() => {
      expect(setMcpSecretEnv).toHaveBeenCalledTimes(1);
    });
    // The pasted value, a key hint, and a manifest pointer whose HEAD segment is
    // `mcp` (`mcp/0/env/API_KEY`) — the leaf the server writes the `!ENV` marker to.
    expect(setMcpSecretEnv).toHaveBeenCalledWith({
      value: PLAINTEXT,
      key_hint: 'API_KEY',
      manifest_pointer: 'mcp/0/env/API_KEY',
    });
    expect(setMcpConfig).not.toHaveBeenCalled();

    // The env moved AND both manifest views moved — all three are re-read.
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['env-config'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['manifest', 'preserved'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['manifest'] });
    });
    // The preserved re-read brings the server-written marker back into the form.
    await waitFor(() => {
      expect(getManifestPreserved.mock.calls.length).toBeGreaterThan(1);
    });
    expect(await screen.findByRole('button', { name: 'Change reference' })).toBeInTheDocument();

    // The pasted plaintext never lived in the rendered DOM.
    expect(document.body.innerHTML).not.toContain(PLAINTEXT);
    expect(screen.queryByDisplayValue(PLAINTEXT)).toBeNull();
  });

  it('writes only the marker (no env write) when an existing key is picked', async () => {
    const user = userEvent.setup();
    const setMcpSecretEnv = vi.fn().mockResolvedValue(reload(1));
    const setMcpConfig = vi.fn().mockResolvedValue(reload(1));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvBlank),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: ['SHARED_KEY'] }),
      setMcpSecretEnv,
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: 'Reference existing key' }));
    await user.click(screen.getByRole('combobox', { name: 'API_KEY' }));
    await user.click(await screen.findByRole('option', { name: 'SHARED_KEY' }));

    // A picked key is a manifest-only reference: no combined op / env write fires.
    expect(setMcpSecretEnv).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Save config/ }));
    await waitFor(() => {
      expect(setMcpConfig).toHaveBeenCalledWith([
        { title: 'srv', env: { API_KEY: '!ENV ${SHARED_KEY}' } },
      ]);
    });
    expect(setMcpSecretEnv).not.toHaveBeenCalled();
  });

  it('never sweeps a picked pre-existing shared key when its !ENV entry is removed', async () => {
    const user = userEvent.setup();
    const setMcpConfig = vi.fn().mockResolvedValue(reload(0));
    const setEnvConfig = vi.fn().mockResolvedValue(reload(0));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      // The `!ENV ${SHARED_KEY}` reference points at a key that was ALREADY in
      // `secret_keys` when the editor loaded — a pre-existing/shared key.
      getManifestPreserved: vi.fn().mockResolvedValue({
        mcp: [{ title: 'srv', env: { API_KEY: '!ENV ${SHARED_KEY}' } }],
        user_tools: [],
      }),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: ['SHARED_KEY'] }),
      setMcpConfig,
      setEnvConfig,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');
    // Drop the env entry that references the shared key, then save.
    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    await waitFor(() => {
      expect(setMcpConfig).toHaveBeenCalledWith([{ title: 'srv', env: {} }]);
    });
    // The shared, pre-existing key is NEVER blank-deleted — at worst a harmless orphan.
    expect(setEnvConfig).not.toHaveBeenCalled();
  });

  it('never sweeps a key that entered secret_keys without a paste by this editor', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const setMcpConfig = vi.fn().mockResolvedValue(reload(0));
    const setEnvConfig = vi.fn().mockResolvedValue(reload(0));
    // CONCURRENT_KEY is referenced by the manifest this editor loaded but was never
    // pasted here — another admin created it. It is ABSENT from the initial env read and
    // surfaces only in a later read (a background refetch), exactly the shape a load-time
    // snapshot heuristic would mistake for a session-generated key and blank-delete.
    const getEnvConfig = vi.fn().mockResolvedValue({ env: {}, secret_keys: [] });
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue({
        mcp: [{ title: 'srv', env: { API_KEY: '!ENV ${CONCURRENT_KEY}' } }],
        user_tools: [],
      }),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig,
      setMcpConfig,
      setEnvConfig,
    };
    renderWithProviders(<McpTab />, { client, queryClient });

    await screen.findByTestId('mcp-entry-0');

    // A background cache update surfaces the concurrently-created key in secret_keys —
    // AFTER this editor's initial load saw an empty set.
    act(() => {
      queryClient.setQueryData(['env-config'], { env: {}, secret_keys: ['CONCURRENT_KEY'] });
    });

    // Drop the env entry that references it, then save.
    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    await waitFor(() => {
      expect(setMcpConfig).toHaveBeenCalledWith([{ title: 'srv', env: {} }]);
    });
    // The key was never generated by THIS editor's paste, so it is NEVER blank-deleted —
    // no false-positive sweep of another session's shared secret.
    expect(setEnvConfig).not.toHaveBeenCalled();
  });

  it('cleans up a session-generated env key manifest-first when its !ENV entry is removed', async () => {
    const user = userEvent.setup();
    const PLAINTEXT = 'supersecret-PLAINTEXT';
    const order: string[] = [];
    const setMcpSecretEnv = vi.fn().mockResolvedValue(reload(1));
    const setMcpConfig = vi.fn().mockImplementation(() => {
      order.push('mcp-config');
      return Promise.resolve(reload(0));
    });
    const setEnvConfig = vi.fn().mockImplementation(() => {
      order.push('env-delete');
      return Promise.resolve(reload(0));
    });
    // The generated key SECRET_1 is absent from the FIRST env read (the snapshot) and
    // present only after the paste — that is what marks it session-generated.
    const getEnvConfig = vi
      .fn()
      .mockResolvedValueOnce({ env: {}, secret_keys: [] })
      .mockResolvedValue({ env: {}, secret_keys: ['SECRET_1'] });
    const getManifestPreserved = vi
      .fn()
      .mockResolvedValueOnce(withEnvBlank)
      .mockResolvedValue(withEnvMarker);
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved,
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig,
      setMcpSecretEnv,
      setMcpConfig,
      setEnvConfig,
    };
    renderWithProviders(<McpTab />, { client });

    // Paste a fresh secret: the server generates SECRET_1 and writes the marker back.
    await screen.findByTestId('mcp-entry-0');
    await user.type(screen.getByLabelText('API_KEY'), PLAINTEXT);
    await user.click(screen.getByRole('button', { name: 'Use secret' }));
    await screen.findByRole('button', { name: 'Change reference' });

    // Now drop the entry that holds the just-generated `!ENV ${SECRET_1}` reference.
    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    // Manifest first (marker gone), THEN the generated env key deleted via the
    // env editor's blank-value path — never a dangling reference in between.
    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith({ SECRET_1: '' });
    });
    expect(setMcpConfig).toHaveBeenCalledWith([{ title: 'srv', env: {} }]);
    expect(order).toEqual(['mcp-config', 'env-delete']);
  });

  it('surfaces a server refusal of the combined op loudly (dangling-!ENV / X-band validator)', async () => {
    const user = userEvent.setup();
    const setMcpSecretEnv = vi
      .fn()
      .mockRejectedValue(new ApiError('refused: dangling !ENV reference', 400));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvBlank),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: [] }),
      setMcpSecretEnv,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.type(screen.getByLabelText('API_KEY'), 'plaintext');
    await user.click(screen.getByRole('button', { name: 'Use secret' }));

    expect(await screen.findByText('refused: dangling !ENV reference')).toBeInTheDocument();
  });

  it('surfaces a server dangling-!ENV refusal of the manifest save loudly', async () => {
    const user = userEvent.setup();
    const setMcpConfig = vi
      .fn()
      .mockRejectedValue(new ApiError('manifest invalid: dangling !ENV reference to MISSING', 400));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvMarker),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: ['SECRET_1'] }),
      setMcpConfig,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    expect(
      await screen.findByText('manifest invalid: dangling !ENV reference to MISSING'),
    ).toBeInTheDocument();
  });

  it('blocks pasting a new secret while the editor has unsaved edits', async () => {
    const user = userEvent.setup();
    const setMcpSecretEnv = vi.fn().mockResolvedValue(reload(1));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvBlank),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: [] }),
      setMcpSecretEnv,
    };
    renderWithProviders(<McpTab />, { client });

    const entry = await screen.findByTestId('mcp-entry-0');
    // A field edit dirties the editor: the paste target index may no longer match the
    // saved manifest, so pasting a new secret is blocked until the edit is saved.
    await user.type(within(entry).getByLabelText('Title'), '-x');
    await user.type(screen.getByLabelText('API_KEY'), 'plaintext');

    const useSecret = screen.getByRole('button', { name: 'Use secret' });
    expect(useSecret).toBeDisabled();
    expect(screen.getByText('Save changes before adding a secret')).toBeInTheDocument();
    await user.click(useSecret);
    expect(setMcpSecretEnv).not.toHaveBeenCalled();
  });

  it('blocks the paste Use-secret action until the env entry has a key', async () => {
    const user = userEvent.setup();
    const setMcpSecretEnv = vi.fn().mockResolvedValue(reload(1));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      // A blank-key env row: pasting would emit `key_hint: ''` + pointer `mcp/0/env/`.
      getManifestPreserved: vi.fn().mockResolvedValue({
        mcp: [{ title: 'srv', env: { '': '' } }],
        user_tools: [],
      }),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: [] }),
      setMcpSecretEnv,
    };
    renderWithProviders(<McpTab />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.type(screen.getByLabelText('Secret value'), 'plaintext');

    const useSecret = screen.getByRole('button', { name: 'Use secret' });
    expect(useSecret).toBeDisabled();
    expect(screen.getByText('Name this variable before adding a secret')).toBeInTheDocument();
    await user.click(useSecret);
    expect(setMcpSecretEnv).not.toHaveBeenCalled();
  });

  it('soft-degrades to paste-only when getEnvConfig rejects (the editor is not walled)', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvBlank),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockRejectedValue(new Error('env boom')),
    };
    renderWithProviders(<McpTab />, { client });

    // The editor still renders — an envConfig failure is a soft degrade, not a wall.
    const entry = await screen.findByTestId('mcp-entry-0');
    expect(within(entry).getByLabelText('Title')).toHaveValue('srv');
    // SecretRefField falls closed to paste-only: the password input is offered but no
    // key-reference mode toggle (key picking is unavailable).
    expect(screen.getByLabelText('API_KEY')).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('button', { name: 'Reference existing key' })).toBeNull();
  });
});
