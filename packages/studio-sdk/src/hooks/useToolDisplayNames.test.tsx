import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiClient, ToolMetaOverlay, ToolMetaRecord } from '@tai42/api-client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiProvider } from './useApi';
import { AuthProvider, useAuth } from './useAuth';
import {
  ToolDisplayNamesProvider,
  toolDisplayLabel,
  useReloadToolDisplayNames,
  useToolDisplayNames,
} from './useToolDisplayNames';

function row(over: Partial<ToolMetaRecord> = {}): ToolMetaRecord {
  return {
    tool_name: 'alpha',
    display_name: null,
    folder_id: null,
    tags: [],
    badges: [],
    hidden: null,
    ...over,
  };
}

function overlay(meta: ToolMetaRecord[]): ToolMetaOverlay {
  return { folders: [], meta };
}

interface Deferred {
  readonly promise: Promise<ToolMetaOverlay>;
  readonly resolve: (value: ToolMetaOverlay) => void;
  readonly reject: (reason: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (value: ToolMetaOverlay) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ToolMetaOverlay>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeWrapper(listToolMeta: ApiClient['listToolMeta']) {
  const client = { listToolMeta } as unknown as ApiClient;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider value={client}>
        <AuthProvider>
          <ToolDisplayNamesProvider>{children}</ToolDisplayNamesProvider>
        </AuthProvider>
      </ApiProvider>
    );
  };
}

function renderProvider(listToolMeta: ApiClient['listToolMeta']) {
  return renderHook(
    () => ({ auth: useAuth(), names: useToolDisplayNames(), reload: useReloadToolDisplayNames() }),
    { wrapper: makeWrapper(listToolMeta) },
  );
}

describe('useToolDisplayNames (no provider)', () => {
  it('reads an empty map when no ToolDisplayNamesProvider is mounted', () => {
    const { result } = renderHook(() => useToolDisplayNames());
    expect(result.current).toEqual({});
  });

  it('hands back an inert reload when no provider is mounted', () => {
    const { result } = renderHook(() => useReloadToolDisplayNames());
    expect(() => {
      result.current();
    }).not.toThrow();
  });
});

describe('ToolDisplayNamesProvider', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear();
  });
  afterEach(() => {
    globalThis.sessionStorage.clear();
  });

  it('stays empty and does not fetch while unauthenticated', () => {
    const listToolMeta = vi.fn();
    const { result } = renderProvider(listToolMeta);
    expect(result.current.names).toEqual({});
    expect(listToolMeta).not.toHaveBeenCalled();
  });

  it('fetches on the auth flip and builds the display-name map', async () => {
    const d = deferred();
    const listToolMeta = vi.fn(() => d.promise);
    const { result } = renderProvider(listToolMeta);

    act(() => {
      result.current.auth.login('k', false);
    });
    // Empty until the overlay resolves.
    expect(result.current.names).toEqual({});
    expect(listToolMeta).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(
        overlay([
          row({ tool_name: 'alpha', display_name: 'Alpha Tool' }),
          row({ tool_name: 'beta', display_name: 'Beta Tool' }),
        ]),
      );
    });
    await waitFor(() => {
      expect(result.current.names).toEqual({ alpha: 'Alpha Tool', beta: 'Beta Tool' });
    });
  });

  it('drops rows whose display_name is null or empty from the map', async () => {
    const { result } = renderProvider(() =>
      Promise.resolve(
        overlay([
          row({ tool_name: 'alpha', display_name: 'Alpha Tool' }),
          row({ tool_name: 'beta', display_name: null }),
          row({ tool_name: 'gamma', display_name: '' }),
        ]),
      ),
    );
    act(() => {
      result.current.auth.login('k', false);
    });
    await waitFor(() => {
      expect(result.current.names).toEqual({ alpha: 'Alpha Tool' });
    });
  });

  it('re-fetches on reload', async () => {
    const listToolMeta = vi
      .fn<ApiClient['listToolMeta']>()
      .mockResolvedValueOnce(overlay([row({ tool_name: 'alpha', display_name: 'Alpha Tool' })]))
      .mockResolvedValueOnce(overlay([row({ tool_name: 'alpha', display_name: 'Renamed' })]));
    const { result } = renderProvider(listToolMeta);

    act(() => {
      result.current.auth.login('k', false);
    });
    await waitFor(() => {
      expect(result.current.names).toEqual({ alpha: 'Alpha Tool' });
    });

    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.names).toEqual({ alpha: 'Renamed' });
    });
    expect(listToolMeta).toHaveBeenCalledTimes(2);
  });

  it('settles QUIETLY on a fetch error, leaving the map empty', async () => {
    const d = deferred();
    const { result } = renderProvider(() => d.promise);
    act(() => {
      result.current.auth.login('k', false);
    });
    await act(async () => {
      d.reject(new Error('boom'));
    });
    // A failed overlay never labels a tool — every picker falls back to the raw name.
    await waitFor(() => {
      expect(result.current.names).toEqual({});
    });
  });
});

describe('toolDisplayLabel', () => {
  it('renders "Display (raw)" for a mapped, distinct, non-empty display name', () => {
    expect(toolDisplayLabel({ beta: 'Beta Tool' }, 'beta')).toBe('Beta Tool (beta)');
  });

  it('renders the bare raw name for an unmapped tool', () => {
    expect(toolDisplayLabel({ beta: 'Beta Tool' }, 'gamma')).toBe('gamma');
  });

  it('renders the bare raw name for an empty-string display name', () => {
    expect(toolDisplayLabel({ beta: '' }, 'beta')).toBe('beta');
  });

  it('renders the bare raw name when the display name equals the raw name', () => {
    expect(toolDisplayLabel({ beta: 'beta' }, 'beta')).toBe('beta');
  });
});
