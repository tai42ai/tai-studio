/**
 * Shared test harness: render a feature tree inside the exact provider stack the
 * shell supplies at runtime — a fresh QueryClient (retries off so a rejected query
 * surfaces the error state immediately), the typed API client, the theme, and a
 * stub navigation context.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

import type { ApiClient, MeProjection } from '@tai42/api-client';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly client: ApiClient;
  readonly projection?: MeProjection;
}

/** The session key `AuthProvider` seeds from, set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

export function renderWithProviders(ui: ReactNode, options: ProviderOptions): RenderResult {
  const { client, projection, ...renderOptions } = options;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  // A projection drives the capability context to `ready`: seed a session key so
  // `AuthProvider` is authenticated and `CapabilityProvider` fetches `getMe`. With
  // no projection the context stays `loading` and mint gating / plugin-tab gating
  // fall open to their pre-capability behaviour — the shape every existing test
  // expects.
  if (projection !== undefined) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  const apiClient =
    projection !== undefined
      ? ({ ...client, getMe: () => Promise.resolve(projection) } as ApiClient)
      : client;

  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
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
  }

  return render(ui as ReactElement, { wrapper: Wrapper, ...renderOptions });
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
    .filter((node) => controlBoundary(node).includes('var(--tai-color-border)'))
    .map((node) => `${node.tagName.toLowerCase()}: ${node.textContent}`);
}

/**
 * The boundary a control actually draws. `borderColor` comes FIRST: it is what a
 * `border-color` declaration and the `border` shorthand both resolve to, so a
 * control naming the decorative token either way is seen. Matching the raw
 * `style` attribute against `border:` alone let every longhand through.
 */
export function controlBoundary(node: HTMLElement): string {
  return node.style.borderColor || node.style.border;
}
