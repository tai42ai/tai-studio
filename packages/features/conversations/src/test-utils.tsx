/**
 * Test harness: render a unit in the exact provider stack the shell supplies at
 * runtime — a retry-disabled TanStack Query client (so a rejected query surfaces
 * its error state immediately), the SDK's `ApiProvider` fed a stub client, the
 * auth + capability contexts (so a unit's write-gated affordances resolve), the
 * theme, and a `NavigationProvider` whose `navigate` is a spy so URL writes can
 * be asserted. Only test dependencies are imported; no production module is
 * stubbed.
 *
 * The write affordances (route/config create-edit-delete, thread delete, person
 * erasure) gate on the caller's capability projection. A test that exercises one
 * passes a `projection`: it seeds a session key so `CapabilityProvider` fetches it and
 * reaches `ready` (pass {@link fullProjection} to show every write, a scoped one to
 * assert it withdrawn). With NO projection the capability context stays `loading` and
 * every write affordance fails closed (hidden) — the shape every read-only test
 * expects, and the reason a render that never touches a write control drives no
 * capability fetch (so it schedules no late state update to warn about).
 */
import {
  type AgentListing,
  type ApiClient,
  type Channels,
  type ConversationMessage,
  type ConversationRouteView,
  type ConversationThread,
  type MeProjection,
  schemas,
  servedConstants,
  type TargetConversationConfig,
  type TokensPayload,
} from '@tai42/api-client';
import type { NavigateOptions, NavigationContextValue, RouteSearch } from '@tai42/studio-sdk';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult, screen, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { expect, type Mock, vi } from 'vitest';

import type { ConversationsSearch } from './search';

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

/** The session key `AuthProvider` seeds from, set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

/** A total (admin) projection: every write reachable — the behavioural-test default. */
export function fullProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, admin: true, ...overrides };
}

/** A scoped (non-admin) projection restricted to the given routes/patterns. */
export function scopedProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, ...overrides };
}

const baseProjection: MeProjection = {
  access_control_enabled: true,
  user_id: 'u-test',
  owner_user_id: null,
  principal: null,
  admin: false,
  public_resource_id: 'public',
  scopes: [],
  routes: [],
  route_patterns: [],
  sub_mcp: [],
  tools: [],
  agents: [],
  mintable: false,
};

/**
 * Fold capability wiring into the stub. When a `projection` is given, seed the session
 * key and a `getMe` returning it so `AuthProvider` authenticates and `CapabilityProvider`
 * fetches to `ready` (a test may still override `getMe` in its own client). With no
 * projection, clear the key so the context stays `loading` and no fetch fires — no late
 * state update, so a read-only render schedules nothing outside the test's `act`.
 */
function withCapabilities(client: StubApiClient, projection: MeProjection | undefined): ApiClient {
  if (projection === undefined) {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
    return { constants: servedConstants, ...client } as ApiClient;
  }
  globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  return {
    constants: servedConstants,
    getMe: () => Promise.resolve(projection),
    ...client,
  } as ApiClient;
}

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
  readonly queryClient: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    client,
    projection,
    seed,
  }: {
    readonly client: StubApiClient;
    readonly projection?: MeProjection;
    /** Fills the query cache before the first render, as another screen's earlier read would. */
    readonly seed?: (queryClient: QueryClient) => void;
  },
): RenderWithProvidersResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  seed?.(queryClient);
  const navigate = vi.fn();
  const apiClient = withCapabilities(client, projection);
  // Built ONCE, as the shell builds it — `createNavigation` runs at app assembly,
  // not per render. A fresh literal per render would hand every feature a new
  // `navigate` identity each time, which is a re-run of every effect that depends
  // on one and a fidelity the running app does not have.
  const navigation: NavigationContextValue = {
    navigate,
    resolvePath: () => '/conversations',
    navigatePlugin: vi.fn(),
    resolvePluginPath: () => '/conversations',
  };

  // The stack is a `wrapper`, not part of the rendered element: RTL's `rerender`
  // replaces only the element, so a wrapper keeps the providers (and the query
  // cache) alive across a re-render with new props.
  const wrapper = ({ children }: { readonly children: ReactNode }): ReactElement => (
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

  const result = render(ui, { wrapper });

  return { ...result, navigate, queryClient };
}

