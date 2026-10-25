/**
 * The install-preview state machine: idle on a `null` request, loading → ready or
 * failed, the last ready preview kept while a re-preview loads, the in-flight request
 * aborted when the request changes and on unmount, a late reply of an aborted request
 * ignored, `refetch` re-asking the same request, and a store-off refusal surfacing as
 * the failure with its muted note.
 */
import type { ApiClient, MarketplaceInstallPreview } from '@tai42/api-client';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiProvider } from '../hooks/useApi';
import { deferred } from '../testing';
import { storeOffNote } from './install-shell';
import { previewFixture, storeOffError } from './test-install-fixtures';
import { type InstallPreviewRequest, useInstallPreview } from './use-install-preview';

type PreviewCall = ApiClient['previewMarketplaceInstall'];

function wrapperFor(previewMarketplaceInstall: PreviewCall) {
  const client = { previewMarketplaceInstall } as unknown as ApiClient;
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <ApiProvider value={client}>{children}</ApiProvider>;
  };
}

function renderPreview(call: PreviewCall, request: InstallPreviewRequest | null) {
  return renderHook(({ req }) => useInstallPreview(req), {
    wrapper: wrapperFor(call),
    initialProps: { req: request },
  });
}

const BASE: InstallPreviewRequest = { ref: 'acme/relay', version: '1.0.0' };

describe('useInstallPreview', () => {
  it('stays idle and calls nothing on a null request', () => {
    const call = vi.fn();
    const { result } = renderPreview(call, null);
    expect(result.current.state).toEqual({ status: 'loading', previous: null });
    expect(call).not.toHaveBeenCalled();
  });

  it('loads, then lands ready with the preview, sending the request and a signal', async () => {
    const preview = previewFixture();
    const call = vi.fn().mockResolvedValue(preview);
    const { result } = renderPreview(call, {
      ...BASE,
      route_mounts: { web: 'channels/web' },
    });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', preview });
    });
    expect(call).toHaveBeenCalledWith(
      { ref: 'acme/relay', version: '1.0.0', route_mounts: { web: 'channels/web' } },
      expect.any(AbortSignal),
    );
  });

  it('sends no version for a null version and no route_mounts when none are asked', async () => {
    const call = vi.fn().mockResolvedValue(previewFixture());
    renderPreview(call, { ref: 'acme/relay', version: null });
    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        { ref: 'acme/relay', version: undefined },
        expect.any(AbortSignal),
      );
    });
  });

  it('lands failed with the error', async () => {
    const failure = new Error('boom: preview');
    const { result } = renderPreview(vi.fn().mockRejectedValue(failure), BASE);
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'failed', error: failure });
    });
  });

  it('keeps the last ready preview while a changed request loads, and aborts the old one', async () => {
    const first = previewFixture();
    const second = deferred<MarketplaceInstallPreview>();
    const signals: AbortSignal[] = [];
    const call = vi.fn((_body: unknown, signal?: AbortSignal) => {
      if (signal !== undefined) signals.push(signal);
      return signals.length === 1 ? Promise.resolve(first) : second.promise;
    });
    const { result, rerender } = renderPreview(call, BASE);
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    rerender({ req: { ...BASE, route_mounts: { web: 'channels/relay' } } });
    expect(result.current.state).toEqual({ status: 'loading', previous: first });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    const next = previewFixture({ version: '1.0.1' });
    await act(async () => {
      second.resolve(next);
      await second.promise;
    });
    expect(result.current.state).toEqual({ status: 'ready', preview: next });
  });

  it('ignores the late reply of an aborted request', async () => {
    const stale = deferred<MarketplaceInstallPreview>();
    const fresh = previewFixture({ version: '2.0.0' });
    let calls = 0;
    const call = vi.fn(() => {
      calls += 1;
      return calls === 1 ? stale.promise : Promise.resolve(fresh);
    });
    const { result, rerender } = renderPreview(call, BASE);
    rerender({ req: { ...BASE, version: '2.0.0' } });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', preview: fresh });
    });
    await act(async () => {
      stale.resolve(previewFixture({ version: '1.0.0' }));
      await stale.promise;
    });
    expect(result.current.state).toEqual({ status: 'ready', preview: fresh });
  });

  it('does not re-ask an equal request on a re-render', async () => {
    const call = vi.fn().mockResolvedValue(previewFixture());
    const { rerender } = renderPreview(call, BASE);
    await waitFor(() => {
      expect(call).toHaveBeenCalledTimes(1);
    });
    rerender({ req: { ...BASE } });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight request on unmount', () => {
    let seen: AbortSignal | undefined;
    const call = vi.fn((_body: unknown, signal?: AbortSignal) => {
      seen = signal;
      return new Promise<MarketplaceInstallPreview>(() => undefined);
    });
    const { unmount } = renderPreview(call, BASE);
    expect(seen?.aborted).toBe(false);
    unmount();
    expect(seen?.aborted).toBe(true);
  });

  it('re-asks the same request on refetch', async () => {
    const failure = new Error('boom: preview');
    const preview = previewFixture();
    const call = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(preview);
    const { result } = renderPreview(call, BASE);
    await waitFor(() => {
      expect(result.current.state.status).toBe('failed');
    });
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', preview });
    });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('surfaces a store-off refusal as the failure, rendered as the muted note', async () => {
    const refusal = storeOffError();
    const { result } = renderPreview(vi.fn().mockRejectedValue(refusal), BASE);
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'failed', error: refusal });
    });
    render(<>{storeOffNote(refusal)}</>);
    expect(screen.getByTestId('feature-disabled')).toHaveTextContent(
      'No marketplace store is configured on this server.',
    );
  });
});
