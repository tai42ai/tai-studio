import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { __resetContributions, getContributions, loadPlugin } from './registry';
import {
  __resetPluginHostState,
  getPluginHostState,
  setPluginHostState,
  subscribePluginHost,
  usePluginContributions,
  type PluginLoaderState,
} from './host-state';

afterEach(() => {
  __resetPluginHostState();
  __resetContributions();
});

const ready = (overrides: Partial<PluginLoaderState> = {}): PluginLoaderState => ({
  status: 'ready',
  loaded: [],
  errors: {},
  registryError: null,
  ...overrides,
});

const tab = (id: string) => ({ id, title: id, component: () => null });

describe('plugin host-state store', () => {
  it('starts idle and mirrors the pushed state', () => {
    expect(getPluginHostState().status).toBe('idle');

    setPluginHostState({ status: 'loading', loaded: [], errors: {}, registryError: null });
    expect(getPluginHostState().status).toBe('loading');

    setPluginHostState(ready({ loaded: ['acme'] }));
    expect(getPluginHostState()).toEqual(ready({ loaded: ['acme'] }));
  });

  it('notifies subscribers on every transition and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePluginHost(listener);

    setPluginHostState({ status: 'loading', loaded: [], errors: {}, registryError: null });
    setPluginHostState(ready());
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setPluginHostState({ status: 'idle', loaded: [], errors: {}, registryError: null });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('__resetPluginHostState clears the state and the subscribers', () => {
    const listener = vi.fn();
    subscribePluginHost(listener);
    setPluginHostState(ready());
    expect(listener).toHaveBeenCalledTimes(1);

    __resetPluginHostState();
    expect(getPluginHostState().status).toBe('idle');

    // The reset dropped the listener, so a later push does not reach it again.
    setPluginHostState(ready());
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('usePluginContributions', () => {
  it('re-renders when the load pass reaches ready and exposes the committed tabs', async () => {
    // Seed the registry through the real load path before the pass reports ready.
    await loadPlugin('acme', (ctx) => {
      ctx.registerSettingsTab(tab('general'));
    });

    const { result } = renderHook(() => usePluginContributions());

    // Before ready the hook reports the pending status; callers ignore the
    // contributions until then.
    expect(result.current.status).toBe('idle');

    act(() => {
      setPluginHostState(ready({ loaded: ['acme'] }));
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.contributions.settingsTabs.map((t) => t.id)).toEqual(['general']);
    // The hook reads the live registry, which is the shared module singleton.
    expect(result.current.contributions).toEqual(getContributions());
  });
});
