import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import {
  ApiError,
  type ApiClient,
  type FleetResult,
  type FleetWorker,
  type MeProjection,
} from '@tai42/api-client';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SystemPage } from './SystemPage';

/** The session key `AuthProvider` seeds from, set so `CapabilityProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

/**
 * Wrap UI in the full provider stack a feature page expects at runtime: a
 * retry-disabled QueryClient (so an error state lands on the first rejection
 * instead of after silent retries), the raw `ApiProvider` fed the stub client, the
 * `AuthProvider` + `CapabilityProvider` the reload control gates on, the theme
 * context the DS reads, and a stub NavigationProvider.
 *
 * `projection` drives the capability context: an admin/full projection (the
 * default) reaches the admin-only fleet reload door, so the reload control shows;
 * a scoped projection that omits it hides the reload while keeping the census
 * visible. Pass `null` to leave the context in its pre-ready `loading` state (no
 * session key → `CapabilityProvider` never fetches) — the fail-closed shape.
 */
function renderWithProviders(
  ui: ReactElement,
  {
    client,
    projection = fullProjection(),
  }: { client: ApiClient; projection?: MeProjection | null },
): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (projection !== null) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  const apiClient =
    projection !== null
      ? ({ ...client, getMe: () => Promise.resolve(projection) } as ApiClient)
      : client;
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
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
  render(ui, { wrapper });
}

/** A total (admin) projection: reaches every door, including the admin-only reload. */
function fullProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...BASE_PROJECTION, admin: true, ...overrides };
}

/** A scoped (non-admin) projection restricted to the given slice. */
function scopedProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...BASE_PROJECTION, ...overrides };
}

