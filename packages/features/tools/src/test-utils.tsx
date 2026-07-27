/**
 * Test harness for the tools feature. `renderWithProviders` wraps the unit under
 * test in the exact provider stack the shell supplies at runtime — a
 * retry-disabled TanStack Query client, the SDK's raw `ApiProvider` (a stub
 * client, passed via `value=`), `ThemeProvider`, and a `NavigationProvider` whose
 * `navigate` is a spy so navigation can be asserted. Only test dependencies are
 * imported here; no production module is stubbed.
 */
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import type { ApiClient, MeProjection } from '@tai42/api-client';
import { render, type RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
  readonly queryClient: QueryClient;
}

/** The session key `AuthProvider` seeds from, set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

export function renderWithProviders(
  ui: ReactElement,
  { client, projection }: { client: StubApiClient; projection?: MeProjection },
): RenderWithProvidersResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const navigate = vi.fn();
  // A projection drives the capability context to `ready`: seed a session key so
  // `AuthProvider` is authenticated and `CapabilityProvider` fetches `getMe`. With
  // no projection the context stays `loading` and the page renders unfiltered — the
  // shape every pre-capability test expects.
  if (projection !== undefined) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  // The stub only implements the methods exercised by a given test; the cast
  // asserts the shape the SDK context expects.
  const apiClient = (
    projection !== undefined ? { ...client, getMe: () => Promise.resolve(projection) } : client
  ) as ApiClient;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={apiClient}>
          <CapabilityProvider>
            <ThemeProvider>
              <NavigationProvider value={{ navigate, resolvePath: () => '/x' }}>
                {ui}
              </NavigationProvider>
            </ThemeProvider>
          </CapabilityProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { ...result, navigate, queryClient };
}

/** A total (admin) projection: every surface reachable. */
export function fullProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, admin: true, ...overrides };
}

/** A scoped (non-admin) projection restricted to the given slice. */
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

/**
 * Every rendered CONTROL whose only boundary is the DECORATIVE border token.
 *
 * `tokens.css` states the rule this reads: `--tai-color-border` sits below 3:1
 * and "may never be a control's only boundary" — `--tai-color-control-border` is
 * the contrast-safe edge. Derived from the rendered DOM rather than from a list
 * of call sites, so a control added later is judged by the same rule. The
 * selector is the ARIA widget-role set plus the native form controls, not a
 * repo-specific enumeration.
 */
const CONTROL_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="combobox"]',
].join(', ');

export function decorBorderedControls(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)]
    .filter((node) =>
      /(^|;)\s*border:[^;]*var\(--tai-color-border\)/.test(node.getAttribute('style') ?? ''),
    )
    .map((node) => `${node.tagName.toLowerCase()}: ${node.textContent}`);
}
