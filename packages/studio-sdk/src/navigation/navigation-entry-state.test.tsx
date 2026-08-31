import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavigationProvider, useNavigationGuard, usePluginEntryNavigation } from './context';
import type {
  NavigationContextValue,
  NavigationGuardHandler,
  PluginNavigateOptions,
  PluginSearch,
  RouteSearch,
  RouteToken,
} from './types';

/** A host value that INCLUDES the per-entry state channel (a current host). */
function makeNavWithChannel(): NavigationContextValue {
  return {
    navigate: vi.fn(),
    resolvePath: vi.fn(<T extends RouteToken>(token: T, search?: RouteSearch<T>) => {
      const qs = search ? new URLSearchParams(search as Record<string, string>).toString() : '';
      return `/${token}${qs ? `?${qs}` : ''}`;
    }),
    navigatePlugin: vi.fn(),
    resolvePluginPath: vi.fn(
      (pluginId: string, pagePath: string, params?: string, search?: PluginSearch) => {
        const remainder = params !== undefined && params !== '' ? `/${params}` : '';
        const qs = search ? new URLSearchParams(search as Record<string, string>).toString() : '';
        return `/plugins/${pluginId}/${pagePath}${remainder}${qs ? `?${qs}` : ''}`;
      },
    ),
    navigatePluginWithOptions: vi.fn(),
    updatePluginEntryState: vi.fn(),
  };
}

/** A host value that PREDATES the channel (no new members). */
function makeNavNoChannel(): NavigationContextValue {
  return {
    navigate: vi.fn(),
    resolvePath: vi.fn(() => '/'),
    navigatePlugin: vi.fn(),
    resolvePluginPath: vi.fn(() => '/plugins/x/y'),
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

/** Arms a guard and exposes both entry-state members via buttons. */
function EntryStatePage({
  when,
  handler,
  navOptions,
  updateState,
}: {
  when: boolean;
  handler: NavigationGuardHandler;
  navOptions?: PluginNavigateOptions;
  updateState?: unknown;
}) {
  useNavigationGuard(when, handler);
  const { navigatePluginWithOptions, updatePluginEntryState } = usePluginEntryNavigation();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          navigatePluginWithOptions('flows', 'index', 'myflow', undefined, navOptions);
        }}
      >
        nav-with-options
      </button>
      <button
        type="button"
        onClick={() => {
          updatePluginEntryState('flows', updateState);
        }}
      >
        update-state
      </button>
    </>
  );
}

describe('usePluginEntryNavigation — old-host guard', () => {
  it('throws a loud, descriptive error when the host predates the channel', () => {
    function Bare() {
      usePluginEntryNavigation();
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <NavigationProvider value={makeNavNoChannel()}>
          <Bare />
        </NavigationProvider>,
      ),
    ).toThrow(/per-history-entry state channel/);
    spy.mockRestore();
  });

  it('returns both members on a host that provides the channel', async () => {
    const nav = makeNavWithChannel();
    render(
      <NavigationProvider value={nav}>
        <EntryStatePage
          when={false}
          handler={vi.fn<NavigationGuardHandler>().mockResolvedValue(true)}
          navOptions={{ state: { sel: 3 } }}
        />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'nav-with-options' }));
    expect(nav.navigatePluginWithOptions).toHaveBeenCalledWith(
      'flows',
      'index',
      'myflow',
      undefined,
      { state: { sel: 3 } },
    );
    await userEvent.click(screen.getByRole('button', { name: 'update-state' }));
    expect(nav.updatePluginEntryState).toHaveBeenCalledWith('flows', undefined);
  });
});