const BASE_PROJECTION: MeProjection = {
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

/** Find the reload-config OPEN button and wait until the capability projection has
 * enabled it — the control renders disabled (fail-closed) until the projection
 * resolves to an admin caller. */
async function findEnabledReload(name: string): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

type StubbedMethods = Pick<
  ApiClient,
  'getHealth' | 'getSystemKinds' | 'getBackendInfo' | 'listFleetWorkers' | 'reloadFleetConfig'
>;

/**
 * A stub client exposing only the system endpoints the page consumes. The backend
 * identity defaults to ABSENT (`present: false`) and the census to an empty fleet, so
 * a test that overrides neither renders the calm no-backend + no-workers states; the
 * fleet renders regardless of backend identity. `getSystemKinds` defaults
 * to a small populated table (its normal live shape) so the kinds card renders a
 * table rather than the empty state's `role="status"` node, which would otherwise
 * collide with the fleet tests that assert on the reload confirmation note.
 */
const DEFAULT_KINDS = [
  { kind: 'monitoring', state: 'default', plugin: null, detail: 'built-in fallback' },
  { kind: 'config', state: 'default', plugin: null, detail: 'file' },
];

/** One census row with sane `ready` defaults; `overrides` tunes a single field (a
 * higher generation, a transient state, a `stale: true` decayed row, a `last_op`). */
function worker(name: string, overrides: Partial<FleetWorker> = {}): FleetWorker {
  return {
    name,
    kind: 'serve',
    pid: 100,
    generation: 1,
    joined_at: '2026-08-08T00:00:00Z',
    beat_at: '2026-08-08T00:00:05Z',
    state: 'ready',
    stale: false,
    last_op: null,
    ...overrides,
  };
}

/** A bus presence census (the shape `GET /api/fleet/workers` returns). A worker's NAME
 * doubles as the reload target and the row label. */
function fleet(...names: string[]): { workers: FleetWorker[] } {
  return { workers: names.map((name, index) => worker(name, { pid: 100 + index })) };
}

/** A CONVERGED fleet-reload report — every named worker applied. An empty list is the
 * trivially-converged case the assertion-only tests use. */
function converged(...names: string[]): FleetResult {
  return {
    op: 'reload_config',
    reachable: true,
    local_only: false,
    results: names.map((name) => ({
      name,
      outcome: 'applied',
      payload: null,
      error: null,
      detail: null,
    })),
    error: null,
  };
}

function stubClient(overrides: Partial<StubbedMethods> = {}): ApiClient {
  return {
    getHealth: vi.fn().mockResolvedValue('OK'),
    getSystemKinds: vi.fn().mockResolvedValue(DEFAULT_KINDS),
    getBackendInfo: vi.fn().mockResolvedValue({ present: false, backend: null, module: null }),
    listFleetWorkers: vi.fn().mockResolvedValue(fleet()),
    reloadFleetConfig: vi.fn().mockResolvedValue(converged()),
    ...overrides,
  } as unknown as ApiClient;
}

/** A present backend identity — installs the worker fleet section. */
const PRESENT_BACKEND = {
  present: true,
  backend: 'CeleryBackend',
  module: 'plugin.backend.celery',
};

describe('SystemPage', () => {
  it('shows a healthy badge when /health returns "OK"', async () => {
    renderWithProviders(<SystemPage search={{}} />, { client: stubClient() });

    const badge = await screen.findByText('Healthy');
    expect(badge).toHaveAttribute('data-variant', 'success');
  });

  it('shows the returned text on a warning badge when /health is not "OK"', async () => {
    const client = stubClient({ getHealth: vi.fn().mockResolvedValue('DEGRADED: redis down') });
    renderWithProviders(<SystemPage search={{}} />, { client });

    const badge = await screen.findByText('DEGRADED: redis down');
    expect(badge).toHaveAttribute('data-variant', 'warning');
  });

  it('surfaces a loud error state when /health rejects', async () => {
    const client = stubClient({
      getHealth: vi.fn().mockRejectedValue(new Error('health probe failed')),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('health probe failed')).toBeInTheDocument();
  });

  // -- plugin kinds ----------------------------------------------------------

  it('renders a kind-status row with its state badge, plugin and detail', async () => {
    const client = stubClient({
      getSystemKinds: vi.fn().mockResolvedValue([
        {
          kind: 'monitoring',
          state: 'default',
          plugin: null,
          detail: 'NoOpMonitoring — no recorder plugin installed',
        },
        { kind: 'backend', state: 'active', plugin: 'plugin.backend.celery', detail: 'celery' },
        { kind: 'storage', state: 'off', plugin: null, detail: 'no provider registered' },
      ]),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    // Each state renders its own badge variant: active→success, default→warning, off→neutral.
    const monitoring = await screen.findByText('monitoring');
    const monitoringRow = monitoring.closest('tr');
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    expect(monitoringRow).not.toBeNull();
    expect(within(monitoringRow as HTMLElement).getByText('default')).toHaveAttribute(
      'data-variant',
      'warning',
    );

    const backendRow = screen.getByText('plugin.backend.celery').closest('tr');
    expect(within(backendRow as HTMLElement).getByText('active')).toHaveAttribute(
      'data-variant',
      'success',
    );

    const storageRow = screen.getByText('storage').closest('tr');
    expect(within(storageRow as HTMLElement).getByText('off')).toHaveAttribute(
      'data-variant',
      'neutral',
    );
    // A null plugin renders the em-dash placeholder, never "null".
    expect(within(storageRow as HTMLElement).getByText('—')).toBeInTheDocument();
    expect(screen.getByText('NoOpMonitoring — no recorder plugin installed')).toBeInTheDocument();
  });

  it('surfaces a loud error state when the kinds endpoint rejects', async () => {
    const client = stubClient({
      getSystemKinds: vi.fn().mockRejectedValue(new Error('kind status collector failed')),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => within(alert).queryByText('kind status collector failed'))).toBe(
      true,
    );
  });

  it('shows the calm empty state when the kinds endpoint returns no rows', async () => {
    const client = stubClient({ getSystemKinds: vi.fn().mockResolvedValue([]) });
    renderWithProviders(<SystemPage search={{}} />, { client });

    expect(await screen.findByText('No plugin kinds reported')).toBeInTheDocument();
  });

  // -- backend fleet ---------------------------------------------------------

  it('renders the worker fleet even when no backend is present (the census reads the bus)', async () => {
    const listFleetWorkers = vi.fn().mockResolvedValue(fleet('w1', 'w2', 'w3'));
    // The default identity is `present: false`; the fleet must still render.
    const client = stubClient({ listFleetWorkers });
    renderWithProviders(<SystemPage search={{}} />, { client });

    // The backend identity card shows its calm no-backend empty state…
    expect(await screen.findByText('No execution backend registered')).toBeInTheDocument();
    // …while the worker fleet renders independently — the census works over the bus.
    expect(await screen.findByText('Workers (3)')).toBeInTheDocument();
    expect(screen.getByText('w1')).toBeInTheDocument();
    expect(listFleetWorkers).toHaveBeenCalled();
  });

  it('renders the backend identity and the worker table with its count', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2', 'w3')),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    expect(await screen.findByText('CeleryBackend')).toBeInTheDocument();
    expect(await screen.findByText('Workers (3)')).toBeInTheDocument();
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    expect(screen.getByText('w1')).toBeInTheDocument();
    expect(screen.getByText('w3')).toBeInTheDocument();
  });

  it('renders the worker columns — name, kind, life, state, seen-since, last op', async () => {
    const nowIso = new Date().toISOString();
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue({
        workers: [
          worker('serve-1', {
            generation: 4,
            beat_at: nowIso,
            last_op: { op: 'reload_config', outcome: 'applied', at: '2026-08-08T00:00:05Z' },
          }),
        ],
      }),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    const nameCell = await screen.findByText('serve-1');
    const workersTable = nameCell.closest('table') as HTMLElement;
    const headers = within(workersTable)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    // The select-all checkbox header carries no text; the rest name the columns.
    expect(headers).toEqual(['', 'Name', 'Kind', 'Life', 'State', 'Seen', 'Last op']);

    const row = nameCell.closest('tr') as HTMLElement;
    // Life = the generation, a plain number.
    expect(within(row).getByText('4')).toBeInTheDocument();
    // A live ready worker reads a success-toned state badge.
    expect(within(row).getByText('ready')).toHaveAttribute('data-variant', 'success');
    // Seen-since is the relative last-beat label — a just-beaten worker reads "now".
    expect(within(row).getByText('now')).toBeInTheDocument();
    // The last-op cell reads `op · outcome`.
    expect(within(row).getByText('reload_config · applied')).toBeInTheDocument();
  });

  it('reads the state badge tone from the server flags — transient states warn, a stale row reads stale', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue({
        workers: [
          worker('serve-1', { state: 'resyncing' }),
          worker('serve-2', { state: 'recycling' }),
          // A decayed row: the server marks it stale even though it last wrote `ready`.
          worker('backend-1', { kind: 'backend', state: 'ready', stale: true }),
          // The converse: a `ready` row whose beat_at is months old but whose server
          // `stale` flag is false — the client must trust the flag, not the age.
          worker('serve-3', { state: 'ready', stale: false, beat_at: '2025-06-01T00:00:00Z' }),
        ],
      }),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    const resyncRow = (await screen.findByText('serve-1')).closest('tr') as HTMLElement;
    expect(within(resyncRow).getByText('resyncing')).toHaveAttribute('data-variant', 'warning');

    const recycleRow = screen.getByText('serve-2').closest('tr') as HTMLElement;
    expect(within(recycleRow).getByText('recycling')).toHaveAttribute('data-variant', 'warning');

    // The SERVER `stale` flag WINS over the written state: the row reads `stale`, never
    // `ready`, and the UI never recomputes freshness from a client-side threshold.
    const staleRow = screen.getByText('backend-1').closest('tr') as HTMLElement;
    expect(within(staleRow).getByText('stale')).toHaveAttribute('data-variant', 'warning');
    expect(within(staleRow).queryByText('ready')).not.toBeInTheDocument();

    // An ancient beat_at with `stale: false` still reads `ready`: there is NO client-side
    // freshness threshold that would re-mark a fresh-flagged row as stale.
    const freshRow = screen.getByText('serve-3').closest('tr') as HTMLElement;
    expect(within(freshRow).getByText('ready')).toHaveAttribute('data-variant', 'success');
    expect(within(freshRow).queryByText('stale')).not.toBeInTheDocument();
  });

  it('shows an em-dash last-op cell when a worker has applied nothing', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi
        .fn()
        .mockResolvedValue({ workers: [worker('serve-1', { last_op: null })] }),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    const row = (await screen.findByText('serve-1')).closest('tr') as HTMLElement;
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('polls the census every 5 seconds while the page is visible', async () => {
    vi.useFakeTimers();
    try {
      const listFleetWorkers = vi.fn().mockResolvedValue(fleet('serve-1'));
      const client = stubClient({
        getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
        listFleetWorkers,
      });
      renderWithProviders(<SystemPage search={{}} />, { client });

      // The initial census read — flush it without advancing the clock, so the poll
      // interval is measured from t=0.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(listFleetWorkers).toHaveBeenCalledTimes(1);

      // One tick short of 5s: the interval has NOT fired yet — the cadence is not faster.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4999);
      });
      expect(listFleetWorkers).toHaveBeenCalledTimes(1);

      // Crossing the 5000ms boundary fires the next read — the cadence is exactly 5s
      // (react-query pauses this on a hidden tab).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(listFleetWorkers).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the "No live workers" state for an empty fleet (a valid state, not an error)', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet()),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    expect(await screen.findByText('No live workers')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a loud error (never an empty fleet) when the census door 500s', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockRejectedValue(new ApiError('presence store unreachable', 500)),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('presence store unreachable')).toBeInTheDocument();
  });

  it('reloads the WHOLE fleet (targets: null) when no worker is selected', async () => {
    const reloadFleetConfig = vi.fn().mockResolvedValue(converged());
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2')),
      reloadFleetConfig,
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await findEnabledReload('Reload config (all)'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload config' }));

    await waitFor(() => {
      expect(reloadFleetConfig).toHaveBeenCalledWith(null);
    });
  });

  it('reloads only the selected workers (targets: names) when rows are checked', async () => {
    const reloadFleetConfig = vi.fn().mockResolvedValue(converged());
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2')),
      reloadFleetConfig,
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select w1' }));
    // The button label reflects the selection count.
    await userEvent.click(await findEnabledReload('Reload config (1 selected)'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload config' }));

    await waitFor(() => {
      expect(reloadFleetConfig).toHaveBeenCalledWith(['w1']);
    });
  });

  it('counts the targeted workers in real English, singular and plural', async () => {
    // `worker(s)` is not a plural: a confirm that asks to restart "1 selected
    // worker(s)" reads as machine output at the one moment the operator is being
    // asked to accept a fleet-wide restart.
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2')),
      reloadFleetConfig: vi.fn().mockResolvedValue(converged()),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select w1' }));
    await userEvent.click(await findEnabledReload('Reload config (1 selected)'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Soft-restart 1 selected worker?');
    expect(dialog.textContent).not.toContain('worker(s)');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select w2' }));
    await userEvent.click(await findEnabledReload('Reload config (2 selected)'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Soft-restart 2 selected workers?');
  });

  it('does not reload until the confirm dialog is confirmed', async () => {
    const reloadFleetConfig = vi.fn().mockResolvedValue(converged());
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1')),
      reloadFleetConfig,
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await findEnabledReload('Reload config (all)'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(reloadFleetConfig).not.toHaveBeenCalled();
  });

  it('renders a failed reload message verbatim in the confirm dialog', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1')),
      reloadFleetConfig: vi
        .fn()
        .mockRejectedValue(new ApiError("worker 'w1' did not acknowledge reload", 502)),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await findEnabledReload('Reload config (all)'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload config' }));

    expect(await screen.findByText("worker 'w1' did not acknowledge reload")).toBeInTheDocument();
  });

  it('shows a converged confirmation note and re-reads the fleet on a successful reload', async () => {
    const listFleetWorkers = vi.fn().mockResolvedValue(fleet('w1'));
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers,
      reloadFleetConfig: vi.fn().mockResolvedValue(converged('w1')),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await findEnabledReload('Reload config (all)'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload config' }));

    expect(await screen.findByText('Reload converged across the fleet.')).toBeInTheDocument();
    // The success handler invalidates the census, forcing a re-read.
    await waitFor(() => {
      expect(listFleetWorkers).toHaveBeenCalledTimes(2);
    });
  });

  it('renders the honest per-worker report when a reload does not fully converge', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2')),
      reloadFleetConfig: vi.fn().mockResolvedValue({
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [
          { name: 'w1', outcome: 'applied', payload: null, error: null, detail: null },
          {
            name: 'w2',
            outcome: 'timed_out',
            payload: null,
            error: null,
            detail: 'no ack within the window',
          },
        ],
        error: null,
      }),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await findEnabledReload('Reload config (all)'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload config' }));

    // A stranded sibling is a loud, visible state — never faked success.
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/did not converge/)).toBeInTheDocument();
    // This is the reload action, not a save — the copy must not claim a save happened
    // nor point back at the System page the operator is already on.
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    expect(within(alert).queryByText(/from the System page/)).not.toBeInTheDocument();
    expect(within(alert).getByText('w2')).toBeInTheDocument();
  });

  it('selects every worker via the header checkbox and reloads the full selection', async () => {
    const reloadFleetConfig = vi.fn().mockResolvedValue(converged());
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2', 'w3')),
      reloadFleetConfig,
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select all workers' }));
    await userEvent.click(await findEnabledReload('Reload config (3 selected)'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload config' }));

    await waitFor(() => {
      expect(reloadFleetConfig).toHaveBeenCalledWith(['w1', 'w2', 'w3']);
    });
  });

  it('drops a deselected row from the reload targets', async () => {
    const reloadFleetConfig = vi.fn().mockResolvedValue(converged());
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2')),
      reloadFleetConfig,
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select w1' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select w2' }));
    // Deselecting w1 leaves only w2 in the payload.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select w1' }));

    await userEvent.click(await findEnabledReload('Reload config (1 selected)'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload config' }));

    await waitFor(() => {
      expect(reloadFleetConfig).toHaveBeenCalledWith(['w2']);
    });
  });

  it('excludes a departed worker from the reload targets after a refetch drops it', async () => {
    const reloadFleetConfig = vi.fn().mockResolvedValue(converged());
    // The fleet loses w2 on the second read.
    const listFleetWorkers = vi
      .fn()
      .mockResolvedValueOnce(fleet('w1', 'w2'))
      .mockResolvedValue(fleet('w1'));
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers,
      reloadFleetConfig,
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select w1' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select w2' }));

    // Refresh drops w2 from the served fleet; the stale selection must not target it.
    await userEvent.click(screen.getByRole('button', { name: 'Refresh workers' }));
    await waitFor(() => {
      expect(screen.queryByText('w2')).not.toBeInTheDocument();
    });

    await userEvent.click(await findEnabledReload('Reload config (1 selected)'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload config' }));

    await waitFor(() => {
      expect(reloadFleetConfig).toHaveBeenCalledWith(['w1']);
    });
  });

  it('reopens the confirm dialog clean after a failed reload is cancelled', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1')),
      reloadFleetConfig: vi
        .fn()
        .mockRejectedValue(new ApiError("worker 'w1' did not acknowledge reload", 502)),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await userEvent.click(await findEnabledReload('Reload config (all)'));
    await userEvent.click(screen.getByRole('button', { name: 'Reload config' }));
    // The failure surfaces loudly in the dialog.
    expect(await screen.findByText("worker 'w1' did not acknowledge reload")).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // Reopening yields a pristine dialog — the stale 502 must not follow it back.
    await userEvent.click(screen.getByRole('button', { name: 'Reload config (all)' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText("worker 'w1' did not acknowledge reload")).not.toBeInTheDocument();
  });

  it('re-reads the fleet when Refresh is clicked', async () => {
    const listFleetWorkers = vi.fn().mockResolvedValue(fleet('w1'));
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers,
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await screen.findByText('w1');
    expect(listFleetWorkers).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh workers' }));

    await waitFor(() => {
      expect(listFleetWorkers).toHaveBeenCalledTimes(2);
    });
  });

  // -- fleet-reload capability gate ------------------------------------------
  // `POST /api/fleet/reload-config` is admin-fenced server-side; the census
  // (`GET /api/fleet/workers`) is an unfenced read. Only the reload control is gated.

  const RELOAD_ROUTE = { path: '/api/fleet/reload-config', methods: ['POST'] };

  it('shows the reload control to an admin projection that reaches the reload door', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2')),
    });
    // Both the admin (full) projection and a scoped projection that reaches the exact
    // reload route must see the enabled control.
    renderWithProviders(<SystemPage search={{}} />, {
      client,
      projection: scopedProjection({ routes: [RELOAD_ROUTE] }),
    });

    expect(await findEnabledReload('Reload config (all)')).toBeInTheDocument();
    // The census is visible alongside it.
    expect(screen.getByText('w1')).toBeInTheDocument();
    expect(screen.queryByTestId('reload-read-only-note')).toBeNull();
  });

  it('hides the reload control from a non-admin projection but keeps the census visible', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2')),
    });
    // A scoped caller that does NOT reach the reload door.
    renderWithProviders(<SystemPage search={{}} />, {
      client,
      projection: scopedProjection({ routes: [] }),
    });

    // The census (an unfenced read) stays fully visible…
    expect(await screen.findByText('Workers (2)')).toBeInTheDocument();
    expect(screen.getByText('w1')).toBeInTheDocument();
    expect(screen.getByText('w2')).toBeInTheDocument();
    // …but the 403-ing reload button is not rendered — a brief read-only note stands in.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Reload config \(/ })).toBeNull();
    });
    expect(screen.getByTestId('reload-read-only-note')).toBeInTheDocument();
  });

  it('fails closed while the projection is loading — the reload control is disabled', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1')),
    });
    // `projection: null` leaves the capability context in its pre-ready loading state.
    renderWithProviders(<SystemPage search={{}} />, { client, projection: null });

    // The census still renders (the read never depends on the projection)…
    expect(await screen.findByText('w1')).toBeInTheDocument();
    // …while the reload control renders DISABLED, never enabled before the gate resolves.
    const reload = screen.getByRole('button', { name: 'Reload config (all)' });
    expect(reload).toBeDisabled();
    // Not the ready-and-denied shape: the read-only note is only shown once ready.
    expect(screen.queryByTestId('reload-read-only-note')).toBeNull();
  });
});
