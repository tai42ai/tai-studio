/**
 * Tests for the route-mounting install dialog and its helpers: the preview fires
 * on open and on a (debounced) base remap, the resolved paths render live, a
 * collision blocks submit loudly, a public route must be accepted before submit,
 * a preview failure blocks, and the mcp-server env is collected in the same flow.
 * The pure helpers (`collectEnv`, `routeItemsOf`, `useDebouncedValue`) are covered
 * directly.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MarketplaceInstallPreview } from '@tai42/api-client';

import {
  MountInstallDialog,
  collectEnv,
  routeItemsOf,
  useDebouncedValue,
  type RouteItem,
} from './install-dialog';
import { renderWithProviders, type StubApiClient } from './test-utils';

const noop = (): void => undefined;

function routeItems(): RouteItem[] {
  return [
    {
      name: 'web',
      kind: 'channel',
      routes: {
        base: 'channels/web',
        paths: [
          { path: '/inbound', methods: ['POST'], public: true },
          { path: '/status', methods: ['GET'], public: false },
        ],
      },
    },
  ];
}

function previewFixture(
  overrides: Partial<MarketplaceInstallPreview> = {},
): MarketplaceInstallPreview {
  return {
    ref: 'acme/relay',
    version: '1.0.0',
    items: [
      {
        item: 'web',
        kind: 'channel',
        base: 'channels/web',
        default_base: 'channels/web',
        routes: [
          {
            path: '/inbound',
            full_path: '/api/channels/web/inbound',
            methods: ['POST'],
            public: true,
          },
          {
            path: '/status',
            full_path: '/api/channels/web/status',
            methods: ['GET'],
            public: false,
          },
        ],
      },
    ],
    collisions: [],
    public_routes: [],
    new_public_routes: [],
    requires_public_acceptance: false,
    ...overrides,
  };
}

/** A pending promise, for exercising the preview-pending branch. */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

describe('collectEnv', () => {
  it('omits a blank var and marks a filled var secret unless toggled off', () => {
    const { env, secretKeys } = collectEnv(
      ['A', 'B', 'C'],
      { A: 'a', B: '', C: 'c' },
      { A: true, C: false },
    );
    // B is blank → omitted entirely; A defaults secret; C's toggle is off.
    expect(env).toEqual({ A: 'a', C: 'c' });
    expect(secretKeys).toEqual(['A']);
  });
});

describe('routeItemsOf', () => {
  it('keeps only the items that declare routes, in order', () => {
    const items = [
      { kind: 'tool', name: 'uuid' },
      {
        kind: 'channel',
        name: 'web',
        routes: {
          base: 'channels/web',
          paths: [{ path: '/x', methods: ['GET' as const], public: true }],
        },
      },
      { kind: 'mcp-server', name: 'db', routes: null },
    ];
    const out = routeItemsOf(items);
    expect(out.map((item) => item.name)).toEqual(['web']);
    expect(out[0]?.routes.base).toBe('channels/web');
  });
});

describe('useDebouncedValue', () => {
  it('settles the first value immediately and a change only after the delay', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 20), {
      initialProps: { value: 'a' },
    });
    expect(result.current).toBe('a');
    rerender({ value: 'b' });
    // Not yet settled synchronously after the change.
    expect(result.current).toBe('a');
    await waitFor(() => {
      expect(result.current).toBe('b');
    });
  });
});

