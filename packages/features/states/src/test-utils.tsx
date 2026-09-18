/**
 * Test harness for the states feature. `renderWithProviders` wraps the unit under
 * test in the exact provider stack the shell supplies at runtime — a retry-disabled
 * TanStack Query client, the SDK's raw `ApiProvider` (a stub client, passed via
 * `value=`), `ThemeProvider`, `SystemKindsProvider` (so `useFeatureOff('states')`
 * reads a seeded kind-status table), and a `NavigationProvider` whose `navigate` is a
 * spy. Only test dependencies are imported here; no production module is stubbed.
 */
import type { ApiClient, KindStatus } from '@tai42/api-client';
import {
  ApiProvider,
  AuthProvider,
  NavigationProvider,
  SystemKindsProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { expect, type Mock, vi } from 'vitest';

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

/** The last hidden file input under `container` (the template upload sits after the list one). */
export function lastFileInput(container: HTMLElement): HTMLInputElement {
  const els = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const el = els[els.length - 1];
  if (el === undefined) throw new Error('no file input found');
  return el;
}

/**
 * The nearest concrete `pointer-events` declaration blocks interaction — walking
 * from `element` up, the first ancestor that declares a real value decides, and
 * `none` there means blocked. This is the exact gate user-event asserts before a
 * pointer interaction, so a control that clears it here cannot then throw.
 */
function pointerEventsBlocked(element: Element): boolean {
  const view = element.ownerDocument.defaultView ?? globalThis;
  for (let el: Element | null = element; el?.ownerDocument; el = el.parentElement) {
    const declared = view.getComputedStyle(el).pointerEvents;
    if (declared && declared !== 'inherit' && declared !== 'unset') {
      return declared === 'none';
    }
  }
  return false;
}

/**
 * Clicks a control once it is truly interactable. A Radix Dialog marks the rest of
 * the page inert the moment it opens — `pointer-events: none` on `document.body` —
 * and re-enables its own panel on a following commit; a click fired in that gap
 * lands on a control that still inherits `pointer-events: none`, which user-event
 * refuses. Awaiting both the enabled state and a cleared pointer-events gate closes
 * that window, so a dialog button clicked right after the dialog opens (or right
 * after a mutation re-enables it) is deterministic rather than timing-dependent.
 */
export async function clickWhenInteractable(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
): Promise<void> {
  await waitFor(() => {
    expect(element).toBeEnabled();
    expect(pointerEventsBlocked(element)).toBe(false);
  });
  await user.click(element);
}
