/**
 * Test harness for the interactions feature.
 *
 * `renderWithProviders` mounts a feature tree in the exact provider stack the
 * shell supplies at runtime: a fresh QueryClient (retries off so a rejected
 * mutation surfaces its error immediately), the typed API client, the theme, and a
 * stub navigation context.
 *
 * `makeChannel` builds a scripted SSE stream: a client whose `streamInteractions`
 * returns its async iterator, and `emitFrame` pushes a live `interaction.add` /
 * `.answered` / `.removed` frame into it (the tail-only stream carries no backlog)
 * and flushes React so assertions see the result. The paged pending base is the
 * `listInteractions` stub (`interactionsPage` builds a page).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

import type { ApiClient, Interaction, InteractionsPage, MeProjection } from '@tai42/api-client';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';

// Aliased so the `InteractionsPage` response TYPE (above) is not shadowed by the page
// component the inbox render helper mounts.
import { InteractionsPage as InteractionsPageComponent } from './interactions';

// -- provider stack ----------------------------------------------------------

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly client: ApiClient;
  readonly projection?: MeProjection;
  /**
   * A controllable `getMe`, for a test that must observe the projection RESOLVING
   * (e.g. driving it through a deferred to assert the ready branch is exercised).
   * Supersedes `projection`; supplying either authenticates the session.
   */
  readonly getMe?: ApiClient['getMe'];
}

/** The session key `AuthProvider` seeds from, set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

export function renderWithProviders(ui: ReactNode, options: ProviderOptions): RenderResult {
  const { client, projection, getMe, ...renderOptions } = options;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  // A projection (or explicit `getMe`) drives the capability context to `ready`:
  // seed a session key so `AuthProvider` is authenticated and `CapabilityProvider`
  // fetches `getMe`. With neither the context stays `loading` and the page renders
  // unfiltered.
  const authenticated = projection !== undefined || getMe !== undefined;
  if (authenticated) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  const resolveMe =
    getMe ?? (projection !== undefined ? () => Promise.resolve(projection) : undefined);
  const apiClient = resolveMe !== undefined ? { ...client, getMe: resolveMe } : client;

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

// -- scripted SSE stream -----------------------------------------------------

/** The SSE frame shape `useInteractionsStream` reads (`event` + `data`). */
export interface Frame {
  readonly event: string;
  readonly data: string;
}

export interface StreamChannel {
  /** Push one SSE frame; delivered to the live async iterator (or buffered). */
  emit(event: string, data: string): void;
  /** End the stream (the iterator returns). */
  close(): void;
  /** The async iterator `streamInteractions` hands to the hook. */
  readonly iterator: AsyncGenerator<Frame>;
}

/**
 * A single-consumer async channel: `emit` either wakes the iterator's pending
 * `next()` or buffers until it asks, so a frame emitted before the hook starts
 * iterating is never lost.
 */
export function makeChannel(): StreamChannel {
  const buffer: Frame[] = [];
  let waiting: ((result: IteratorResult<Frame>) => void) | null = null;
  let closed = false;

  async function* generate(): AsyncGenerator<Frame> {
    for (;;) {
      const buffered = buffer.shift();
      if (buffered !== undefined) {
        yield buffered;
        continue;
      }
      if (closed) return;
      const next = await new Promise<IteratorResult<Frame>>((resolve) => {
        waiting = resolve;
      });
      if (next.done === true) return;
      yield next.value;
    }
  }

  return {
    emit(event, data) {
      const frame: Frame = { event, data };
      if (waiting !== null) {
        const resolve = waiting;
        waiting = null;
        resolve({ value: frame, done: false });
      } else {
        buffer.push(frame);
      }
    },
    close() {
      closed = true;
      if (waiting !== null) {
        const resolve = waiting;
        waiting = null;
        resolve({ value: undefined, done: true });
      }
    },
    iterator: generate(),
  };
}

/** Build a page of the pending inbox (`GET /api/interactions`). */
export function interactionsPage(
  items: readonly Interaction[] = [],
  extra: { total?: number; page?: number; next_page?: number | null } = {},
): InteractionsPage {
  return {
    items: [...items],
    total: extra.total ?? items.length,
    page: extra.page ?? 1,
    page_size: 50,
    next_page: extra.next_page ?? null,
    truncated: false,
  };
}

/**
 * A stub `ApiClient` exposing only the methods this feature consumes:
 * `streamInteractions` (the scripted live tail), `listInteractions` (the paged
 * pending base — defaults to an empty page so a plain inbox test starts empty),
 * `answerInteraction`, `cancelInteraction` (the withdraw door — defaults to a
 * resolved cancelled reply), and `listChannels` (the delivery-channels catalog card
 * — defaults to an empty catalog so a plain inbox test needs no channel data).
 * `baseUrl` mirrors the real client's read-only field (default '' for same-origin).
 */