export interface RenderWithLiveUrlResult extends RenderResult {
  /**
   * The committed session history, oldest entry first. A plain navigate APPENDS
   * (Back would return to the entry before it); one asking for `replace`
   * overwrites the last entry, leaving the depth where it was — which is what a
   * test asserting "this navigation is not a place Back can return to" measures.
   */
  readonly history: ConversationsSearch[];
}

/**
 * The same stack under a LIVE url: `navigate` writes the committed search back
 * into the `search` the page renders from, and records the history entry it
 * committed, exactly as the shell's router does. The spy harness above never
 * feeds a commit back, so a drill that depends on the URL it just wrote looks
 * inert there while working in the running app.
 */
export function renderWithLiveUrl(
  page: (search: ConversationsSearch) => ReactElement,
  {
    client,
    initialSearch,
    projection,
  }: {
    readonly client: StubApiClient;
    readonly initialSearch: ConversationsSearch;
    readonly projection?: MeProjection;
  },
): RenderWithLiveUrlResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const apiClient = withCapabilities(client, projection);
  const history: ConversationsSearch[] = [initialSearch];

  function Harness(): ReactElement {
    const [search, setSearch] = useState<ConversationsSearch>(initialSearch);
    const value = useMemo<NavigationContextValue>(
      () =>
        ({
          navigate: (
            _token: string,
            next?: RouteSearch<'conversations'>,
            options?: NavigateOptions,
          ) => {
            const committed = next ?? {};
            if (options?.replace === true) history[history.length - 1] = committed;
            else history.push(committed);
            setSearch(committed);
          },
          resolvePath: () => '/conversations',
          navigatePlugin: vi.fn(),
          resolvePluginPath: () => '/conversations',
        }) as NavigationContextValue,
      [],
    );
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ApiProvider value={apiClient}>
            <CapabilityProvider>
              <ThemeProvider>
                <NavigationProvider value={value}>{page(search)}</NavigationProvider>
              </ThemeProvider>
            </CapabilityProvider>
          </ApiProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  return { ...render(<Harness />), history };
}

/**
 * Pin the viewport band `useBreakpoint` reads. jsdom ships no `matchMedia`, so
 * the hook resolves to `full` (two panes); a single-pane case installs one.
 * Returns the teardown.
 */
export function installViewportBand(band: 'compact' | 'full'): () => void {
  const original = Reflect.get(globalThis, 'matchMedia') as unknown;
  const matches = band === 'compact';
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: matches && query.includes('1023'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  return () => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, 'matchMedia');
      return;
    }
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      writable: true,
      value: original,
    });
  };
}

// -- fixtures ----------------------------------------------------------------

export function makeRoute(overrides: Partial<ConversationRouteView> = {}): ConversationRouteView {
  // A fixture spreads door-specific overrides over a channel row, so the result is asserted
  // as the door union it stands for.
  return {
    route_name: 'chat',
    door: 'channel',
    target_kind: 'agent',
    target_name: 'assistant',
    start_expr: null,
    reply_expr: null,
    cancel_expr: null,
    resume_expr: null,
    extras_expr: null,
    initial_mode: 'agent',
    execution_key: 'svc-chat',
    channel: 'whatsapp',
    our_identity: '+15550000000',
    callback_url: null,
    turns_per_hour_override: null,
    reply_texts: null,
    execution_key_fingerprint: 'fp-1',
    locale: null,
    overlap: { running: 'continue', deliver: 'one', settle_seconds: 0 },
    ...overrides,
  } as ConversationRouteView;
}

export function makeConfig(
  overrides: Partial<TargetConversationConfig> = {},
): TargetConversationConfig {
  return {
    target_kind: 'agent',
    target_name: 'assistant',
    multichannel: false,
    greeting_template: null,
    ...overrides,
  };
}

export function makeThread(overrides: Partial<ConversationThread> = {}): ConversationThread {
  return {
    thread_id: 'svc-chat/+15551234567',
    client_address: '+15551234567',
    last_activity_at: 1_800_000_000,
    message_count: 2,
    last_delivery_status: 'delivered',
    ...overrides,
  };
}

/** A record as the server may send it: its defaulted fields may be left out. */
type ConversationMessageInput = (typeof schemas.conversationMessage)['_zod']['input'];

