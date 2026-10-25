/**
 * The install / update call state machine: idle → pending → done with the receipt, or
 * failed with the error (and the rejection rethrown to the caller); the verb picks
 * the endpoint; `reset` returns to idle; a reply after unmount sets no state; and a
 * store-off refusal is the recorded failure, rendered as the muted note.
 */
import type { ApiClient, MarketplaceInstallResult } from '@tai42/api-client';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiProvider } from '../hooks/useApi';
import { deferred } from '../testing';
import { storeOffNote } from './install-shell';
import { type FakeApiClient, installReceipt, storeOffError } from './test-install-fixtures';
import { useInstallAction } from './use-install-action';

function renderAction(client: FakeApiClient, verb: 'Install' | 'Update' = 'Install') {
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <ApiProvider value={client as unknown as ApiClient}>{children}</ApiProvider>
  );
  return renderHook(() => useInstallAction('acme/relay', verb), { wrapper });
}

describe('useInstallAction', () => {
  it('starts idle', () => {
    const { result } = renderAction({});
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('installs: pending while the call runs, then done with the receipt', async () => {
    const reply = deferred<MarketplaceInstallResult>();
    const installMarketplacePlugin = vi.fn(() => reply.promise);
    const { result } = renderAction({ installMarketplacePlugin });

    let run: Promise<MarketplaceInstallResult> | undefined;
    act(() => {
      run = result.current.run({ env: { A: 'a' }, secret_keys: [] });
    });
    expect(result.current.state).toEqual({ status: 'pending' });
    expect(installMarketplacePlugin).toHaveBeenCalledWith({
      ref: 'acme/relay',
      env: { A: 'a' },
      secret_keys: [],
    });

    const receipt = installReceipt();
    await act(async () => {
      reply.resolve(receipt);
      await expect(run).resolves.toBe(receipt);
    });
    expect(result.current.state).toEqual({ status: 'done', result: receipt });
  });

  it('updates through the update endpoint', async () => {
    const updateMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt());
    const installMarketplacePlugin = vi.fn();
    const { result } = renderAction(
      { installMarketplacePlugin, updateMarketplacePlugin },
      'Update',
    );
    await act(async () => {
      await result.current.run({ route_mounts: {} });
    });
    expect(updateMarketplacePlugin).toHaveBeenCalledWith({ ref: 'acme/relay', route_mounts: {} });
    expect(installMarketplacePlugin).not.toHaveBeenCalled();
  });

  it('records the failure and rethrows it to the caller', async () => {
    const failure = new Error('boom: install');
    const { result } = renderAction({
      installMarketplacePlugin: vi.fn().mockRejectedValue(failure),
    });
    await act(async () => {
      await expect(result.current.run({})).rejects.toBe(failure);
    });
    expect(result.current.state).toEqual({ status: 'failed', error: failure });
  });

  it('resets to idle', async () => {
    const { result } = renderAction({
      installMarketplacePlugin: vi.fn().mockRejectedValue(new Error('boom')),
    });
    await act(async () => {
      await expect(result.current.run({})).rejects.toThrow('boom');
    });
    expect(result.current.state.status).toBe('failed');
    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('sets no state for a reply that lands after unmount, and still resolves the caller', async () => {
    const reply = deferred<MarketplaceInstallResult>();
    const { result, unmount } = renderAction({
      installMarketplacePlugin: vi.fn(() => reply.promise),
    });
    let run: Promise<MarketplaceInstallResult> | undefined;
    act(() => {
      run = result.current.run({});
    });
    unmount();
    const errors = vi.spyOn(console, 'error');
    const receipt = installReceipt();
    reply.resolve(receipt);
    await expect(run).resolves.toBe(receipt);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('records a store-off refusal as the failure, rendered as the muted note', async () => {
    const refusal = storeOffError();
    const { result } = renderAction({
      installMarketplacePlugin: vi.fn().mockRejectedValue(refusal),
    });
    await act(async () => {
      await expect(result.current.run({})).rejects.toBe(refusal);
    });
    expect(result.current.state).toEqual({ status: 'failed', error: refusal });
    render(<>{storeOffNote(refusal)}</>);
    expect(screen.getByTestId('feature-disabled')).toHaveTextContent(
      'No marketplace store is configured on this server.',
    );
  });
});
