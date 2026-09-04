/**
 * Behavioural tests for the Settings surface's config-reload control: capability
 * gating (hidden for a caller who cannot reach the fenced door, enabled once an
 * admin projection resolves), the confirm flow and the exact `reloadConfig(null)`
 * call shape, the converged success note, the degraded per-worker `FleetReport`, and
 * the loud error path — all driving the real DS components through TanStack Query and
 * the SDK capability context.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, FleetResult, FleetWorkerResult } from '@tai42/api-client';

import { ReloadConfigButton } from './ReloadConfigButton';
import { fullProjection, renderWithProviders, scopedProjection } from './test-utils';

/** The fenced door the control gates on; a scoped projection reaching it shows it. */
const RELOAD_ROUTE = '/api/config/reload';

function worker(overrides: Partial<FleetWorkerResult>): FleetWorkerResult {
  return { name: 'w1', outcome: 'applied', payload: null, error: null, detail: null, ...overrides };
}

function fleetResult(overrides: Partial<FleetResult> = {}): FleetResult {
  return {
    op: 'reload_config',
    reachable: true,
    local_only: false,
    results: [worker({})],
    error: null,
    ...overrides,
  };
}

function stubClient(methods: Partial<ApiClient>): ApiClient {
  return methods as unknown as ApiClient;
}

/** The reload button, awaited until the capability projection has enabled it — the
 *  control renders disabled (fail-closed) until the projection resolves. */
async function findEnabledButton(): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name: 'Reload configuration' });
  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  return button;
}

describe('ReloadConfigButton — gating', () => {
  it('is hidden for a caller whose projection cannot reach the fenced reload door', async () => {
    const client = stubClient({ reloadConfig: vi.fn() });
    renderWithProviders(<ReloadConfigButton />, {
      client,
      // A scope that reaches an unrelated route only — never the reload door.
      projection: scopedProjection({ routes: [{ path: '/api/special', methods: ['GET'] }] }),
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Reload configuration' }),
      ).not.toBeInTheDocument();
    });
  });

  it('is shown for a scoped caller who reaches the reload door', async () => {
    const client = stubClient({ reloadConfig: vi.fn().mockResolvedValue(fleetResult()) });
    renderWithProviders(<ReloadConfigButton />, {
      client,
      projection: scopedProjection({ routes: [{ path: RELOAD_ROUTE, methods: ['POST'] }] }),
    });

    expect(await findEnabledButton()).toBeInTheDocument();
  });
});

describe('ReloadConfigButton — reload flow', () => {
  it('confirms, calls reloadConfig(null), and shows a converged success note', async () => {
    const user = userEvent.setup();
    const reloadConfig = vi.fn().mockResolvedValue(fleetResult());
    const client = stubClient({ reloadConfig });
    renderWithProviders(<ReloadConfigButton />, { client, projection: fullProjection() });

    await user.click(await findEnabledButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reload config' }));

    await waitFor(() => {
      expect(reloadConfig).toHaveBeenCalledWith(null);
    });
    expect(await screen.findByText('Configuration reloaded.')).toBeInTheDocument();
  });

  it('renders the honest per-worker report when a worker did not converge', async () => {
    const user = userEvent.setup();
    const degraded = fleetResult({
      results: [worker({ name: 'w2', outcome: 'failed', error: 'reinit raised' })],
    });
    const client = stubClient({ reloadConfig: vi.fn().mockResolvedValue(degraded) });
    renderWithProviders(<ReloadConfigButton />, { client, projection: fullProjection() });

    await user.click(await findEnabledButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reload config' }));

    // A degraded broadcast is a loud alert naming the stranded worker — never a faked
    // success note.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('w2');
    expect(screen.queryByText('Configuration reloaded.')).not.toBeInTheDocument();
  });

  it('surfaces a rejected reload verbatim in the dialog', async () => {
    const user = userEvent.setup();
    const message = 'reload is admin-only';
    const client = stubClient({ reloadConfig: vi.fn().mockRejectedValue(new Error(message)) });
    renderWithProviders(<ReloadConfigButton />, { client, projection: fullProjection() });

    await user.click(await findEnabledButton());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reload config' }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });
});
