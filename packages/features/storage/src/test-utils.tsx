/**
 * Test harness for the Storage screen: the provider stack the shell supplies at
 * runtime — a retry-disabled TanStack Query client, an authenticated session, the
 * capability projection (`getMe`, a full projection unless a test passes one),
 * `ApiProvider` with a stub client, `ThemeProvider`, and a `NavigationProvider`
 * whose `navigate` is a spy unless a test passes its own.
 */
import { type ApiClient, createApiClient, type MeProjection } from '@tai42/api-client';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  type NavigationContextValue,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { type ReactElement, type ReactNode, useMemo } from 'react';
import { type Mock, vi } from 'vitest';

/** The real refusal readers of a client: a stub client carries them so a refused write
 * reads its holders and its stored-preset fault exactly as the served client does. */
const { holdersFromError, storedPresetFaultFromError } = createApiClient({ getToken: () => null });
const refusalReaders = { holdersFromError, storedPresetFaultFromError };

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

/** The session key `AuthProvider` seeds from. */
const SESSION_KEY = 'tai-studio.apiKey';

/** A total (admin / gate-off) projection: every door reachable. */
export function fullProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return {
    access_control_enabled: true,
    user_id: 'u-test',
    owner_user_id: null,
    principal: null,
    admin: true,
    public_resource_id: 'public',
    scopes: [],
    routes: [],
    route_patterns: [],
    sub_mcp: [],
    tools: [],
    agents: [],
    mintable: false,
    ...overrides,
  };
}

/** A scoped projection reaching exactly the given `METHOD path` routes. */
export function scopedProjection(routes: readonly (readonly [string, string])[]): MeProjection {
  return fullProjection({
    admin: false,
    routes: routes.map(([method, path]) => ({ path, methods: [method] })),
  });
}

export interface HarnessOptions {
  readonly client: StubApiClient;
  readonly projection?: MeProjection;
  readonly navigate?: NavigationContextValue['navigate'];
  readonly queryClient?: QueryClient;
}

export function newQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** The provider stack around `children`. */
export function StorageProviders({
  client,
  projection,
  navigate,
  queryClient,
  children,
}: {
  readonly client: StubApiClient;
  readonly projection: MeProjection;
  readonly navigate: NavigationContextValue['navigate'];
  readonly queryClient: QueryClient;
  readonly children: ReactNode;
}) {
  globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  // Stable across re-renders: a new client identity would re-read the projection.
  const apiClient = useMemo(
    () =>
      ({
        ...refusalReaders,
        getSystemKinds: () => Promise.resolve([]),
        getMe: () => Promise.resolve(projection),
        ...client,
      }) as ApiClient,
    [client, projection],
  );
  const navigation = useMemo<NavigationContextValue>(
    () => ({
      navigate,
      resolvePath: (token, search) => {
        const query = new URLSearchParams(
          Object.entries((search ?? {}) as Record<string, unknown>).flatMap(([key, value]) =>
            value === undefined ? [] : [[key, String(value as string | number | boolean)]],
          ),
        ).toString();
        return query === '' ? `/${token}` : `/${token}?${query}`;
      },
      navigatePlugin: vi.fn(),
      resolvePluginPath: () => '/x',
    }),
    [navigate],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={apiClient}>
          <CapabilityProvider>
            <ThemeProvider>
              <NavigationProvider value={navigation}>{children}</NavigationProvider>
            </ThemeProvider>
          </CapabilityProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
  readonly queryClient: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  options: Omit<HarnessOptions, 'navigate'> & { readonly navigate?: Mock },
): RenderWithProvidersResult {
  const queryClient = options.queryClient ?? newQueryClient();
  const navigate = options.navigate ?? vi.fn();
  const projection = options.projection ?? fullProjection();
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <StorageProviders
      client={options.client}
      projection={projection}
      navigate={navigate}
      queryClient={queryClient}
    >
      {children}
    </StorageProviders>
  );
  const result: RenderResult = render(ui, { wrapper });
  return { ...result, navigate, queryClient };
}