export function stubClient(parts: {
  channel: StreamChannel;
  listInteractions?: ApiClient['listInteractions'];
  answerInteraction?: ApiClient['answerInteraction'];
  cancelInteraction?: ApiClient['cancelInteraction'];
  listChannels?: ApiClient['listChannels'];
  baseUrl?: string;
}): ApiClient {
  return {
    // '' for a same-origin deployment, an absolute API origin for a cross-origin
    // one; served-media refs resolve against it in the display media card.
    baseUrl: parts.baseUrl ?? '',
    streamInteractions: (_signal?: AbortSignal) => Promise.resolve(parts.channel.iterator),
    listInteractions: parts.listInteractions ?? vi.fn().mockResolvedValue(interactionsPage()),
    answerInteraction: parts.answerInteraction ?? vi.fn().mockResolvedValue(undefined),
    cancelInteraction:
      parts.cancelInteraction ??
      vi.fn().mockResolvedValue({ interaction_id: 'stub', status: 'cancelled' }),
    listChannels: parts.listChannels ?? vi.fn().mockResolvedValue({ channels: [] }),
  } as unknown as ApiClient;
}

/** JSON-encode an interaction for an SSE frame's `data` field. */
export function encodeInteraction(interaction: Record<string, unknown>): string {
  return JSON.stringify(interaction);
}

/**
 * Emit a frame and flush React so the resulting render is visible to assertions.
 * The macrotask tick drains the channel's awaiting `next()` → the hook's
 * `for await` body → the state update, all inside `act`.
 */
export async function emitFrame(
  channel: StreamChannel,
  event: string,
  data: string,
): Promise<void> {
  await act(async () => {
    channel.emit(event, data);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// -- inbox fixtures ----------------------------------------------------------

/**
 * Build the JSON `data` of an `interaction.add` SSE frame. Inputs use the concise
 * test aliases `format`/`prompt`; the emitted payload uses the real wire fields
 * the skeleton sends — `answer_format`/`question` plus the id/timestamp fields.
 */
export function interactionJson(fields: {
  interaction_id: string;
  format: string;
  prompt?: string;
  format_payload?: Record<string, unknown>;
}): string {
  return encodeInteraction({
    interaction_id: fields.interaction_id,
    group_id: `g-${fields.interaction_id}`,
    answer_format: fields.format,
    question: fields.prompt ?? '',
    format_payload: fields.format_payload ?? {},
    created_at: '2026-07-04T00:00:00Z',
    timeout_at: '2026-07-04T00:05:00Z',
  });
}

/**
 * The `data` of an `interaction.answered` / `interaction.removed` frame — the
 * skeleton sends only ids on those events, never the question fields.
 */
export function idJson(interactionId: string): string {
  return encodeInteraction({ interaction_id: interactionId, group_id: `g-${interactionId}` });
}

/** A pending record shaped like the paged base door serves (the query seed). */
export function pendingItem(id: string, extra: Partial<Interaction> = {}): Interaction {
  return {
    interaction_id: id,
    group_id: `g-${id}`,
    answer_format: 'text',
    question: '',
    format_payload: {},
    created_at: '2026-07-04T00:00:00Z',
    timeout_at: '2026-07-04T00:05:00Z',
    sensitive: false,
    ...extra,
  };
}

/** A hand-resolved projection promise, so a test can drive `getMe` past a barrier. */
export function deferredProjection(): {
  promise: Promise<MeProjection>;
  resolve: (projection: MeProjection) => void;
} {
  let resolve!: (projection: MeProjection) => void;
  const promise = new Promise<MeProjection>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Let mount-time async effects (stream connect) settle inside `act`. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Render the inbox page wired to a fresh scripted stream. Defaults to a full
 * (admin) projection so the answer control is gated ON — the submission and
 * lifecycle tests exercise a real control; the gating tests pass their own
 * scoped/absent projection.
 */
export function renderInbox(
  answerInteraction?: ApiClient['answerInteraction'],
  projection: MeProjection = fullProjection(),
  baseUrl = '',
): {
  channel: StreamChannel;
  answer: ApiClient['answerInteraction'];
  container: HTMLElement;
} {
  const channel = makeChannel();
  const answer = answerInteraction ?? vi.fn().mockResolvedValue(undefined);
  // A populated channel catalog so the delivery-channels chrome renders badges, not
  // its empty-state marketplace anchor — these tests scan the page for the interaction
  // card's own anchor (the empty-state link is covered in ChannelsCard.test.tsx).
  const client = stubClient({
    channel,
    answerInteraction: answer,
    listChannels: vi.fn().mockResolvedValue({ channels: ['telegram'] }),
    baseUrl,
  });
  const { container } = renderWithProviders(<InteractionsPageComponent search={{}} />, {
    client,
    projection,
  });
  return { channel, answer, container };
}

/** An inert markup payload the XSS pins assert is never mounted as a live sink. */
export const XSS = "<script>window.__xss='pwned'</script>";
