import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@tai42/api-client';
import { StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';

import {
  MANIFEST,
  MANIFEST_CONFIGURED,
  MCP_SCHEMA,
  renderWithProviders,
  status,
} from './test-utils-mcp-servers';
import { McpServersSection } from './mcp-servers';

describe('McpServersSection — config editor', () => {
  it('renders a schema-driven form per entry from the fetched schema', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client });

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

  it('wears the ghost style on an editable entry Remove server, not filled danger', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    // The per-entry Remove in the config editor is a routine list-item control; it stays
    // low-emphasis rather than filled danger.
    const rowRemove = screen.getByRole('button', { name: 'Remove server 1' });
    expect(rowRemove).toHaveClass('tai-btn-ghost');
    expect(rowRemove).not.toHaveClass('tai-btn-danger');
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
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client });

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
    const { container } = renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client });

    // The provenance is surfaced and removal is disabled — the connection owns it.
    expect(
      await screen.findByText(/Managed by connection c-1 \(provider github, issues\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Disconnect to remove/)).toBeInTheDocument();
    const managedRemove = screen.getByRole('button', { name: 'Remove server 1' });
    expect(managedRemove).toBeDisabled();
    // The per-entry Remove is a routine list-item control across every entry-card
    // variant (editable/installed/managed): low-emphasis, never filled danger.
    expect(managedRemove).toHaveClass('tai-btn-ghost');
    expect(managedRemove).not.toHaveClass('tai-btn-danger');
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
    renderWithProviders(<McpServersSection />, { client });

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

  it('labels a discovered-tool option "Display (raw)" from the tool-meta overlay', async () => {
    const user = userEvent.setup();
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(MANIFEST_CONFIGURED),
      getMcpConfigSchema: vi.fn().mockResolvedValue(MCP_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(
      <StaticToolDisplayNamesProvider names={{ a: 'Alpha' }}>
        <McpServersSection />
      </StaticToolDisplayNamesProvider>,
      { client },
    );

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('combobox', { name: 'Included tools: choose a tool' }));
    expect(await screen.findByRole('option', { name: 'Alpha (a)' })).toBeInTheDocument();
    // A discovered tool absent from the overlay keeps its bare raw name.
    expect(screen.getByRole('option', { name: 'b' })).toBeInTheDocument();
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
    renderWithProviders(<McpServersSection />, { client, queryClient });

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
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client, queryClient });

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
});
