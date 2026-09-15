import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppLink } from './app-link';
import {
  NavigationProvider,
  useAppNavigate,
  useNavigationGate,
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
describe('useNavigationGuard — SDK navigation interception', () => {
  it('navigates synchronously when no guard is armed', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when={false} handler={handler} />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    expect(nav.navigate).toHaveBeenCalledWith('settings');
    expect(handler).not.toHaveBeenCalled();
  });

  it('consults the guard and proceeds when it allows', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={handler} />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledWith('settings');
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('withholds the navigation until the async decision resolves', async () => {
    const nav = makeNav();
    let resolveDecision!: (allowed: boolean) => void;
    const handler = vi.fn<NavigationGuardHandler>(
      () =>
        new Promise<boolean>((resolve) => {
          resolveDecision = resolve;
        }),
    );
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={handler} />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
    // Decision still pending: the shell navigate must not have fired yet.
    await flushMicrotasks();
    expect(nav.navigate).not.toHaveBeenCalled();
    resolveDecision(true);
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledTimes(1);
    });
    expect(nav.navigate).toHaveBeenCalledWith('settings');
  });

  it('blocks the navigation when the guard vetoes', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(false);
    render(
      <NavigationProvider value={nav}>
        <GuardedPage when handler={handler} />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
    await flushMicrotasks();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('guards plugin navigation the same way', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(false);
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
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
    await flushMicrotasks();
    expect(nav.navigatePlugin).not.toHaveBeenCalled();
  });

  it('guards AppLink client-side transitions', async () => {
    const nav = makeNav();
    const handler = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    function Page() {
      useNavigationGuard(true, handler);
      return <AppLink to="tools">Tools</AppLink>;
    }
    render(
      <NavigationProvider value={nav}>
        <Page />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('link', { name: 'Tools' }));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledWith('tools', undefined);
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('useNavigationGuard — composition (any veto blocks)', () => {
  it('stops at the first veto and does not consult later guards', async () => {
    const nav = makeNav();
    const first = vi.fn<NavigationGuardHandler>().mockResolvedValue(false);
    const second = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    function Page() {
      useNavigationGuard(true, first);
      useNavigationGuard(true, second);
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
    render(
      <NavigationProvider value={nav}>
        <Page />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    await waitFor(() => {
      expect(first).toHaveBeenCalledTimes(1);
    });
    await flushMicrotasks();
    expect(second).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('proceeds only when every armed guard allows', async () => {
    const nav = makeNav();
    const first = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    const second = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    function Page() {
      useNavigationGuard(true, first);
      useNavigationGuard(true, second);
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
    render(
      <NavigationProvider value={nav}>
        <Page />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledTimes(1);
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('a disarmed guard (when=false) never blocks a still-armed sibling', async () => {
    const nav = makeNav();
    const disarmed = vi.fn<NavigationGuardHandler>().mockResolvedValue(false);
    const armed = vi.fn<NavigationGuardHandler>().mockResolvedValue(true);
    function Page() {
      useNavigationGuard(false, disarmed);
      useNavigationGuard(true, armed);
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
    render(
      <NavigationProvider value={nav}>
        <Page />
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledTimes(1);
    });
    expect(disarmed).not.toHaveBeenCalled();
    expect(armed).toHaveBeenCalledTimes(1);
  });
});

describe('useNavigationGuard — provider requirement', () => {
  it('throws loudly outside a NavigationProvider', () => {
    function Bare() {
      useNavigationGuard(true, () => true);
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Bare />)).toThrow(/NavigationProvider/);
    spy.mockRestore();
  });
});

/** A chrome link whose target is outside the token map: it must consult the same
 * armed guards through the gate before it commits its own transition. */
function ChromeLinkPage({
  when,
  handler,
  onCommit,
}: {
  when: boolean;
  handler: NavigationGuardHandler;
  onCommit: () => void;
}) {
  useNavigationGuard(when, handler);
  const gate = useNavigationGate();
  return (
    <button
      type="button"
      onClick={() => {
        void gate('/').then((allowed) => {
          if (allowed) onCommit();
        });
      }}
    >
      chrome link
    </button>
  );
}

describe('useNavigationGate', () => {
  it('commits a raw-path transition when no guard is armed', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <NavigationProvider value={makeNav()}>
        <ChromeLinkPage when={false} handler={() => true} onCommit={onCommit} />
      </NavigationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'chrome link' }));

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks the transition when an armed guard vetoes', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const handler = vi.fn(() => false);
    render(
      <NavigationProvider value={makeNav()}>
        <ChromeLinkPage when handler={handler} onCommit={onCommit} />
      </NavigationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'chrome link' }));

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits after an armed guard allows', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <NavigationProvider value={makeNav()}>
        <ChromeLinkPage when handler={() => Promise.resolve(true)} onCommit={onCommit} />
      </NavigationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'chrome link' }));

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
  });
});