describe('MountInstallDialog — preview and mounting', () => {
  it('previews on open with the default bases and renders the resolved paths', async () => {
    const previewMarketplaceInstall = vi.fn().mockResolvedValue(previewFixture());
    const client: StubApiClient = { previewMarketplaceInstall };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        requiredEnvVars={[]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={noop}
      />,
      { client },
    );

    expect(await screen.findByText('/api/channels/web/inbound')).toBeInTheDocument();
    expect(screen.getByText('/api/channels/web/status')).toBeInTheDocument();
    expect(previewMarketplaceInstall).toHaveBeenCalledWith(
      { ref: 'acme/relay', version: '1.0.0', route_mounts: { web: 'channels/web' } },
      expect.anything(),
    );
  });

  it('shows a skeleton while the first preview is pending (no resolved paths yet)', async () => {
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn(() => pending<MarketplaceInstallPreview>()),
    };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        requiredEnvVars={[]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={noop}
      />,
      { client },
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('/api/channels/web/inbound')).toBeNull();
    // The submit is blocked until a preview lands.
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('submits route_mounts + accept_public_routes when there is nothing to accept', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
    };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        requiredEnvVars={[]}
        onSubmit={onSubmit}
        onClose={noop}
      />,
      { client },
    );

    await screen.findByText('/api/channels/web/inbound');
    await user.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        route_mounts: { web: 'channels/web' },
        accept_public_routes: false,
      });
    });
  });

  it('re-previews with the remapped base after a debounced edit', async () => {
    const user = userEvent.setup();
    const previewMarketplaceInstall = vi.fn().mockResolvedValue(previewFixture());
    const client: StubApiClient = { previewMarketplaceInstall };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        requiredEnvVars={[]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={noop}
      />,
      { client },
    );

    await screen.findByText('/api/channels/web/inbound');
    const baseInput = screen.getByLabelText('web base');
    await user.clear(baseInput);
    await user.type(baseInput, 'channels/relay');

    await waitFor(() => {
      expect(previewMarketplaceInstall).toHaveBeenCalledWith(
        { ref: 'acme/relay', version: '1.0.0', route_mounts: { web: 'channels/relay' } },
        expect.anything(),
      );
    });
  });

  it('blocks submit and shows a loud collision block when the preview finds one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(
        previewFixture({
          collisions: [
            {
              item: 'web',
              full_path: '/api/channels/web/inbound',
              methods: ['POST'],
              conflict_owner: 'plugin:acme/other',
              conflict_path: '/api/channels/web/inbound',
            },
          ],
        }),
      ),
    };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        requiredEnvVars={[]}
        onSubmit={onSubmit}
        onClose={noop}
      />,
      { client },
    );

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Route collision')).toBeInTheDocument();
    expect(within(dialog).getByText('plugin:acme/other')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('requires public-route acceptance before submit is allowed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(
        previewFixture({
          public_routes: [
            { item: 'web', full_path: '/api/channels/web/inbound', methods: ['POST'] },
          ],
          new_public_routes: [
            { item: 'web', full_path: '/api/channels/web/inbound', methods: ['POST'] },
          ],
          requires_public_acceptance: true,
        }),
      ),
    };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        requiredEnvVars={[]}
        onSubmit={onSubmit}
        onClose={noop}
      />,
      { client },
    );

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Public routes');
    // Blocked until the operator accepts the unauthenticated routes.
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'I accept these routes are served without authentication',
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        route_mounts: { web: 'channels/web' },
        accept_public_routes: true,
      });
    });
  });

  it('blocks submit and surfaces the failure loudly when the preview errors', async () => {
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn().mockRejectedValue(new Error('boom: preview')),
    };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        requiredEnvVars={[]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={noop}
      />,
      { client },
    );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/install preview failed/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('collects the mcp-server env in the same flow and carries it in the body', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
    };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Install"
        routeItems={routeItems()}
        requiredEnvVars={['DATABASE_URL']}
        onSubmit={onSubmit}
        onClose={noop}
      />,
      { client },
    );

    await screen.findByText('/api/channels/web/inbound');
    await user.type(screen.getByLabelText('DATABASE_URL'), 'postgres://db');
    await user.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        route_mounts: { web: 'channels/web' },
        accept_public_routes: false,
        env: { DATABASE_URL: 'postgres://db' },
        secret_keys: ['DATABASE_URL'],
      });
    });
  });

  it('closes without submitting on cancel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
    };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Update"
        routeItems={routeItems()}
        requiredEnvVars={[]}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
      { client },
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('MountInstallDialog — update seeds from and preserves the stored mount', () => {
  it('prefills each base input from the stored mount, not the declared default', async () => {
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
    };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Update"
        routeItems={routeItems()}
        // Installed at a NON-default base.
        storedMounts={{ web: 'channels/relay-2' }}
        requiredEnvVars={[]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={noop}
      />,
      { client },
    );
    // A base input seeds from the stored mount, not the declared default, so an
    // item installed at a non-default base shows that base on reopen.
    const baseInput = await screen.findByLabelText<HTMLInputElement>('web base');
    expect(baseInput.value).toBe('channels/relay-2');
  });

  it('a non-default stored base survives an edit-free update: route_mounts is empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
    };
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Update"
        routeItems={routeItems()}
        storedMounts={{ web: 'channels/relay-2' }}
        requiredEnvVars={[]}
        onSubmit={onSubmit}
        onClose={noop}
      />,
      { client },
    );
    await screen.findByText('/api/channels/web/inbound');
    await user.click(screen.getByRole('button', { name: 'Update' }));
    // An edit-free update omits untouched items from route_mounts, so the server's
    // stored-mount precedence preserves the non-default base 'channels/relay-2'.
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        route_mounts: {},
        accept_public_routes: false,
      });
    });
  });

  it('sends ONLY the operator-changed base and omits the unchanged item', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const client: StubApiClient = {
      previewMarketplaceInstall: vi.fn().mockResolvedValue(previewFixture()),
    };
    const twoItems: RouteItem[] = [
      ...routeItems(),
      {
        name: 'api',
        kind: 'router',
        routes: {
          base: 'routers/api',
          paths: [{ path: '/ping', methods: ['GET'], public: false }],
        },
      },
    ];
    renderWithProviders(
      <MountInstallDialog
        refValue="acme/relay"
        version="1.0.0"
        verb="Update"
        routeItems={twoItems}
        storedMounts={{ web: 'channels/relay-2', api: 'routers/api-2' }}
        requiredEnvVars={[]}
        onSubmit={onSubmit}
        onClose={noop}
      />,
      { client },
    );
    await screen.findByText('/api/channels/web/inbound');
    const webInput = screen.getByLabelText('web base');
    await user.clear(webInput);
    await user.type(webInput, 'channels/relay-9');
    await user.click(screen.getByRole('button', { name: 'Update' }));
    // Only 'web' changed from its stored base; 'api' is unchanged → omitted so the
    // server preserves its stored 'routers/api-2'.
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        route_mounts: { web: 'channels/relay-9' },
        accept_public_routes: false,
      });
    });
  });
});
