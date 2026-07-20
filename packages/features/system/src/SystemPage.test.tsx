import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import { ApiError, type ApiClient, type MeProjection } from '@tai42/api-client';
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
              <NavigationProvider value={{ navigate: vi.fn(), resolvePath: () => '/x' }}>
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
  | 'getHealth'
  | 'getMetrics'
  | 'getSystemKinds'
  | 'getBackendInfo'
  | 'listFleetWorkers'
  | 'reloadFleetConfig'
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

/** A bus presence census of `serve` origins (the shape `GET /api/fleet/workers`
 * returns). The origin string doubles as the reload target and the row label. */
function fleet(...origins: string[]): {
  workers: { origin: string; kind: 'serve'; pid: number }[];
} {
  return { workers: origins.map((origin, index) => ({ origin, kind: 'serve', pid: 100 + index })) };
}

/** A CONVERGED fleet-reload report — every named origin applied. An empty list is
 * the trivially-converged case the assertion-only tests use. */
function converged(...origins: string[]): {
  op: string;
  reachable: boolean;
  local_only: boolean;
  results: {
    origin: string;
    outcome: 'applied';
    payload: null;
    error: null;
    detail: null;
  }[];
  error: null;
} {
  return {
    op: 'reload_config',
    reachable: true,
    local_only: false,
    results: origins.map((origin) => ({
      origin,
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
    getMetrics: vi.fn().mockResolvedValue('tai42_up 1'),
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

  it('renders the metrics text inside a CodeBlock (escaped preformatted text)', async () => {
    const client = stubClient({
      getMetrics: vi.fn().mockResolvedValue('tai42_requests_total 42\ntai_up 1'),
    });
    renderWithProviders(<SystemPage search={{}} />, { client });

    const code = await screen.findByText(/tai42_requests_total 42/);
    expect(code.tagName).toBe('CODE');
    expect(code.closest('pre')).not.toBeNull();
  });

  it('refetches metrics when Refresh is clicked', async () => {
    const getMetrics = vi.fn().mockResolvedValue('tai42_up 1');
    const client = stubClient({ getMetrics });
    renderWithProviders(<SystemPage search={{}} />, { client });

    await screen.findByText('tai42_up 1');
    expect(getMetrics).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh metrics' }));

    await waitFor(() => {
      expect(getMetrics).toHaveBeenCalledTimes(2);
    });
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
    expect(screen.getByText('w1')).toBeInTheDocument();
    expect(screen.getByText('w3')).toBeInTheDocument();
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

  it('renders the honest per-origin report when a reload does not fully converge', async () => {
    const client = stubClient({
      getBackendInfo: vi.fn().mockResolvedValue(PRESENT_BACKEND),
      listFleetWorkers: vi.fn().mockResolvedValue(fleet('w1', 'w2')),
      reloadFleetConfig: vi.fn().mockResolvedValue({
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [
          { origin: 'w1', outcome: 'applied', payload: null, error: null, detail: null },
          {
            origin: 'w2',
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
