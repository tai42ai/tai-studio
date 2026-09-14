import { act, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  SECRET_SCHEMA,
  renderWithProviders,
  reload,
  status,
  withEnvBlank,
  withEnvMarker,
} from './test-utils-mcp-servers';
import { McpServersSection } from './mcp-servers';

// -- SecretRefField / combined env+manifest op ----------------------------
describe('McpServersSection — secret env op', () => {
  it('mounts SecretRefField for an env-map entry, showing the reference masked (not plaintext)', async () => {
    const client = {
      getMcpStatus: vi.fn().mockResolvedValue(status()),
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvMarker),
      getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
      listExtensions: vi.fn().mockResolvedValue([]),
      getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: ['SECRET_1'] }),
    };
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client, queryClient });

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

    // The env moved AND both manifest views moved — all three are re-read. The preserved
    // read is the paste's CONFIRMATION, so it is fetched (and raises on refusal) rather
    // than invalidated; the other two are cache refreshes.
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['env-config'] });
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
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client });

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
    renderWithProviders(<McpServersSection />, { client, queryClient });

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
    renderWithProviders(<McpServersSection />, { client });

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
});
