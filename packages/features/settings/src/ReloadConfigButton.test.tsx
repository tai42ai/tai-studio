/**
 * Behavioural tests for the Settings surface's config-reload control: capability
 * gating (hidden for a caller who cannot reach the fenced door, enabled once an
 * admin projection resolves), the confirm flow and the exact `reloadConfig(null)`
 * call shape, the converged success note, the degraded per-worker `FleetReport`, and
 * the loud error path — all driving the real DS components through TanStack Query and
 * the SDK capability context.
 */
import type {
  ApiClient,
  FleetReloadResult,
  FleetWorkerResult,
  RecycleRoll,
} from '@tai42/api-client';
import {
  failureWithRoll,
  reportHeading,
  ROLL_FAILURE_HEADING,
  ROLL_FAILURE_MESSAGE,
} from '@tai42/test-support';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReloadConfigButton } from './ReloadConfigButton';
import {
  clickWhenInteractable,
  fullProjection,
  renderWithProviders,
  scopedProjection,
} from './test-utils';

/** The fenced door the control gates on; a scoped projection reaching it shows it. */
const RELOAD_ROUTE = '/api/config/reload';

function worker(overrides: Partial<FleetWorkerResult>): FleetWorkerResult {
  return { name: 'w1', outcome: 'applied', payload: null, error: null, detail: null, ...overrides };
}

/** The success line, whichever scope the reply reads as. */
const SUCCESS_LINE = /Reload converged|Only this worker reloaded/;

function fleetResult(overrides: Partial<FleetReloadResult> = {}): FleetReloadResult {
  return {
    ok: true,
    op: 'reload_config',
    reachable: true,
    local_only: false,
    results: [worker({})],
    error: null,
    awaiting_respawn: [],
    recycle: null,
    roll_deferred: false,
    roll_deferred_to: null,
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
    await clickWhenInteractable(
      user,
      within(dialog).getByRole('button', { name: 'Reload config' }),
    );

    await waitFor(() => {
      expect(reloadConfig).toHaveBeenCalledWith(null);
    });
    expect(
      await screen.findByText(
        'Reload applied. Only this worker reloaded; no other worker was on the worker bus when it ran.',
      ),
    ).toBeInTheDocument();
  });

  it('says in the confirm dialog that the reload can restart workers', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReloadConfigButton />, {
      client: stubClient({}),
      projection: fullProjection(),
    });

    await user.click(await findEnabledButton());
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Soft-restart the deployment? Each worker re-reads its environment and reloads its manifest registries. A worker whose changed settings need a new process is then restarted, one at a time. No configuration is changed.',
    );
  });

  it('shows the roll the reload ran and drops the converged line when it stopped', async () => {
    const user = userEvent.setup();
    const reply = fleetResult({
      results: [worker({ name: 'w1' })],
      recycle: {
        recycle: [],
        skipped: [],
        fresh: [],
        recycle_stopped: { kind: 'serve', name: 'w2', detail: 'old life still present' },
      },
    });
    const client = stubClient({ reloadConfig: vi.fn().mockResolvedValue(reply) });
    renderWithProviders(<ReloadConfigButton />, { client, projection: fullProjection() });

    await user.click(await findEnabledButton());
    const dialog = await screen.findByRole('dialog');
    await clickWhenInteractable(
      user,
      within(dialog).getByRole('button', { name: 'Reload config' }),
    );

    expect(
      await screen.findByText(
        "The worker restarts stopped before they finished. This reload's report has a row only for w1. The sections below cover w2.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(SUCCESS_LINE)).toBeNull();
    expect(screen.getByTestId('recycle-stopped')).toHaveTextContent(
      'The recycle stopped at w2 (serve workers)',
    );
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
    await clickWhenInteractable(
      user,
      within(dialog).getByRole('button', { name: 'Reload config' }),
    );

    // A degraded broadcast is a loud alert naming the stranded worker — never a faked
    // success note.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('w2');
    expect(screen.queryByText(SUCCESS_LINE)).not.toBeInTheDocument();
  });

  it('lists the workers the reload verdict leaves awaiting a restart, not those its roll restarted', async () => {
    const user = userEvent.setup();
    const moved = { status: 'ok', env_keys: 3, awaiting_respawn: ['BACKEND_MANIFEST_KEY'] };
    const reply = fleetResult({
      results: [worker({ name: 'w1', payload: moved }), worker({ name: 'w2', payload: moved })],
      awaiting_respawn: [{ name: 'w2', keys: ['BACKEND_MANIFEST_KEY'] }],
    });
    const client = stubClient({ reloadConfig: vi.fn().mockResolvedValue(reply) });
    renderWithProviders(<ReloadConfigButton />, { client, projection: fullProjection() });

    await user.click(await findEnabledButton());
    const dialog = await screen.findByRole('dialog');
    await clickWhenInteractable(
      user,
      within(dialog).getByRole('button', { name: 'Reload config' }),
    );

    expect(
      await screen.findByText('The reload was applied. 1 worker still needs a restart.'),
    ).toBeInTheDocument();
    const heading = await screen.findByText(
      reportHeading('1 worker needs a restart to apply some settings — reload'),
    );
    const panel = heading.closest('[role="status"]');
    if (!(panel instanceof HTMLElement))
      throw new Error('the restart list is not in a status region');
    expect(within(panel).getByText('w2')).toBeInTheDocument();
    expect(within(panel).queryByText('w1')).not.toBeInTheDocument();
  });

  it('surfaces a rejected reload verbatim in the dialog', async () => {
    const user = userEvent.setup();
    const message = 'reload is admin-only';
    const client = stubClient({ reloadConfig: vi.fn().mockRejectedValue(new Error(message)) });
    renderWithProviders(<ReloadConfigButton />, { client, projection: fullProjection() });

    await user.click(await findEnabledButton());
    const dialog = await screen.findByRole('dialog');
    await clickWhenInteractable(
      user,
      within(dialog).getByRole('button', { name: 'Reload config' }),
    );

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });
});

