/**
 * Test harness for the presets feature. `renderWithProviders` wraps the unit
 * under test in the exact provider stack the shell supplies at runtime — a
 * retry-disabled TanStack Query client, the SDK's raw `ApiProvider` (a stub
 * client, passed via `value=`), `ThemeProvider`, and a `NavigationProvider` whose
 * `navigate` is a spy. Only test dependencies are imported here; no production
 * module is stubbed.
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
import { render, type RenderResult, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { expect, type Mock, vi } from 'vitest';

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
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
  // A stateful harness can pass its own navigate spy (one that updates the search it
  // feeds back in) so a client-side selection change actually fires the focus effect.
  const navigate = navigateOverride ?? vi.fn();
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
                  navigatePlugin: vi.fn(),
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

  return { ...result, navigate, queryClient };
}

/** A sample preset record for the create-form suites. */
export const record = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: 'Paris weather',
  active_version: 1,
  extensions: [],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
  uses: [],
  used_by: [],
};

/** A stub client defaulting every read the create form touches. */
export function baseClient(overrides: StubApiClient = {}): StubApiClient {
  return {
    listTools: vi.fn().mockResolvedValue(['weather']),
    listPresets: vi.fn().mockResolvedValue([]),
    listToolTags: vi.fn().mockResolvedValue([]),
    listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }),
    upsertToolMeta: vi.fn().mockResolvedValue({
      tool_name: 'paris_weather',
      display_name: null,
      folder_id: null,
      tags: ['geo'],
      hidden: null,
    }),
    listExtensions: vi.fn().mockResolvedValue([]),
    listAgents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getEnvConfig: vi.fn().mockResolvedValue({
      env: { SERVICE_API_TOKEN: 's3cr3t' },
      secret_keys: ['SERVICE_API_TOKEN'],
    }),
    getToolSchema: vi.fn().mockResolvedValue({
      input: { type: 'object', properties: {}, required: [] },
      output: null,
      description: null,
    }),
    ...overrides,
  };
}

/**
 * Opens the base-tool picker once its tool list has loaded. The picker renders
 * disabled while `listTools` is pending; clicking then lands on an inert control
 * and no listbox opens, so wait for the enabled state before opening it.
 */
export async function openBasePicker(
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> {
  const combobox = await screen.findByRole('combobox');
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

/**
 * Selects a base tool from the picker. The " (agent)" labels and the kwargs hint
 * come from reads that run only once a base is chosen (the agents read and the
 * base-schema read), so a test that asserts either picks a base with this helper
 * first and reopens the picker to read the labelled options. Tag grouping, the
 * effective-hidden exclusion and badges come from the tag + overlay reads, which run
 * on the empty form, so they need no pick.
 */
export async function pickBase(
  user: ReturnType<typeof userEvent.setup>,
  optionName = 'weather',
): Promise<void> {
  await openBasePicker(user);
  await user.click(await screen.findByRole('option', { name: optionName }));
}

/** Name + base only — used by the validate tests (an empty description is valid to validate). */
export async function fillNameAndBase(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByPlaceholderText('paris_weather'), 'paris_weather');
  await pickBase(user);
}

/** Name + base + description — the full gate a create must clear before submit. */
export async function fillCreatable(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await fillNameAndBase(user);
  await user.type(screen.getByPlaceholderText('Paris weather'), 'Paris weather');
}

/** A preset detail record for the detail-panel suites. */
export const detail = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: 'Paris weather',
  active_version: 7,
  extensions: [],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
  uses: [],
  used_by: [],
  fixed_kwargs: { city: 'Paris' },
};

/** An empty overlay map — the default for tests that don't exercise overlay details. */
export const emptyMeta = { folders: [], meta: [] };

/** The current-version list a detail panel reads to seed the save-version binding. */
export const versions = [
  {
    version: 2,
    body: {
      base_tool: 'weather',
      description: 'Paris weather',
      fixed_kwargs: { city: 'Paris' },
      extensions: [],
      tags: ['geo'],
      output_schema: null,
    },
    tags: [],
    created_at: 'now',
    is_current: true,
  },
];