export function makeMessage(
  overrides: Partial<ConversationMessageInput> = {},
): ConversationMessage {
  // Parsed through the record schema, so the fixture carries every field the server
  // publishes (the defaulted ones at their defaults).
  return schemas.conversationMessage.parse({
    message_id: 'm1',
    route_name: 'chat',
    door: 'channel',
    thread_id: 'svc-chat/+15551234567',
    client_address: '+15551234567',
    caller_principal: null,
    inbound_text: 'where is my request',
    inbound_attachments: null,
    answer_status: 'answered',
    answer: 'It completes tomorrow.',
    successor_id: null,
    origin: 'client',
    delivery_status: 'delivered',
    created_at: 1_800_000_000,
    updated_at: 1_800_000_001,
    ...overrides,
  });
}

/** One page of results, shaped as the paged read doors return it. */
export function page<T>(
  items: T[],
  nextPage: number | null = null,
  pageNumber = 1,
  truncated = false,
) {
  return {
    items,
    total: items.length,
    page: pageNumber,
    page_size: 50,
    next_page: nextPage,
    truncated,
    unreadable: 0,
  };
}

/**
 * One transcript page. The door echoes the direction it was read in, and the
 * monitor always reads `desc` — page 1 is the newest page — so that is the
 * default here too.
 */
export function transcriptPage<T>(
  items: T[],
  {
    nextPage = null,
    pageNumber = 1,
    order = 'desc',
    truncated = false,
    personId = null,
  }: {
    nextPage?: number | null;
    pageNumber?: number;
    order?: 'asc' | 'desc';
    truncated?: boolean;
    personId?: string | null;
  } = {},
) {
  return { ...page(items, nextPage, pageNumber, truncated), order, person_id: personId };
}

// -- execution-key sessions and picker reads ---------------------------------

const ALICE = { user_id: 'alice', display_name: 'Alice', kind: 'human' } as const;

/** A non-admin key session: the api key `alice-key`, owned by the account `alice`. */
export function keySessionProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return {
    ...baseProjection,
    user_id: 'alice-key',
    owner_user_id: 'alice',
    principal: ALICE,
    ...overrides,
  };
}

/** A non-admin account session: the account `alice` itself, which the key picker cannot offer. */
export function accountSessionProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return {
    ...baseProjection,
    user_id: 'alice',
    owner_user_id: null,
    principal: ALICE,
    ...overrides,
  };
}

/** An admin key session: the api key `root-key`, owned by the account `root`. */
export function adminKeySessionProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return {
    ...baseProjection,
    admin: true,
    user_id: 'root-key',
    owner_user_id: 'root',
    principal: { user_id: 'root', display_name: 'Root', kind: 'human' },
    ...overrides,
  };
}

/** A deployment with access control off: every session is the fill identity `__no_auth__`. */
export function gateOffProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return {
    ...baseProjection,
    access_control_enabled: false,
    user_id: '__no_auth__',
    admin: true,
    ...overrides,
  };
}

/** One row of the api-key list. */
export function apiKey(overrides: Partial<TokensPayload[number]> = {}): TokensPayload[number] {
  return {
    user_id: 'svc-events',
    description: '',
    scopes: [],
    policy_data: {},
    condition: null,
    principal: null,
    orphaned: false,
    ...overrides,
  };
}

/** The registered-agent list holding `names`. */
export function agentListing(names: readonly string[]): AgentListing {
  return {
    items: names.map((name) => ({
      name,
      description: '',
      tool_name: `run_${name}`,
      input_schema: {},
      spec_runnable: false,
    })),
    total: names.length,
  };
}

/** The installed-channel list: each entry a name and its declared identity hint. */
export function channelListing(
  entries: readonly (readonly [name: string, hint: string | null])[],
): Channels {
  return { channels: entries.map(([name, hint]) => ({ name, identity_hint: hint })) };
}

/**
 * Opens a named combobox once it is enabled: a picker over a pending read renders a
 * disabled control, and a click on it opens no listbox.
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

/** Opens a named combobox and picks the named option. */
export async function pickOption(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp | string,
  option: RegExp | string,
): Promise<void> {
  await openSelect(user, name);
  await user.click(await screen.findByRole('option', { name: option }));
}
