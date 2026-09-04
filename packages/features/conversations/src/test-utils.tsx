/**
 * Test harness: render a unit in the exact provider stack the shell supplies at
 * runtime — a retry-disabled TanStack Query client (so a rejected query surfaces
 * its error state immediately), the SDK's `ApiProvider` fed a stub client, the
 * theme, and a `NavigationProvider` whose `navigate` is a spy so URL writes can
 * be asserted. Only test dependencies are imported; no production module is
 * stubbed.
 */
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

import type {
  ApiClient,
  ConversationMessage,
  ConversationRoute,
  ConversationThread,
} from '@tai42/api-client';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import type { NavigateOptions, NavigationContextValue, RouteSearch } from '@tai42/studio-sdk';

import type { ConversationsSearch } from './search';

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
  readonly queryClient: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { client }: { readonly client: StubApiClient },
): RenderWithProvidersResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const navigate = vi.fn();
  const apiClient = client as ApiClient;
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
      <ApiProvider value={apiClient}>
        <ThemeProvider>
          <NavigationProvider value={navigation}>{children}</NavigationProvider>
        </ThemeProvider>
      </ApiProvider>
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
  }: { readonly client: StubApiClient; readonly initialSearch: ConversationsSearch },
): RenderWithLiveUrlResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const apiClient = client as ApiClient;
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
        <ApiProvider value={apiClient}>
          <ThemeProvider>
            <NavigationProvider value={value}>{page(search)}</NavigationProvider>
          </ThemeProvider>
        </ApiProvider>
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

export function makeRoute(overrides: Partial<ConversationRoute> = {}): ConversationRoute {
  return {
    route_name: 'chat',
    door: 'channel',
    target_kind: 'agent',
    target_name: 'assistant',
    payload_expr: null,
    reply_expr: null,
    initial_mode: 'agent',
    execution_key: 'svc-chat',
    channel: 'whatsapp',
    our_identity: '+15550000000',
    callback_url: null,
    turns_per_hour_override: null,
    error_reply_text: null,
    execution_key_fingerprint: 'fp-1',
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

export function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    message_id: 'm1',
    route_name: 'chat',
    door: 'channel',
    thread_id: 'svc-chat/+15551234567',
    client_address: '+15551234567',
    caller_principal: null,
    inbound_text: 'where is my request',
    answer_status: 'answered',
    answer: 'It completes tomorrow.',
    origin: 'client',
    delivery_status: 'delivered',
    created_at: 1_800_000_000,
    updated_at: 1_800_000_001,
    ...overrides,
  };
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
  }: {
    nextPage?: number | null;
    pageNumber?: number;
    order?: 'asc' | 'desc';
    truncated?: boolean;
  } = {},
) {
  return { ...page(items, nextPage, pageNumber, truncated), order };
}