describe('ReloadConfigButton — one row, with the bus not shown to hold only that worker', () => {
  async function reload(reply: FleetReloadResult): Promise<void> {
    const user = userEvent.setup();
    const reloadConfig = vi.fn().mockResolvedValue(reply);
    renderWithProviders(<ReloadConfigButton />, {
      client: stubClient({ reloadConfig }),
      projection: fullProjection(),
    });
    await user.click(await findEnabledButton());
    const dialog = await screen.findByRole('dialog');
    await clickWhenInteractable(
      user,
      within(dialog).getByRole('button', { name: 'Reload config' }),
    );
  }

  it('reads a roll stopped on no named worker as the one row, not as a lone worker', async () => {
    await reload(
      fleetResult({
        recycle: {
          recycle: [],
          skipped: [],
          fresh: [],
          recycle_stopped: { kind: 'backend', name: null, detail: 'bus unreachable' },
        },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      /^The worker restarts stopped before they finished\. This reload's report has a row only for w1\.$/,
    );
    expect(screen.queryByText(/no other worker/)).toBeNull();
  });

  it('names the worker a deferred roll was handed to, not a lone worker', async () => {
    await reload(fleetResult({ roll_deferred: true, roll_deferred_to: 'w2' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /^This reload's report has a row only for w1\. w2 takes over the worker restarts after this reply, so this report cannot state their outcome; w2's log holds it\.$/,
    );
    expect(screen.queryByText(/no other worker/)).toBeNull();
  });
});

describe('ReloadConfigButton — a failed reload that carries a recycle roll', () => {
  it('shows the roll beside the error and no reload headline', async () => {
    const user = userEvent.setup();
    const client = stubClient({ reloadConfig: vi.fn().mockRejectedValue(failureWithRoll()) });
    renderWithProviders(<ReloadConfigButton />, { client, projection: fullProjection() });

    await user.click(await findEnabledButton());
    const dialog = await screen.findByRole('dialog');
    await clickWhenInteractable(
      user,
      within(dialog).getByRole('button', { name: 'Reload config' }),
    );

    expect(
      await within(dialog).findByText(reportHeading(`${ROLL_FAILURE_HEADING} — reload`)),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(ROLL_FAILURE_MESSAGE)).toBeInTheDocument();
    expect(within(dialog).queryByText('The reload was applied.')).toBeNull();
    expect(within(dialog).queryByText(SUCCESS_LINE)).toBeNull();
  });
});

describe('ReloadConfigButton — a worker the roll settled after its reload did not confirm', () => {
  const timedOut = worker({ name: 'backend-1', outcome: 'timed_out', detail: 'no reply in time' });
  const rollLine = (status: string): RecycleRoll['recycle'][number] => ({
    name: 'backend-1',
    kind: 'backend',
    status,
    generation_before: 3,
    keys: ['K'],
    detail: null,
  });

  async function reloadWith(recycle: RecycleRoll, row = timedOut): Promise<void> {
    const user = userEvent.setup();
    const reply = fleetResult({ results: [row], recycle });
    renderWithProviders(<ReloadConfigButton />, {
      client: stubClient({ reloadConfig: vi.fn().mockResolvedValue(reply) }),
      projection: fullProjection(),
    });
    await user.click(await findEnabledButton());
    const dialog = await screen.findByRole('dialog');
    await clickWhenInteractable(
      user,
      within(dialog).getByRole('button', { name: 'Reload config' }),
    );
    await screen.findByRole('region', { name: 'Worker recycle — reload' });
  }

  it('reads converged for a worker recycled to a new life, its row beside its life', async () => {
    await reloadWith({
      recycle: [rollLine('recycled')],
      skipped: [],
      fresh: [{ name: 'backend-1', kind: 'backend', generation: 4 }],
      recycle_stopped: null,
    });
    expect(
      screen.getByText(
        'Reload applied. Only this worker reloaded; no other worker was on the worker bus when it ran.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/did not converge/)).toBeNull();
    expect(screen.queryByText(/may still be running/)).toBeNull();
    const row = screen.getByTestId('apply-recycle');
    expect(row).toHaveTextContent('backend-1');
    expect(row).toHaveTextContent('life 3 to 4');
  });

  it('does not call a deferred restart converged or its reload applied', async () => {
    await reloadWith({
      recycle: [rollLine('self-deferred')],
      skipped: [],
      fresh: [],
      recycle_stopped: null,
    });
    expect(
      screen.getByText(
        '1 worker restarts once its own in-flight change has replied, which this report cannot confirm. This reload reached only this worker; no other worker was on the worker bus when it ran.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/did not converge/)).toBeNull();
    expect(screen.queryByText(/The reload was applied/)).toBeNull();
    expect(screen.queryByText(SUCCESS_LINE)).toBeNull();
  });

  it('states a deferred restart beside an applied reload', async () => {
    await reloadWith(
      { recycle: [rollLine('self-deferred')], skipped: [], fresh: [], recycle_stopped: null },
      worker({ name: 'backend-1' }),
    );
    expect(
      screen.getByText(
        'The reload was applied. 1 worker restarts once its own in-flight change has replied, which this report cannot confirm. This reload reached only this worker; no other worker was on the worker bus when it ran.',
      ),
    ).toBeInTheDocument();
  });

  it('reads the worker the roll confirmed clean, beside no recycled worker', async () => {
    await reloadWith({
      recycle: [],
      skipped: ['backend-1'],
      fresh: [],
      recycle_stopped: null,
    });
    expect(
      screen.getByText(
        '1 worker did not confirm the reload at first, then confirmed it needs no restart. This reload reached only this worker; no other worker was on the worker bus when it ran.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No worker was recycled.')).toBeInTheDocument();
    expect(screen.queryByText(/did not converge/)).toBeNull();
    expect(screen.queryByText(SUCCESS_LINE)).toBeNull();
  });

  it('keeps a worker the roll stopped at in the failure panel', async () => {
    await reloadWith({
      recycle: [rollLine('timed-out')],
      skipped: [],
      fresh: [],
      recycle_stopped: { kind: 'backend', name: 'backend-1', detail: 'old life still present' },
    });
    expect(
      screen.getByText(reportHeading('1 worker did not converge — reload')),
    ).toBeInTheDocument();
    expect(screen.queryByText(SUCCESS_LINE)).toBeNull();
  });
});
