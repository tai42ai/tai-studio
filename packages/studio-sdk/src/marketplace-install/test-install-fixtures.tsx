/**
 * Shared fixtures for the install-UI tests: a one-channel route item, its preview, an
 * install receipt, a store-off refusal and a render helper that mounts the tree under
 * an `ApiProvider` with a fake client carrying only the calls a test stubs.
 */
import type {
  ApiClient,
  MarketplaceInstallPreview,
  MarketplaceInstallResult,
} from '@tai42/api-client';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

import { ApiProvider } from '../hooks/useApi';
import type { RouteItem } from './route-items';

export type FakeApiClient = Partial<ApiClient>;

export const noop = (): void => undefined;

/** Render `ui` with `client` as the `useApi()` client. */
export function renderWithApi(ui: ReactElement, client: FakeApiClient): RenderResult {
  return render(<ApiProvider value={client as unknown as ApiClient}>{ui}</ApiProvider>);
}

/** A pending promise, for exercising a still-loading branch. */
export function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

export function routeItems(): RouteItem[] {
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

export function previewFixture(
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
    required_env: [],
    missing_env: [],
    delivery: 'package',
    ...overrides,
  };
}

export function installReceipt(ref = 'acme/relay'): MarketplaceInstallResult {
  return {
    ref,
    version: '1.0.0',
    notes: [],
    advisories: [],
    routes: [],
    package: null,
    pip_output: null,
    reload: {
      span_release_error: null,
      status: 'reloaded',
      env_keys: 0,
      recycle: null,
      awaiting_respawn: [],
      fanout: {
        mode: 'local-only',
        note: 'only this worker reloaded',
      },
    },
  };
}

/** The refusal a server without a marketplace store answers an install call with. */
export function storeOffError(): Error {
  return Object.assign(new Error('No marketplace store is configured on this server.'), {
    status: 501,
    code: 'marketplace-not-configured',
  });
}
