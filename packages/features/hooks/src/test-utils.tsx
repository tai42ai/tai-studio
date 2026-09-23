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
import type {
  ApiClient,
  HookParams,
  MeProjection,
  TokensPayload,
  TriggerLinkRecord,
} from '@tai42/api-client';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { expect, type Mock, vi } from 'vitest';

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
              <NavigationProvider
                value={{
                  navigate,
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

  const result = render(ui, { wrapper });

  return { ...result, navigate, queryClient };
}

/** Build a full `HookParams` from a partial override. The gate strings default
 * to null; the `*_kwargs` maps default to {} (non-nullable in the contract). */
export function hook(overrides: Partial<HookParams> = {}): HookParams {
  return {
    name: 'notify-on-event',
    topic: 'events.created',
    tool: 'slack.post_message',
    execution_key: 'svc-events',
    execution_key_fingerprint: 'fp-events',
    tool_kwargs: {},
    subject: null,
    condition: null,
    start_expr: null,
    cancel_expr: null,
    resume_expr: null,
    extras_expr: null,
    state_binding: null,
    ...overrides,
  };
}

/** Build a full `TriggerLinkRecord` from a partial override. */
export function triggerLink(overrides: Partial<TriggerLinkRecord> = {}): TriggerLinkRecord {
  return {
    name: 'wall-poster',
    topic: 'events.created',
    execution_key: 'svc-events',
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
    user_id: 'svc-events',
    description: 'Event service key',
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

/**
 * Opens a named combobox once its option list has loaded. A picker backed by an
 * async query renders disabled while the query is pending; clicking then lands on
 * an inert control and no listbox opens, so wait for the enabled state the field
 * emits before opening it.
 */
export async function openSelect(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp | string,
): Promise<HTMLElement> {
  const combobox = await screen.findByRole('combobox', { name });
  await waitFor(() => {
    expect(combobox).toBeEnabled();
  });
  await user.click(combobox);
  return combobox;
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