describe('navigatePluginWithOptions — guard gate', () => {
  it('navigates synchronously when no guard is armed', async () => {
    const nav = makeNavWithChannel();
    render(
      <NavigationProvider value={nav}>
        <EntryStatePage
          when={false}
          handler={vi.fn<NavigationGuardHandler>().mockResolvedValue(true)}
          navOptions={{ state: { sel: 1 } }}
        />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'nav-with-options' }));
    expect(nav.navigatePluginWithOptions).toHaveBeenCalledTimes(1);
  });

  it('a veto writes NOTHING — the host member is never called (no entry, no state)', async () => {
    const nav = makeNavWithChannel();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(false);
    render(
      <NavigationProvider value={nav}>
        <EntryStatePage when handler={handler} navOptions={{ state: { sel: 1 } }} />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'nav-with-options' }));
    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
    await flushMicrotasks();
    expect(nav.navigatePluginWithOptions).not.toHaveBeenCalled();
  });

  it('proceeds and writes the state slot once the guard allows', async () => {
    const nav = makeNavWithChannel();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    render(
      <NavigationProvider value={nav}>
        <EntryStatePage when handler={handler} navOptions={{ state: { sel: 1 } }} />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'nav-with-options' }));
    await waitFor(() => {
      expect(nav.navigatePluginWithOptions).toHaveBeenCalledTimes(1);
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('committedRef fix — a vetoed Back restores the just-written entry state', () => {
  it('reconstructs the plugin state bag after an approved navigatePluginWithOptions', async () => {
    const nav = makeNavWithChannel();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    render(
      <NavigationProvider value={nav}>
        <EntryStatePage when handler={handler} navOptions={{ state: { sel: 7 } }} />
      </NavigationProvider>,
    );
    // Approve the state-carrying navigation: committedRef advances to the reconstructed bag.
    await userEvent.click(screen.getByRole('button', { name: 'nav-with-options' }));
    await waitFor(() => {
      expect(nav.navigatePluginWithOptions).toHaveBeenCalledTimes(1);
    });
    const targetHref = nav.resolvePluginPath('flows', 'index', 'myflow', undefined);

    // A subsequent Back is canceled by restoring the NEW entry WITH its plugin state,
    // not null — so the state this navigation just wrote is not clobbered off the entry.
    const pushSpy = vi.spyOn(window.history, 'pushState');
    vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    window.dispatchEvent(new Event('popstate'));
    expect(pushSpy).toHaveBeenCalledWith(
      { studioPluginEntryState: { flows: { sel: 7 } } },
      '',
      targetHref,
    );
  });

  it('records null (no worse than today) when the navigation carries no state', async () => {
    const nav = makeNavWithChannel();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    render(
      <NavigationProvider value={nav}>
        <EntryStatePage when handler={handler} navOptions={{ replace: true }} />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'nav-with-options' }));
    await waitFor(() => {
      expect(nav.navigatePluginWithOptions).toHaveBeenCalledTimes(1);
    });
    const targetHref = nav.resolvePluginPath('flows', 'index', 'myflow', undefined);
    const pushSpy = vi.spyOn(window.history, 'pushState');
    vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    window.dispatchEvent(new Event('popstate'));
    expect(pushSpy).toHaveBeenCalledWith(null, '', targetHref);
  });
});

describe('updatePluginEntryState — guard-free, merges + refreshes committedRef', () => {
  it('calls the host member without consulting the guard', async () => {
    const nav = makeNavWithChannel();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(false);
    render(
      <NavigationProvider value={nav}>
        <EntryStatePage when handler={handler} updateState={{ sel: 9 }} />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'update-state' }));
    // No guard run: the update is not a navigation away, so it commits immediately.
    expect(nav.updatePluginEntryState).toHaveBeenCalledWith('flows', { sel: 9 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('merges the slot into the committed entry (preserving other plugins + router keys)', async () => {
    const nav = makeNavWithChannel();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(false);
    // Seed a real history.state carrying ANOTHER plugin's slot plus a router-owned key,
    // captured by committedRef when the guard arms.
    window.history.replaceState(
      { studioPluginEntryState: { other: { x: 1 } }, __TSR_key: 'k1' },
      '',
      '/a',
    );
    const committedHref = window.location.href;
    render(
      <NavigationProvider value={nav}>
        <EntryStatePage when handler={handler} updateState={{ sel: 9 }} />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'update-state' }));
    expect(nav.updatePluginEntryState).toHaveBeenCalledTimes(1);

    // A subsequent Back restores the MERGED bag: this plugin's new slot, the other
    // plugin's slot, and the router's own key all preserved.
    const pushSpy = vi.spyOn(window.history, 'pushState');
    vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    window.dispatchEvent(new Event('popstate'));
    expect(pushSpy).toHaveBeenCalledWith(
      { studioPluginEntryState: { other: { x: 1 }, flows: { sel: 9 } }, __TSR_key: 'k1' },
      '',
      committedHref,
    );
  });
});
