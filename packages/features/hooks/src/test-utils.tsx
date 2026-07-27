/**
 * Test harness for the hooks feature. `renderWithProviders` wraps the unit under
 * test in the exact provider stack the shell supplies at runtime — a
 * retry-disabled TanStack Query client, `AuthProvider` + `CapabilityProvider` (so
 * the capability-gated trigger-links section resolves), the SDK's raw `ApiProvider`
 * (a stub client), `ThemeProvider`, and a `NavigationProvider` whose `navigate` is
 * a spy. Only test dependencies are imported here; no production module is stubbed.
 *
 * A `projection` seeds the capability context to `ready`: a session key is set so
 * `AuthProvider` is authenticated and `CapabilityProvider` fetches a stubbed
 * `getMe`. With no projection the context stays `loading` and the gated section
 * stays hidden (fail closed) — the shape the pre-existing tests expect.
 */
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import type {
  ApiClient,
  HookParams,
  MeProjection,
  TokensPayload,
  TriggerLinkRecord,
} from '@tai42/api-client';
import { render, type RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

/** The session key `useAuth` reads/writes; set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
  readonly queryClient: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { client, projection }: { client: StubApiClient; projection?: MeProjection },
): RenderWithProvidersResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const navigate = vi.fn();

  if (projection !== undefined) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  // The stub only implements the methods exercised by a given test; the cast
  // asserts the shape the SDK context expects. A seeded projection stubs `getMe`
  // so `CapabilityProvider` resolves to `ready`.
  const apiClient =
    projection !== undefined
      ? ({ ...client, getMe: () => Promise.resolve(projection) } as ApiClient)
      : (client as ApiClient);

  // The stack is a `wrapper`, not part of the rendered element: RTL's `rerender`
  // replaces only the element, so a wrapper keeps the providers (and the unit's own
  // state) alive across a re-render with new props.
  const wrapper = ({ children }: { readonly children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={apiClient}>
          <CapabilityProvider>
            <ThemeProvider>
              <NavigationProvider value={{ navigate, resolvePath: () => '/x' }}>
                {children}
              </NavigationProvider>
            </ThemeProvider>
          </CapabilityProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>
  );

  const result = render(ui, { wrapper });

  return { ...result, navigate, queryClient };
}

/** Build a full `HookParams` from a partial override. The gate strings default
 * to null; the `*_kwargs` maps default to {} (non-nullable in the contract). */
export function hook(overrides: Partial<HookParams> = {}): HookParams {
  return {
    name: 'notify-on-order',
    topic: 'orders.created',
    tool: 'slack.post_message',
    execution_key: 'svc-orders',
    tool_kwargs: {},
    condition: null,
    condition_id: null,
    condition_kwargs: {},
    expr: null,
    expr_id: null,
    expr_kwargs: {},
    ...overrides,
  };
}

/** Build a full `TriggerLinkRecord` from a partial override. */
export function triggerLink(overrides: Partial<TriggerLinkRecord> = {}): TriggerLinkRecord {
  return {
    name: 'wall-poster',
    topic: 'orders.created',
    execution_key: 'svc-orders',
    trigger_auth: 'token',
    tool_kwargs: null,
    created_by: null,
    created_at: '2026-07-22T09:00:00Z',
    expires_at: null,
    token_hash_prefix: 'abc123def456',
    ...overrides,
  };
}

/** One api-key payload row for the execution-key picker. */
export function apiKey(overrides: Partial<TokensPayload[number]> = {}): TokensPayload[number] {
  return {
    user_id: 'svc-orders',
    description: 'Order service key',
    scopes: ['hooks'],
    // The server nests the mint fingerprint here; the picker reads it from here.
    policy_data: { key_fingerprint: 'kf-9f2c1d' },
    ...overrides,
  };
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

/** A total (admin / gate-off) projection: every surface reachable. */
export function fullProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, admin: true, ...overrides };
}

/** A scoped (non-admin) projection restricted to the given slice. */
export function scopedProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, ...overrides };
}
