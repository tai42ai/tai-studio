import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NavigationProvider,
  useAppNavigate,
  useNavigationGuard,
  usePluginNavigation,
} from './context';
import type {
  NavigationContextValue,
  NavigationGuardHandler,
  PluginSearch,
  RouteSearch,
  RouteToken,
} from './types';

function makeNav(): NavigationContextValue {
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
  };
}

/** A page that arms a guard and exposes a route-token navigation trigger. */
function GuardedPage({ when, handler }: { when: boolean; handler: NavigationGuardHandler }) {
  useNavigationGuard(when, handler);
  const navigate = useAppNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        navigate('settings');
      }}
    >
      leave
    </button>
  );
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  // Tests that drive popstate mutate the shared history entry; reset it so each test
  // starts from a known committed URL and state.
  window.history.replaceState(null, '', '/');
});
describe('useNavigationGuard — browser back/forward (popstate)', () => {
  it('cancels the history move, then replays it once the guard allows', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={handler} />
      </NavigationProvider>,
    );
    window.dispatchEvent(new Event('popstate'));
    // Cancel is synchronous: the committed entry is re-pushed to keep the user in place.
    expect(pushSpy).toHaveBeenCalledWith(null, '', window.location.href);
    // Approved: the single stacked restore is unwound in one go().
    await waitFor(() => {
      expect(goSpy).toHaveBeenCalledWith(-1);
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cancels and stays put when the guard vetoes', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(false);
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={handler} />
      </NavigationProvider>,
    );
    window.dispatchEvent(new Event('popstate'));
    expect(pushSpy).toHaveBeenCalledWith(null, '', window.location.href);
    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
    await flushMicrotasks();
    expect(goSpy).not.toHaveBeenCalled();
  });

  it('replays the committed history.state, not null, on restore', () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(false);
    // Seed a router-owned entry state before the guard arms and captures it.
    window.history.replaceState({ page: 'A' }, '', '/a');
    const committedHref = window.location.href;
    const pushSpy = vi.spyOn(window.history, 'pushState');
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={handler} />
      </NavigationProvider>,
    );
    window.dispatchEvent(new Event('popstate'));
    // The restore replays the captured state verbatim rather than destroying it with null.
    expect(pushSpy).toHaveBeenCalledWith({ page: 'A' }, '', committedHref);
  });

  it('passes the replayed popstate through without consulting the guard again', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={handler} />
      </NavigationProvider>,
    );
    // Back gesture: canceled, guard consulted, allowed → replay armed the bypass.
    window.dispatchEvent(new Event('popstate'));
    await waitFor(() => {
      expect(goSpy).toHaveBeenCalledTimes(1);
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // The browser lands on the replay target and fires popstate again. The bypass consumes
    // it: the guard is NOT consulted a second time and committedRef advances to here.
    window.history.pushState({ page: 'target' }, '', '/target');
    const landedHref = window.location.href;
    window.dispatchEvent(new Event('popstate'));
    await flushMicrotasks();
    expect(handler).toHaveBeenCalledTimes(1);

    // committedRef advanced: a subsequent armed Back restores the NEW entry (url + state).
    window.dispatchEvent(new Event('popstate'));
    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(2);
    });
    expect(pushSpy).toHaveBeenLastCalledWith({ page: 'target' }, '', landedHref);
  });

  it('a second Back while a decision is pending cancels again but starts only one guard run', async () => {
    const nav = makeNav();
    let resolveDecision!: (allowed: boolean) => void;
    const handler = vi.fn<NavigationGuardHandler>(
      () =>
        new Promise<boolean>((resolve) => {
          resolveDecision = resolve;
        }),
    );
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={handler} />
      </NavigationProvider>,
    );
    // First Back: cancel + start the (still pending) decision.
    window.dispatchEvent(new Event('popstate'));
    // Second Back mid-decision: cancel again, but no concurrent run (one dialog).
    window.dispatchEvent(new Event('popstate'));
    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
    expect(pushSpy).toHaveBeenCalledTimes(2);
    expect(goSpy).not.toHaveBeenCalled();

    // One resolution unwinds every stacked restore in a single go().
    resolveDecision(true);
    await waitFor(() => {
      expect(goSpy).toHaveBeenCalledWith(-2);
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('refreshes the committed entry after an allowed SDK navigation', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={handler} />
      </NavigationProvider>,
    );
    // An allowed guarded navigate advances committedRef to the shell-resolved target.
    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledWith('settings');
    });
    const targetHref = nav.resolvePath('settings', undefined);
    // A subsequent Back is now canceled by restoring the NEW page, not the arm-time URL.
    const pushSpy = vi.spyOn(window.history, 'pushState');
    vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    window.dispatchEvent(new Event('popstate'));
    expect(pushSpy).toHaveBeenCalledWith(null, '', targetHref);
  });

  it('refreshes the committed entry after an allowed plugin navigation', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    function PluginPage() {
      useNavigationGuard(true, handler);
      const { navigatePlugin } = usePluginNavigation();
      return (
        <button
          type="button"
          onClick={() => {
            navigatePlugin('flows', 'index', 'myflow');
          }}
        >
          go
        </button>
      );
    }
    render(
      <NavigationProvider value={nav}>
        <PluginPage />
      </NavigationProvider>,
    );
    // An allowed guarded navigatePlugin advances committedRef to the shell-resolved target.
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => {
      expect(nav.navigatePlugin).toHaveBeenCalledWith('flows', 'index', 'myflow', undefined);
    });
    const targetHref = nav.resolvePluginPath('flows', 'index', 'myflow', undefined);
    // A subsequent Back is now canceled by restoring the NEW plugin page, not the arm-time URL.
    const pushSpy = vi.spyOn(window.history, 'pushState');
    vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    window.dispatchEvent(new Event('popstate'));
    expect(pushSpy).toHaveBeenCalledWith(null, '', targetHref);
  });

  it('ignores popstate while no guard is armed', () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    const pushSpy = vi.spyOn(window.history, 'pushState');
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when={false} handler={handler} />
      </NavigationProvider>,
    );
    window.dispatchEvent(new Event('popstate'));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useNavigationGuard — full-page unload (beforeunload)', () => {
  it('prompts on unload while a guard is armed', () => {
    const nav = makeNav();
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={vi.fn<NavigationGuardHandler>().mockResolvedValue(true)} />
      </NavigationProvider>,
    );
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not prompt on unload while no guard is armed', () => {
    const nav = makeNav();
    render(
      <NavigationProvider value={nav}>
        <GuardedPage
          when={false}
          handler={vi.fn<NavigationGuardHandler>().mockResolvedValue(true)}
        />
      </NavigationProvider>,
    );
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops prompting once the guard disarms', () => {
    const nav = makeNav();
    const { rerender } = render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={vi.fn<NavigationGuardHandler>().mockResolvedValue(true)} />
      </NavigationProvider>,
    );
    rerender(
      <NavigationProvider value={nav}>
        <GuardedPage
          when={false}
          handler={vi.fn<NavigationGuardHandler>().mockResolvedValue(true)}
        />
      </NavigationProvider>,
    );
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
