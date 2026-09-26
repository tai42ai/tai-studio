/**
 * Render harness for the MCP-servers section tests (moved here with the section from
 * the manifest feature). It composes the exact provider stack the shell supplies — a
 * retry-free TanStack Query client, the raw `ApiProvider` carrying a stub client, the
 * auth + capability contexts (so the section's write-gated affordances resolve), the
 * theme, and a stub navigation surface — so the section renders against real providers
 * with a fake transport. Kept separate from `test-utils` because the MCP tests drive
 * a PARTIAL client (and sometimes their own QueryClient), a different shape from the
 * provider/OAuth tests' full-client harness.
 *
 * The MCP-servers section write affordances (the config Save, the failed-server
 * Reload/Deregister, Reload-all) gate on the caller's capability projection, so this
 * harness drives that projection to `ready`: it defaults to a total (admin) projection
 * — every write reachable, the shape the behavioural tests assume — and seeds a session
 * key so `CapabilityProvider` fetches it. A gating test overrides `projection` (a scoped
 * or read-only one) to assert an affordance is withdrawn.
 */
import type { MeProjection } from '@tai42/api-client';
import type { ApiClient } from '@tai42/studio-sdk';
import type { NavigationContextValue } from '@tai42/studio-sdk';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

/** The session key `AuthProvider` seeds from, set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

/** An empty fleet report — a `listFailedMcps` read with no failed servers, so the
 *  failed-servers health section renders nothing. A test that exercises that section
 *  overrides `listFailedMcps` explicitly. */
const emptyFailedReport = {
  op: 'list_failed_mcps',
  reachable: true,
  local_only: true,
  results: [],
  error: null,
};

/** The render result plus the transitions the shell's `NavigationProvider` wraps, so a
 *  guard test can assert whether a navigation was allowed through or held. */
export interface McpRenderResult extends RenderResult {
  readonly navigate: ReturnType<typeof vi.fn>;
}

export function renderWithProviders(
  ui: ReactNode,
  {
    client,
    queryClient,
    projection = fullProjection(),
  }: { client: Partial<ApiClient>; queryClient?: QueryClient; projection?: MeProjection },
): McpRenderResult {
  // A caller can supply its own client (to drive a background cache update via
  // `setQueryData` in-test); otherwise a fresh, retry-free one is used.
  const resolvedQueryClient =
    queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A FRESH navigation per render (not a shared module singleton), so a guard test's
  // navigate-call assertions never carry over between renders. The real
  // `NavigationProvider` wraps these behind the dirty-editor guard.
  const navigate = vi.fn();
  const navigation: NavigationContextValue = {
    navigate,
    resolvePath: () => '/x',
    navigatePlugin: vi.fn(),
    resolvePluginPath: () => '/x',
  };
  // Seed a session key so `AuthProvider` is authenticated and `CapabilityProvider`
  // fetches `getMe` (the supplied projection), reaching `ready` so the write gates
  // resolve.
  globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  // The failed-servers section reads `listFailedMcps` on every mount, so default it to
  // an empty roster unless the test stubs it — existing tests that never touched the
  // failed section keep rendering without a spurious read failure. `getMe` resolves the
  // capability projection; a test may still override it.
  const merged: Partial<ApiClient> = {
    listFailedMcps: vi.fn().mockResolvedValue(emptyFailedReport),
    getMe: () => Promise.resolve(projection),
    ...client,
  };
  const result = render(
    <QueryClientProvider client={resolvedQueryClient}>
      {/* The stub only implements the methods each test exercises; the section reads
          nothing else, so widening the partial stub to the full client is safe. */}
      <AuthProvider>
        <ApiProvider value={merged as ApiClient}>
          <CapabilityProvider>
            <ThemeProvider>
              <NavigationProvider value={navigation}>{ui}</NavigationProvider>
            </ThemeProvider>
          </CapabilityProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return Object.assign(result, { navigate });
}

/** A total (admin) projection: every write reachable. */
export function fullProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, admin: true, ...overrides };
}

/** A scoped (non-admin) projection restricted to the given routes/patterns. */
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

/** The dirty-guard discard prompt (the shared ConfirmDialog's body copy). */
export const DISCARD_PROMPT = 'This editor has unsaved changes. Leaving now discards them.';

/** The MCP-ENTRY schema (`TaiMCPConfig`) as the schema route emits it: an object
 *  with a required `title` string and a required nested `config` object. */
export const MCP_SCHEMA = {
  $defs: {
    MCPConfig: {
      type: 'object',
      title: 'MCPConfig',
      properties: {
        command: { type: 'string', title: 'Command' },
      },
      required: ['command'],
    },
  },
  type: 'object',
  title: 'TaiMCPConfig',
  required: ['title', 'config'],
  properties: {
    title: { type: 'string', title: 'Title' },
    config: { $ref: '#/$defs/MCPConfig' },
  },
} as const;

export const MANIFEST = { mcp: [{ title: 'srv' }], user_tools: ['echo'] };
export const MANIFEST_CONFIGURED = {
  mcp: [{ title: 'srv', config: { command: 'run' } }],
  user_tools: ['echo'],
};

/** An MCP-entry schema carrying a secret-bearing `env` map (a string→string record)
 *  alongside the transport `title`. */
export const SECRET_SCHEMA = {
  type: 'object',
  title: 'TaiMCPConfig',
  required: ['title'],
  properties: {
    title: { type: 'string', title: 'Title' },
    env: { type: 'object', title: 'Env', additionalProperties: { type: 'string' } },
  },
} as const;

export const withEnvBlank = {
  mcp: [{ title: 'srv', env: { API_KEY: '' } }],
  user_tools: ['echo'],
};
export const withEnvMarker = {
  mcp: [{ title: 'srv', env: { API_KEY: '!ENV ${SECRET_1}' } }],
  user_tools: ['echo'],
};

export function status() {
  return { bound: { srv: ['a', 'b'] }, failed: [{ title: 'bad', status: 'timeout' }] };
}

/** A `list_failed_mcps` fleet report whose sole worker carries `entries` as its
 *  failed-server payload — the shape the dedicated `/api/mcp-status/failed` door
 *  returns and `failedMcpsFromReport` unwinds. */
export function failedReport(
  entries: {
    title: string;
    status: string;
    category?: string;
    message?: string;
    http_status?: number | null;
  }[],
) {
  return {
    op: 'list_failed_mcps',
    reachable: true,
    local_only: true,
    results: [{ name: 'serve-a', outcome: 'applied', payload: entries, error: null, detail: null }],
    error: null,
  };
}

/** A converged (lone-worker) fleet report for op `op`. */
export function fleetOk(op: string) {
  return {
    op,
    reachable: true,
    local_only: true,
    results: [{ name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null }],
    error: null,
  };
}

/** A converged config-save result carrying `env_keys`. */
export function reload(env_keys: number) {
  return { status: 'ok', env_keys, fanout: { mode: 'local-only', note: 'lone worker' } };
}
