/**
 * Shared render harness for the manifest feature tests. It composes the exact
 * provider stack the shell supplies — a retry-free TanStack Query client, the raw
 * `ApiProvider` carrying a stub client, the auth + capability contexts (so a page's
 * write-gated affordances resolve), the theme, and a stub navigation surface — so a
 * page renders against real providers with a fake transport.
 *
 * A test that exercises a write-gated surface passes a `projection`: it seeds a session
 * key so `CapabilityProvider` fetches it and reaches `ready`. With no projection the
 * capability context stays `loading` and every write affordance fails closed (hidden),
 * the shape every read-only manifest test expects.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import type { ApiClient } from '@tai42/studio-sdk';
import type { MeProjection } from '@tai42/api-client';
import type { NavigationContextValue } from '@tai42/studio-sdk';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

const navigation: NavigationContextValue = {
  navigate: vi.fn(),
  resolvePath: () => '/x',
  navigatePlugin: vi.fn(),
  resolvePluginPath: () => '/x',
};

/** The session key `AuthProvider` seeds from, set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

export function renderWithProviders(
  ui: ReactNode,
  {
    client,
    queryClient,
    projection,
  }: { client: Partial<ApiClient>; queryClient?: QueryClient; projection?: MeProjection },
): RenderResult {
  // A caller can supply its own client (to drive a background cache update via
  // `setQueryData` in-test); otherwise a fresh, retry-free one is used.
  const resolvedQueryClient =
    queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A projection drives the capability context to `ready`: seed a session key so
  // `AuthProvider` is authenticated and `CapabilityProvider` fetches `getMe`. With no
  // projection the context stays `loading` and write affordances stay hidden.
  if (projection !== undefined) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  const resolvedClient = (
    projection !== undefined ? { ...client, getMe: () => Promise.resolve(projection) } : client
  ) as ApiClient;
  return render(
    <QueryClientProvider client={resolvedQueryClient}>
      {/* The stub only implements the methods each test exercises; the page reads
          nothing else, so widening the partial stub to the full client is safe. */}
      <AuthProvider>
        <ApiProvider value={resolvedClient}>
          <CapabilityProvider>
            <ThemeProvider>
              <NavigationProvider value={navigation}>{ui}</NavigationProvider>
            </ThemeProvider>
          </CapabilityProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** A total (admin) projection: every surface reachable. */
export function fullProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, admin: true, ...overrides };
}

/** A scoped (non-admin) projection restricted to the given routes/patterns. */
export function scopedProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, ...overrides };
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
