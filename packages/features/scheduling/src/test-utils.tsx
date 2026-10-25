/**
 * Shared test harness: render a feature tree inside the exact provider stack the
 * shell supplies at runtime — a fresh QueryClient (retries off so a rejected query
 * surfaces the error state immediately), `AuthProvider` + `CapabilityProvider`, the
 * typed API client, the theme, and a stub navigation context.
 *
 * A `projection` seeds the capability context to `ready`: a session key is set so
 * `AuthProvider` is authenticated and `CapabilityProvider` fetches a stubbed `getMe`.
 * With no projection the context stays `loading`, so the execution-key field is
 * pending and its list is not read.
 */
import type { ApiClient, MeProjection, ScheduleListRow, ToolTagEntry } from '@tai42/api-client';
import { servedConstants } from '@tai42/api-client';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { expect, vi } from 'vitest';

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly client: ApiClient;
  readonly projection?: MeProjection;
}

/** The session key `useAuth` reads/writes; set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

export function renderWithProviders(ui: ReactNode, options: ProviderOptions): RenderResult {
  const { client, projection, ...renderOptions } = options;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (projection !== undefined) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  const apiClient =
    projection !== undefined ? { ...client, getMe: () => Promise.resolve(projection) } : client;

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

/**
 * Build a mock `ApiClient` from a partial set of methods; the feature only ever
 * touches the scheduling seams, so unstubbed methods are irrelevant to these
 * tests (a call to one that was not provided throws, surfacing the omission).
 *
 * The add dialog's picker enriches with the tool tags + tool_meta overlay to drop
 * effective-hidden tools; those two reads are best-effort, so they get a benign
 * empty default here and a test overrides them only when it exercises the exclusion.
 */
export function makeClient(overrides: Partial<ApiClient>): ApiClient {
  return {
    // The served platform constants the injected client carries (the SDK reads them).
    constants: servedConstants,
    listToolTags: vi.fn(() => Promise.resolve([])),
    listToolMeta: vi.fn(() => Promise.resolve({ folders: [], meta: [] })),
    // The add-schedule dialog reads the key list under a checked binding; default it to
    // an empty list so a test that does not exercise the picker needs no stub.
    listTokensPayload: vi.fn(() => Promise.resolve([])),
    ...overrides,
  } as ApiClient;
}

/**
 * A schedule list row fixture (the typed `ScheduleListRow`: no tool arguments).
 */
export function schedule(overrides: Partial<ScheduleListRow> = {}): ScheduleListRow {
  return {
    name: 'nightly-report',
    tool: 'run_report',
    cadence: {
      kind: 'crontab',
      minute: '0',
      hour: '2',
      day_of_month: '*',
      month_of_year: '*',
      day_of_week: '*',
    },
    enabled: true,
    next_run_at_ts: null,
    next_run_at_iso: null,
    error: null,
    ...overrides,
  };
}

/** Tool-tag rows the server serves as `schedulable`, one per name. */
export function schedulableTags(...names: string[]): ToolTagEntry[] {
  return names.map((name) => ({ name, tags: [], hidden: false, badges: [], schedulable: true }));
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

/** A key session's projection with access control on (`owner_user_id` set, that owner as `principal`). */
export function keySessionProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return {
    access_control_enabled: true,
    user_id: 'alice-key',
    owner_user_id: 'alice',
    principal: { user_id: 'alice', display_name: 'Alice', kind: 'human' },
    admin: false,
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

/** An account session's projection: the account `alice` itself (no owner claim, its own `principal`). */
export function accountSessionProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return keySessionProjection({ user_id: 'alice', owner_user_id: null, ...overrides });
}

/** A deployment with access control off: every session is the fill identity `__no_auth__`. */
export function gateOffProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return keySessionProjection({
    access_control_enabled: false,
    user_id: '__no_auth__',
    owner_user_id: null,
    principal: null,
    admin: true,
    ...overrides,
  });
}
