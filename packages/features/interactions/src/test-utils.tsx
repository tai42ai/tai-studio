/**
 * Test harness for the interactions feature.
 *
 * `renderWithProviders` mounts a feature tree in the exact provider stack the
 * shell supplies at runtime: a fresh QueryClient (retries off so a rejected
 * mutation surfaces its error immediately), the typed API client, the theme, and a
 * stub navigation context.
 *
 * `makeChannel` builds a scripted SSE stream: a client whose `streamInteractions`
 * returns its async iterator, and `emitFrame` pushes an `interaction.add` /
 * `.answered` / `.removed` / `.backlog_done` frame into it (matching the frame
 * shape `useInteractionsStream` consumes) and flushes React so assertions see the
 * result.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, type RenderOptions, type RenderResult } from '@testing-library/react';
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
  const apiClient =
    resolveMe !== undefined ? ({ ...client, getMe: resolveMe } as ApiClient) : client;

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

/**
 * A stub `ApiClient` exposing only the methods this feature consumes:
 * `streamInteractions` (the scripted channel), `answerInteraction`, and
 * `listChannels` (the delivery-channels catalog card mounted on the page —
 * defaults to an empty catalog so a plain inbox test needs no channel data).
 */
export function stubClient(parts: {
  channel: StreamChannel;
  answerInteraction?: ApiClient['answerInteraction'];
  listChannels?: ApiClient['listChannels'];
}): ApiClient {
  return {
    streamInteractions: (_signal?: AbortSignal) => Promise.resolve(parts.channel.iterator),
    answerInteraction: parts.answerInteraction ?? vi.fn().mockResolvedValue(undefined),
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
