import { act, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import type { ApiClient, MeProjection } from '@tai42/api-client';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NotificationsPage } from './NotificationsPage';

/** The session key `AuthProvider` seeds from, set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

/**
 * Wrap UI in the full provider stack a feature page expects at runtime: a
 * retry-disabled QueryClient (so an error state lands on the first rejection
 * instead of after silent retries), the auth + capability contexts the page
 * projects on, the raw `ApiProvider` fed the stub client, the theme context the DS
 * reads, and a stub NavigationProvider. A `projection` drives the capability
 * context to `ready`; without one it stays `loading` and the page renders
 * unfiltered.
 */
function renderWithProviders(
  ui: ReactElement,
  {
    client,
    projection,
    getMe,
  }: {
    client: ApiClient;
    projection?: MeProjection;
    // A controllable `getMe`, for a test that must observe the projection RESOLVING.
    // Supersedes `projection`; supplying either authenticates the session.
    getMe?: ApiClient['getMe'];
  },
): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (projection !== undefined || getMe !== undefined) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  const resolveMe =
    getMe ?? (projection !== undefined ? () => Promise.resolve(projection) : undefined);
  const apiClient =
    resolveMe !== undefined ? ({ ...client, getMe: resolveMe } as ApiClient) : client;
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={apiClient}>
          <CapabilityProvider>
            <ThemeProvider>
              <NavigationProvider
                value={{
                  navigate: vi.fn(),
                  resolvePath: () => '/x',
                  navigatePlugin: vi.fn(),
                  resolvePluginPath: () => '/x',
                }}
              >
                {children}
              </NavigationProvider>
            </ThemeProvider>
          </CapabilityProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  render(ui, { wrapper });
}

/** A stub client exposing only the notifications endpoint the page consumes. */
function stubClient(listNotifications: ApiClient['listNotifications']): ApiClient {
  return { listNotifications } as unknown as ApiClient;
}

const baseProjection: MeProjection = {
  user_id: 'u-test',
  owner_user_id: null,
  admin: false,
  scopes: [],
  routes: [],
  route_patterns: [],
  sub_mcp: [],
  tools: [],
  agents: [],
  mintable: false,
};

/** A total (admin) projection: every surface reachable. */
function fullProjection(): MeProjection {
  return { ...baseProjection, admin: true };
}

/** A scoped (non-admin) projection restricted to the given slice. */
function scopedProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, ...overrides };
}

/** A hand-resolved projection promise, so a test can drive `getMe` past a barrier. */
function deferredProjection(): {
  promise: Promise<MeProjection>;
  resolve: (projection: MeProjection) => void;
} {
  let resolve!: (projection: MeProjection) => void;
  const promise = new Promise<MeProjection>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const record = {
  id: 'n1',
  message: 'Backup completed',
  recipient: 'ops',
  created_at: '2026-07-11T00:00:00Z',
};

describe('NotificationsPage', () => {
  it('renders a row per notification, newest-first as served', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          record,
          { id: 'n2', message: 'Disk low', recipient: null, created_at: '2026-07-10T00:00:00Z' },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const table = await screen.findByTestId('notifications-table');
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    const rows = within(table).getAllByRole('row');
    // Header row + two data rows.
    expect(rows).toHaveLength(3);
    expect(within(table).getByText('Backup completed')).toBeInTheDocument();
    expect(within(table).getByText('ops')).toBeInTheDocument();
    expect(within(table).getByText('Disk low')).toBeInTheDocument();
  });

  it('renders the empty state when the feed is empty', async () => {
    const client = stubClient(vi.fn().mockResolvedValue({ notifications: [] }));
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    expect(await screen.findByText('No notifications')).toBeInTheDocument();
    expect(screen.queryByTestId('notifications-table')).not.toBeInTheDocument();
  });

  it('a scoped projection shows the per-identity empty-state copy', async () => {
    const client = stubClient(vi.fn().mockResolvedValue({ notifications: [] }));
    renderWithProviders(<NotificationsPage search={{}} />, {
      client,
      projection: scopedProjection({ routes: [{ path: '/api/notifications', methods: ['GET'] }] }),
    });

    expect(
      await screen.findByText('Notifications addressed to you appear here.'),
    ).toBeInTheDocument();
  });

  it('a full projection shows the default empty-state copy (not the per-identity copy) once resolved', async () => {
    // The default copy also renders while the projection is still LOADING, so drive
    // `getMe` through a deferred and only assert AFTER resolving it to full — that
    // barrier makes the assertion exercise the ready+full branch, and the negative
    // (the per-identity copy is absent) fails if the ready/full logic were inverted.
    const client = stubClient(vi.fn().mockResolvedValue({ notifications: [] }));
    const deferred = deferredProjection();
    renderWithProviders(<NotificationsPage search={{}} />, {
      client,
      getMe: () => deferred.promise,
    });

    await act(async () => {
      deferred.resolve(fullProjection());
    });

    expect(
      await screen.findByText('Messages recorded with no delivery channel will appear here.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Notifications addressed to you appear here.'),
    ).not.toBeInTheDocument();
  });

  it('surfaces a loud error state when the feed request rejects', async () => {
    const client = stubClient(vi.fn().mockRejectedValue(new Error('notifications fetch failed')));
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('notifications fetch failed')).toBeInTheDocument();
  });
});
