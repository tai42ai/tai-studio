// Each secret op mounts the full MCP config editor — a schema-driven form that
// re-renders on every keystroke, plus the async paste → confirm-re-read → save/sweep
// chain — so these flows are a heavy render chain that runs slowly under coverage
// instrumentation on a loaded runner. The file gets explicit testTimeout headroom and
// userEvent runs without its inter-key delay, so a loaded runner cannot push a keystroke
// chain past the timeout; correctness stays gated by the real assertions and awaited
// signals below.
import { ApiError } from '@tai42/api-client';
import { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { McpServersSection } from './mcp-servers';
import {
  reload,
  renderWithProviders,
  SECRET_SCHEMA,
  status,
  withEnvBlank,
  withEnvMarker,
} from './test-utils-mcp-servers';

vi.setConfig({ testTimeout: 15_000 });

describe('McpServersSection — secret op lifecycle + blocking', () => {
  it('shuts the Save door while a paste op is in flight, then sweeps the key it generated', async () => {
    const user = userEvent.setup({ delay: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    // The combined op is held open, so the whole in-flight window is observable: the draft
    // still carries the pre-paste leaf and the paste's key is not yet sweep-eligible.
    let commitPaste = (): void => undefined;
    const setMcpSecretEnv = vi.fn().mockImplementation(
      () =>
        new Promise<ReturnType<typeof reload>>((resolve) => {
          commitPaste = () => {
            resolve(reload(1));
          };
        }),
    );
    const setMcpConfig = vi.fn().mockResolvedValue(reload(0));
    const setEnvConfig = vi.fn().mockResolvedValue(reload(0));
    const getManifestPreserved = vi
      .fn()
      .mockResolvedValueOnce(withEnvBlank)
      .mockResolvedValue(withEnvMarker);
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved,
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi
        .fn()
        .mockResolvedValueOnce({ env: {}, secret_keys: [] })
        .mockResolvedValue({ env: {}, secret_keys: ['SECRET_1'] }),
      setMcpSecretEnv,
      setMcpConfig,
      setEnvConfig,
    };
    renderWithProviders(<McpServersSection />, { client, queryClient });

    await screen.findByTestId('mcp-entry-0');
    await user.type(screen.getByLabelText('API_KEY'), 'supersecret-PLAINTEXT');
    await user.click(screen.getByRole('button', { name: 'Use secret' }));
    await waitFor(() => {
      expect(setMcpSecretEnv).toHaveBeenCalledTimes(1);
    });

    // In flight: saving now would write the pre-paste leaf back over the marker the op is
    // writing, so the door is shut.
    expect(screen.getByRole('button', { name: /Save config/ })).toBeDisabled();

    act(() => {
      commitPaste();
    });
    // It reopens only once the op has fully settled — the preserved re-read landed and the
    // generated key was recorded as this session's.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save config/ })).toBeEnabled();
    });
    // The record rides an authoritative re-read of the preserved manifest, taken by the
    // paste itself before any cache refresh.
    expect(getManifestPreserved.mock.calls.length).toBeGreaterThan(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['env-config'] });

    // The key IS this session's, so removing its sole reference sweeps it.
    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    await user.click(screen.getByRole('button', { name: /Save config/ }));
    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith({ SECRET_1: '' });
    });
    // Wait out the save's success state, which lands only once its reload broadcast and the
    // post-save re-reads have settled, so no in-flight cache write is still draining when the
    // test ends.
    await screen.findByText(/Saved \(/, undefined, { timeout: 5000 });
  });

  it('raises when the paste cannot be confirmed, keeping the Save and paste doors shut', async () => {
    const user = userEvent.setup({ delay: null });
    const setMcpSecretEnv = vi.fn().mockResolvedValue(reload(1));
    const setMcpConfig = vi.fn().mockResolvedValue(reload(0));
    const setEnvConfig = vi.fn().mockResolvedValue(reload(0));
    // The op succeeds server-side; every confirmation re-read is refused by the reload
    // gate (`Retry-After: 0` here so the retries run instantly), so the editor never
    // learns which key was generated.
    const getManifestPreserved = vi
      .fn()
      .mockResolvedValueOnce(withEnvBlank)
      .mockRejectedValue(new ApiError('config is reloading', 503, undefined, 0));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved,
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: [] }),
      setMcpSecretEnv,
      setMcpConfig,
      setEnvConfig,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.type(screen.getByLabelText('API_KEY'), 'supersecret-PLAINTEXT');
    await user.click(screen.getByRole('button', { name: 'Use secret' }));

    // The refusal is loud, and the doors stay shut over a draft that still carries the
    // pre-paste leaf: saving it would write that leaf back over the server's marker.
    // Loud on both surfaces the refusal reached: the paste's own error and the section's
    // read banner over the last-good config.
    expect((await screen.findAllByText(/config is reloading/)).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save config/ })).toBeDisabled();
    });
    expect(setMcpConfig).not.toHaveBeenCalled();
  });

  it('confirms the paste past a retriable refusal of the re-read', async () => {
    const user = userEvent.setup({ delay: null });
    const setMcpSecretEnv = vi.fn().mockResolvedValue(reload(1));
    const setMcpConfig = vi.fn().mockResolvedValue(reload(0));
    const setEnvConfig = vi.fn().mockResolvedValue(reload(0));
    // The first confirmation read hits the gate's retriable 503; the retry lands the
    // marker the server wrote.
    const getManifestPreserved = vi
      .fn()
      .mockResolvedValueOnce(withEnvBlank)
      .mockRejectedValueOnce(new ApiError('config is reloading', 503, undefined, 0))
      .mockResolvedValue(withEnvMarker);
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved,
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi
        .fn()
        .mockResolvedValueOnce({ env: {}, secret_keys: [] })
        .mockResolvedValue({ env: {}, secret_keys: ['SECRET_1'] }),
      setMcpSecretEnv,
      setMcpConfig,
      setEnvConfig,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.type(screen.getByLabelText('API_KEY'), 'supersecret-PLAINTEXT');
    await user.click(screen.getByRole('button', { name: 'Use secret' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save config/ })).toBeEnabled();
    });

    // The key was confirmed through the retry, so removing its sole reference sweeps it.
    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    await user.click(screen.getByRole('button', { name: /Save config/ }));
    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith({ SECRET_1: '' });
    });
  });

  it('refuses a second paste while the first is still storing', async () => {
    const user = userEvent.setup({ delay: null });
    let commitPaste = (): void => undefined;
    const setMcpSecretEnv = vi.fn().mockImplementation(
      () =>
        new Promise<ReturnType<typeof reload>>((resolve) => {
          commitPaste = () => {
            resolve(reload(1));
          };
        }),
    );
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi
        .fn()
        .mockResolvedValueOnce(withEnvBlank)
        .mockResolvedValue(withEnvMarker),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: ['SHARED_KEY'] }),
      setMcpSecretEnv,
    };
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.type(screen.getByLabelText('API_KEY'), 'supersecret-PLAINTEXT');
    await user.click(screen.getByRole('button', { name: 'Use secret' }));
    await waitFor(() => {
      expect(setMcpSecretEnv).toHaveBeenCalledTimes(1);
    });

    // A second paste while the first is storing would target a pointer the first op is
    // rewriting and strand its key: the door is shut, with the reason on the field.
    await user.type(screen.getByLabelText('API_KEY'), 'second-PLAINTEXT');
    expect(screen.getByText('Storing the previous secret')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use secret' })).toBeDisabled();

    commitPaste();
    await waitFor(() => {
      expect(setMcpSecretEnv).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the editor (and its paste provenance) alive when a manifest refetch fails', async () => {
    const user = userEvent.setup({ delay: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const setMcpSecretEnv = vi.fn().mockResolvedValue(reload(1));
    const setMcpConfig = vi.fn().mockResolvedValue(reload(0));
    const setEnvConfig = vi.fn().mockResolvedValue(reload(0));
    // The load and the paste's re-read succeed; a LATER background re-read fails the way
    // the reload gate fails one (these queries do not retry).
    const getManifestPreserved = vi
      .fn()
      .mockResolvedValueOnce(withEnvBlank)
      .mockResolvedValueOnce(withEnvMarker)
      .mockRejectedValue(new ApiError('config is reloading', 503, undefined, 0));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved,
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi
        .fn()
        .mockResolvedValueOnce({ env: {}, secret_keys: [] })
        .mockResolvedValue({ env: {}, secret_keys: ['SECRET_1'] }),
      setMcpSecretEnv,
      setMcpConfig,
      setEnvConfig,
    };
    renderWithProviders(<McpServersSection />, { client, queryClient });

    await screen.findByTestId('mcp-entry-0');
    await user.type(screen.getByLabelText('API_KEY'), 'supersecret-PLAINTEXT');
    await user.click(screen.getByRole('button', { name: 'Use secret' }));
    await screen.findByRole('button', { name: 'Change reference' });

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['manifest', 'preserved'] });
    });

    // The failure is loud, but the editor still stands on its last-good read.
    expect(await screen.findByText(/config is reloading/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save config/ })).toBeInTheDocument();

    // The paste's provenance survived with it, so the key it generated is still swept.
    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    await user.click(screen.getByRole('button', { name: /Save config/ }));
    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith({ SECRET_1: '' });
    });
  });

  it('surfaces a server refusal of the combined op loudly (dangling-!ENV / X-band validator)', async () => {
    const user = userEvent.setup({ delay: null });
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
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.type(screen.getByLabelText('API_KEY'), 'plaintext');
    await user.click(screen.getByRole('button', { name: 'Use secret' }));

    expect(await screen.findByText('refused: dangling !ENV reference')).toBeInTheDocument();
  });

  it('surfaces a server dangling-!ENV refusal of the manifest save loudly', async () => {
    const user = userEvent.setup({ delay: null });
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
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    expect(
      await screen.findByText('manifest invalid: dangling !ENV reference to MISSING'),
    ).toBeInTheDocument();
  });

  it('blocks pasting a new secret while the editor has unsaved edits', async () => {
    const user = userEvent.setup({ delay: null });
    const setMcpSecretEnv = vi.fn().mockResolvedValue(reload(1));
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvBlank),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: [] }),
      setMcpSecretEnv,
    };
    renderWithProviders(<McpServersSection />, { client });

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
    const user = userEvent.setup({ delay: null });
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
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client });

    // The editor still renders — an envConfig failure is a soft degrade, not a wall.
    const entry = await screen.findByTestId('mcp-entry-0');
    expect(within(entry).getByLabelText('Title')).toHaveValue('srv');
    // SecretRefField falls closed to paste-only: the password input is offered but no
    // key-reference mode toggle (key picking is unavailable).
    expect(screen.getByLabelText('API_KEY')).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('button', { name: 'Reference existing key' })).toBeNull();
  });
});
