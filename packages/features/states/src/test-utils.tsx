/**
 * Test harness for the states feature. `renderWithProviders` wraps the unit under
 * test in the exact provider stack the shell supplies at runtime — a retry-disabled
 * TanStack Query client, the SDK's raw `ApiProvider` (a stub client, passed via
 * `value=`), `ThemeProvider`, `SystemKindsProvider` (so `useFeatureOff('states')`
 * reads a seeded kind-status table), and a `NavigationProvider` whose `navigate` is a
 * spy. Only test dependencies are imported here; no production module is stubbed.
 */
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiProvider,
  AuthProvider,
  NavigationProvider,
  SystemKindsProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import type { ApiClient, KindStatus } from '@tai42/api-client';
import { render, type RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
  readonly navigatePlugin: Mock;
  readonly queryClient: QueryClient;
}

/** The session key `AuthProvider` seeds from, set so `SystemKindsProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

export function renderWithProviders(
  ui: ReactElement,
  {
    client,
    navigate: navigateOverride,
    systemKinds,
  }: { client: StubApiClient; navigate?: Mock; systemKinds?: readonly KindStatus[] },
): RenderWithProvidersResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const navigate = navigateOverride ?? vi.fn();
  const navigatePlugin = vi.fn();
  // A `systemKinds` table drives the kind-status context to `ready`: seed a session
  // key so `AuthProvider` is authenticated and `SystemKindsProvider` fetches. With no
  // table the context stays `loading` and every feature reads not-off — the shape
  // every pre-gating test expects.
  if (systemKinds !== undefined) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  // The stub only implements the methods exercised by a given test; the cast asserts
  // the shape the SDK context expects.
  const apiClient = (
    systemKinds !== undefined
      ? { ...client, getSystemKinds: () => Promise.resolve([...systemKinds]) }
      : client
  ) as ApiClient;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={apiClient}>
          <SystemKindsProvider>
            <ThemeProvider>
              <NavigationProvider
                value={{
                  navigate,
                  resolvePath: () => '/x',
                  navigatePlugin,
                  resolvePluginPath: () => '/x',
                }}
              >
                {ui}
              </NavigationProvider>
            </ThemeProvider>
          </SystemKindsProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { ...result, navigate, navigatePlugin, queryClient };
}

/** A kind-status row marking `states` OFF, for the feature-disabled gating tests. */
export function statesOffKind(detail = 'No state store is configured.'): KindStatus {
  return { kind: 'states', state: 'off', plugin: null, detail };
}

/** The first hidden file input under `container` (throws if absent — no assertion needed). */
export function fileInput(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (el === null) throw new Error('no file input found');
  return el;
}

/** The last hidden file input under `container` (the module upload sits after the list one). */
export function lastFileInput(container: HTMLElement): HTMLInputElement {
  const els = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const el = els[els.length - 1];
  if (el === undefined) throw new Error('no file input found');
  return el;
}
