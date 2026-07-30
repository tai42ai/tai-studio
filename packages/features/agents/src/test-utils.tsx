/**
 * Test harness for the agents feature: the shell provider stack plus a stub
 * `ApiClient`. `stubClient` defaults EVERY method the `AgentsPage` touches (the
 * run stream AND the authoring reads/mutations) to a benign empty response, so a
 * test overrides only what it exercises. `hangingStream` yields a scripted event
 * sequence and then parks until its abort signal fires, so a Stop/disconnect can
 * be exercised.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

import type {
  AgentSummary,
  ApiClient,
  MeProjection,
  ParsedAgentEvent,
  PresetRecord,
  ToolTagEntry,
} from '@tai42/api-client';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';

/** The session key `AuthProvider` seeds from, set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

export function renderWithProviders(
  ui: ReactNode,
  client: ApiClient,
  { projection }: { projection?: MeProjection } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // A projection drives the capability context to `ready`: seed a session key so
  // `AuthProvider` is authenticated and `CapabilityProvider` fetches `getMe`. With
  // no projection the context stays `loading` and the page renders unfiltered.
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
                    // Encode the token + search so a test can assert a link's target.
                    resolvePath: (to, search) => {
                      const qs = search
                        ? new URLSearchParams(search as Record<string, string>).toString()
                        : '';
                      return qs ? `/${to}?${qs}` : `/${to}`;
                    },
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

  return render(ui as ReactElement, { wrapper: Wrapper });
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

/** A minimal agent summary for list/run tests. */
export function agent(overrides: Partial<AgentSummary> = {}): AgentSummary {
  return {
    name: 'faker',
    description: 'A fake agent.',
    tool_name: 'faker',
    // A declared-property object (as an agent's ToolInput emits); `prompt` is
    // optional so an empty auto-form validates and the run can start.
    input_schema: { type: 'object', properties: { prompt: { type: 'string' } } },
    spec_runnable: false,
    ...overrides,
  };
}

/** An authorable agent carrying the composable spec fields on its `ToolInput`. */
export function authorableAgent(overrides: Partial<AgentSummary> = {}): AgentSummary {
  return agent({
    name: 'authorable_agent',
    description: 'A fake authorable agent.',
    tool_name: 'authorable_agent',
    spec_runnable: true,
    input_schema: {
      type: 'object',
      properties: {
        user_message: { type: 'string', default: '' },
        system_prompt: { type: 'string', default: '' },
        tool_names: { type: 'array', items: { type: 'string' }, default: [] },
        presets: { type: 'array', default: [] },
        subagents: { type: 'array', default: [] },
        strategy: { default: null },
      },
    },
    ...overrides,
  });
}

/** A preset record (an authored agent is a preset over an agent-tool). */
export function presetRecord(overrides: Partial<PresetRecord> = {}): PresetRecord {
  return {
    name: 'support_bot',
    base_tool: 'authorable_agent',
    description: 'A helpdesk agent',
    active_version: 1,
    extensions: [],
    output_schema: null,
    conflicted: false,
    conflicted_reason: null,
    ...overrides,
  };
}

type ListAgents = () => Promise<{ items: AgentSummary[]; total: number }>;

function emptyStream(): ApiClient['streamAgentRun'] {
  return () =>
    Promise.resolve(
      (async function* (): AsyncGenerator<ParsedAgentEvent> {
        await Promise.resolve();
        for (const event of [] as ParsedAgentEvent[]) yield event;
      })(),
    );
}

/**
 * A stub client defaulting every method `AgentsPage` reads. Overrides are spread
 * last, so a test supplies only the methods it exercises.
 */
export function stubClient(parts: Partial<ApiClient> = {}): ApiClient {
  const noAgents: ListAgents = () => Promise.resolve({ items: [], total: 0 });
  return {
    listAgents: noAgents,
    listSpecRunnableAgents: noAgents,
    listPresets: () => Promise.resolve([] as PresetRecord[]),
    listTools: () => Promise.resolve([] as string[]),
    listToolTags: () => Promise.resolve([] as ToolTagEntry[]),
    // Compose writes overlay tags after a create; a benign default so a test that
    // enters tags does not have to stub the write, and the merged-map read is empty.
    listToolMeta: () => Promise.resolve({ folders: [], meta: [] }),
    upsertToolMeta: vi.fn(() =>
      Promise.resolve({
        tool_name: 'support_bot',
        display_name: null,
        folder_id: null,
        tags: [],
        hidden: null,
      }),
    ),
    streamAgentRun: emptyStream(),
    streamAuthoredAgentRun: emptyStream(),
    ...parts,
  } as unknown as ApiClient;
}

/** A `streamAgentRun`/`streamAuthoredAgentRun` that yields `events` then completes. */
export function scriptedStream(events: ParsedAgentEvent[]): ApiClient['streamAgentRun'] {
  return () =>
    Promise.resolve(
      (async function* (): AsyncGenerator<ParsedAgentEvent> {
        await Promise.resolve();
        for (const event of events) yield event;
      })(),
    );
}

/**
 * A `streamAgentRun` that yields `events` then parks until its abort signal
 * fires — leaving the run "running" so a Stop can be exercised. The captured
 * signal lets a test assert the fetch was aborted.
 */
export function hangingStream(
  events: ParsedAgentEvent[],
  captured: { signal: AbortSignal | undefined },
): ApiClient['streamAgentRun'] {
  return (_name: string, _input: unknown, signal?: AbortSignal) => {
    captured.signal = signal;
    return Promise.resolve(
      (async function* (): AsyncGenerator<ParsedAgentEvent> {
        for (const event of events) yield event;
        await new Promise<void>((resolve) => {
          if (signal === undefined) return;
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              resolve();
            },
            { once: true },
          );
        });
      })(),
    );
  };
}
