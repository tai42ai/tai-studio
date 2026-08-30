import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/**
 * A stub client exposing only what the page consumes: the notifications endpoint
 * and the `baseUrl` the media renderer reads (`''` == same-origin deployment).
 */
function stubClient(listNotifications: ApiClient['listNotifications']): ApiClient {
  return { listNotifications, baseUrl: '' } as unknown as ApiClient;
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
  audience: null,
  media: null,
  template: null,
  options: null,
  created_at: '2026-07-11T00:00:00Z',
};

describe('NotificationsPage', () => {
  it('renders a card per notification, newest-first as served', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          record,
          {
            ...record,
            id: 'n2',
            message: 'Disk low',
            recipient: null,
            created_at: '2026-07-10T00:00:00Z',
          },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const list = await screen.findByTestId('notifications-list');
    const cards = within(list).getAllByTestId('notification-card');
    expect(cards).toHaveLength(2);
    // Served order is preserved (newest-first is the server's contract).
    expect(cards[0]).toHaveAttribute('data-notification-id', 'n1');
    expect(cards[1]).toHaveAttribute('data-notification-id', 'n2');
    expect(within(list).getByText('Backup completed')).toBeInTheDocument();
    expect(within(list).getByText('Disk low')).toBeInTheDocument();
    expect(within(list).getByText('Recipient: ops')).toBeInTheDocument();
  });

  it('renders the full rich shape: an inline image, a link, options and audience', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          {
            ...record,
            id: 'rich',
            message: 'Release shipped',
            recipient: null,
            audience: 'u-42',
            media: [
              { kind: 'image', url: 'https://cdn.example.com/ship.png', caption: 'The ship' },
              { kind: 'link', url: 'https://example.com/notes', caption: 'Release notes' },
            ],
            options: ['Acknowledge', 'Snooze'],
          },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const card = await screen.findByTestId('notification-card');
    // The image renders as a real <img> with its caption as alt text.
    const image = within(card).getByRole('img', { name: 'The ship' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/ship.png');
    // The link renders through the safe external-link button, labelled by its caption.
    expect(within(card).getByText('Release notes')).toBeInTheDocument();
    // Options render as inert chips.
    const options = within(card).getByTestId('notification-options');
    expect(within(options).getByText('Acknowledge')).toBeInTheDocument();
    expect(within(options).getByText('Snooze')).toBeInTheDocument();
    // The addressed identity shows in the metadata.
    expect(within(card).getByText('Audience: u-42')).toBeInTheDocument();
  });

  it('renders an inline data:image (the sink stores media raw)', async () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA';
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          { ...record, id: 'd', media: [{ kind: 'image', url: dataUri, caption: 'inline' }] },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const image = await screen.findByRole('img', { name: 'inline' });
    expect(image).toHaveAttribute('src', dataUri);
    expect(screen.queryByTestId('notification-media-blocked')).not.toBeInTheDocument();
  });

  it('blocks a disallowed image scheme loudly, never as a live src', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          {
            ...record,
            id: 'b',
            media: [{ kind: 'image', url: 'http://insecure.example/x.png', caption: 'nope' }],
          },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const blocked = await screen.findByTestId('notification-media-blocked');
    expect(within(blocked).getByText('http://insecure.example/x.png')).toBeInTheDocument();
    // The blocked url is escaped text, never an image element.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([
    ['a non-image data uri', 'data:text/html,<script>1</script>'],
    ['a javascript url', 'javascript:alert(1)'],
  ])('blocks %s loudly, never as a live src', async (_label, url) => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [{ ...record, id: 'b', media: [{ kind: 'image', url, caption: 'nope' }] }],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const blocked = await screen.findByTestId('notification-media-blocked');
    expect(within(blocked).getByText(url)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows a loud per-item notice for a malformed media item without dropping the record', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          {
            ...record,
            id: 'm',
            message: 'Still visible',
            media: [{ kind: 'image' }, { kind: 'link', url: 'https://ok.example', caption: 'ok' }],
          },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    expect(await screen.findByTestId('notification-media-malformed')).toBeInTheDocument();
    // The record itself — and its good item — still render.
    expect(screen.getByText('Still visible')).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('replaces an image that fails to load with the loud failure notice', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          {
            ...record,
            id: 'f',
            media: [{ kind: 'image', url: 'https://cdn.example/gone.png', caption: 'gone' }],
          },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const image = await screen.findByRole('img', { name: 'gone' });
    fireEvent.error(image);

    const failed = await screen.findByTestId('notification-media-error');
    expect(within(failed).getByText('Image failed to load')).toBeInTheDocument();
    expect(within(failed).getByText('https://cdn.example/gone.png')).toBeInTheDocument();
    // The broken element is gone — the notice replaces it, loudly.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('admits a served-media url, defaults captions, and keeps a raw unparseable timestamp', async () => {
    const servedId = 'A'.repeat(43);
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          {
            ...record,
            id: 's',
            created_at: 'not-a-timestamp',
            media: [
              // Served-media route (no caption → the default content alt).
              { kind: 'image', url: `/api/interactions/media/${servedId}` },
              // Whitespace-only caption falls back the same way.
              { kind: 'image', url: 'https://cdn.example/pic.png', caption: '   ' },
              // A caption-less link labels itself with its url.
              { kind: 'link', url: 'https://docs.example/page' },
            ],
          },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const images = await screen.findAllByRole('img', { name: 'Attached image' });
    expect(images).toHaveLength(2);
    const link = screen.getByTestId('notification-media-link');
    expect(within(link).getByText('https://docs.example/page')).toBeInTheDocument();
    // An unparseable stored timestamp renders raw rather than "Invalid Date".
    expect(screen.getByText(/not-a-timestamp/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it('renders a stored template block', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          {
            ...record,
            id: 't',
            template: { name: 'order_update', language: 'en', parameters: ['#123', 'shipped'] },
          },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const template = await screen.findByTestId('notification-template');
    expect(within(template).getByText('order_update')).toBeInTheDocument();
    expect(within(template).getByText('en')).toBeInTheDocument();
    expect(within(template).getByText('Parameters: #123, shipped')).toBeInTheDocument();
  });

  it('renders a parameter-less template without a Parameters line', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        notifications: [
          { ...record, id: 'tp', template: { name: 'welcome', language: 'he', parameters: [] } },
        ],
      }),
    );
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const template = await screen.findByTestId('notification-template');
    expect(within(template).getByText('welcome')).toBeInTheDocument();
    expect(within(template).queryByText(/^Parameters:/)).not.toBeInTheDocument();
  });

  it('reveals more with the "Show more" control when the feed exceeds one page', async () => {
    const notifications = Array.from({ length: 25 }, (_unused, index) => ({
      ...record,
      id: `n${String(index)}`,
      message: `Notice ${String(index)}`,
    }));
    const client = stubClient(vi.fn().mockResolvedValue({ notifications }));
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    const list = await screen.findByTestId('notifications-list');
    // The first page (20) is shown; the tail waits behind the reveal.
    expect(within(list).getAllByTestId('notification-card')).toHaveLength(20);
    const more = screen.getByRole('button', { name: /Show more \(5\)/ });
    await userEvent.click(more);
    await waitFor(() => {
      expect(within(list).getAllByTestId('notification-card')).toHaveLength(25);
    });
    // Fully revealed — the control is gone.
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();
  });

  it('renders the empty state when the feed is empty', async () => {
    const client = stubClient(vi.fn().mockResolvedValue({ notifications: [] }));
    renderWithProviders(<NotificationsPage search={{}} />, { client });

    expect(await screen.findByText('No notifications')).toBeInTheDocument();
    expect(screen.queryByTestId('notifications-list')).not.toBeInTheDocument();
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
