// Every write of the MCP config editor reloads the fleet and can run a recycle roll: the
// manifest save, the orphan sweep after it, and the combined secret paste. Each mounts the
// full editor, so userEvent runs without its inter-key delay.
import { ApiError } from '@tai42/api-client';
import {
  failureWithRoll,
  reportHeading,
  ROLL_FAILURE_HEADING,
  ROLL_FAILURE_MESSAGE,
} from '@tai42/test-support';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { McpServersSection } from './mcp-servers';
import {
  reload,
  renderWithProviders,
  SECRET_SCHEMA,
  status,
  withEnvBlank,
  withEnvMarker,
} from './test-utils-mcp-servers';

/** A reply whose recycle roll stopped at a worker it left awaiting a restart. */
const stoppedRoll = {
  status: 'ok',
  env_keys: 1,
  awaiting_respawn: [{ name: 'backend-2', keys: ['K'] }],
  span_release_error: null,
  roll_deferred: false,
  roll_deferred_to: null,
  fanout: {
    mode: 'fleet',
    op: 'reload_config',
    reachable: true,
    local_only: false,
    results: [
      {
        name: 'backend-2',
        outcome: 'applied',
        payload: { status: 'ok' },
        error: null,
        detail: null,
      },
    ],
    error: null,
  },
  recycle: {
    recycle: [
      {
        name: 'backend-2',
        kind: 'backend',
        status: 'timed-out',
        generation_before: 1,
        keys: ['K'],
        detail: 'old life still present',
      },
    ],
    skipped: [],
    fresh: [],
    recycle_stopped: { kind: 'backend', name: 'backend-2', detail: 'old life still present' },
  },
};

/** A reply whose recycle roll recycled the worker the manifest save's roll stopped at. */
const recycledRoll = {
  ...stoppedRoll,
  awaiting_respawn: [],
  recycle: {
    recycle: [
      {
        name: 'backend-2',
        kind: 'backend',
        status: 'recycled',
        generation_before: 1,
        keys: ['K'],
        detail: null,
      },
    ],
    skipped: [],
    fresh: [{ name: 'backend-2', kind: 'backend', generation: 2 }],
    recycle_stopped: null,
  },
};

function expectStoppedRoll(): void {
  expect(screen.getByTestId('recycle-stopped')).toHaveTextContent(
    'The recycle stopped at backend-2 (backend workers)',
  );
  expect(screen.getByTestId('recycle-stopped')).toHaveTextContent('old life still present');
}

/** The restart banner one write's report names, read as the heading a person reads. */
function restartBanner(write: string): HTMLElement {
  return screen.getByText(
    reportHeading(`1 worker needs a restart to apply some settings — ${write}`),
  );
}

function editorClient(overrides: Record<string, unknown>) {
  return {
    getMcpStatus: vi.fn().mockResolvedValue(status()),
    getManifestPreserved: vi
      .fn()
      .mockResolvedValueOnce(withEnvBlank)
      .mockResolvedValue(withEnvMarker),
    getMcpConfigSchema: vi.fn().mockResolvedValue(SECRET_SCHEMA),
    listExtensions: vi.fn().mockResolvedValue([]),
    getEnvConfig: vi
      .fn()
      .mockResolvedValueOnce({ env: {}, secret_keys: [], deployment_keys: [] })
      .mockResolvedValue({ env: {}, secret_keys: ['SECRET_1'], deployment_keys: [] }),
    setMcpSecretEnv: vi.fn().mockResolvedValue(reload(1)),
    setMcpConfig: vi.fn().mockResolvedValue(reload(0)),
    setEnvConfig: vi.fn().mockResolvedValue(reload(0)),
    ...overrides,
  };
}

async function pasteSecret(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await screen.findByTestId('mcp-entry-0');
  await user.type(screen.getByLabelText('API_KEY'), 'supersecret-PLAINTEXT');
  await user.click(screen.getByRole('button', { name: 'Use secret' }));
}

/** Pastes a secret, waits for it to settle, then saves with its only reference removed. */
async function saveWithGeneratedKeyOrphaned(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await pasteSecret(user);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Save config/ })).toBeEnabled();
  });
  await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
  await user.click(screen.getByRole('button', { name: /Save config/ }));
}

describe('McpServersSection — the recycle roll of each write', () => {
  it('reports the roll the manifest save ran', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvMarker),
      setMcpConfig: vi.fn().mockResolvedValue(stoppedRoll),
    });
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    await screen.findByText(/Saved \(/, undefined, { timeout: 5000 });
    expectStoppedRoll();
    expect(restartBanner('manifest')).toBeVisible();
  });

  it('reports the roll the orphan sweep ran', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({ setEnvConfig: vi.fn().mockResolvedValue(stoppedRoll) });
    renderWithProviders(<McpServersSection />, { client });

    await saveWithGeneratedKeyOrphaned(user);

    await screen.findByText(/Saved \(/, undefined, { timeout: 5000 });
    expectStoppedRoll();
    expect(restartBanner('env key SECRET_1')).toBeVisible();
  });

  it('keeps the roll the manifest save ran when the sweep after it fails', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      setMcpConfig: vi.fn().mockResolvedValue(stoppedRoll),
      setEnvConfig: vi.fn().mockRejectedValue(new ApiError('sweep refused', 400)),
    });
    renderWithProviders(<McpServersSection />, { client });

    await saveWithGeneratedKeyOrphaned(user);

    expect(await screen.findByText(/sweep refused/)).toBeVisible();
    expectStoppedRoll();
    expect(restartBanner('manifest')).toBeVisible();
  });

  it('reports the roll the secret paste ran', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({ setMcpSecretEnv: vi.fn().mockResolvedValue(stoppedRoll) });
    renderWithProviders(<McpServersSection />, { client });

    await pasteSecret(user);

    await screen.findByTestId('recycle-stopped');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save config/ })).toBeEnabled();
    });
    expectStoppedRoll();
    expect(restartBanner('manifest and secret')).toBeVisible();
  });

  it('keeps the roll the secret paste ran when its confirmation read fails', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      setMcpSecretEnv: vi.fn().mockResolvedValue(stoppedRoll),
      getManifestPreserved: vi
        .fn()
        .mockResolvedValueOnce(withEnvBlank)
        .mockRejectedValue(new ApiError('config is reloading', 503, undefined, 0)),
    });
    renderWithProviders(<McpServersSection />, { client });

    await pasteSecret(user);

    expect((await screen.findAllByText(/config is reloading/)).length).toBeGreaterThan(0);
    expectStoppedRoll();
    expect(restartBanner('manifest and secret')).toBeVisible();
  });
});

describe('McpServersSection — the name of the write each roll belongs to', () => {
  it('heads the roll of the manifest save and of the orphan sweep each with its write', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      setMcpConfig: vi.fn().mockResolvedValue(stoppedRoll),
      setEnvConfig: vi.fn().mockResolvedValue(recycledRoll),
    });
    renderWithProviders(<McpServersSection />, { client });

    await saveWithGeneratedKeyOrphaned(user);
    await screen.findByText(/Saved \(/, undefined, { timeout: 5000 });

    const manifest = screen.getByRole('region', { name: 'Worker recycle — manifest' });
    expect(within(manifest).getByTestId('recycle-stopped')).toHaveTextContent(
      'The recycle stopped at backend-2 (backend workers)',
    );
    const sweep = screen.getByRole('region', { name: 'Worker recycle — env key SECRET_1' });
    expect(within(sweep).getByText('recycled')).toBeInTheDocument();
    expect(within(sweep).queryByTestId('recycle-stopped')).toBeNull();
  });

  it('keeps the restart banner of the write that left a worker waiting, named by that write', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      setMcpConfig: vi.fn().mockResolvedValue(stoppedRoll),
      setEnvConfig: vi.fn().mockResolvedValue(recycledRoll),
    });
    renderWithProviders(<McpServersSection />, { client });

    await saveWithGeneratedKeyOrphaned(user);
    await screen.findByText(/Saved \(/, undefined, { timeout: 5000 });

    expect(restartBanner('manifest')).toBeVisible();
    expect(screen.getAllByText(/needs a restart to apply some settings/)).toHaveLength(1);
  });

  it('names each write that left a worker waiting with its own banner', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      setMcpConfig: vi.fn().mockResolvedValue(stoppedRoll),
      setEnvConfig: vi.fn().mockResolvedValue(stoppedRoll),
    });
    renderWithProviders(<McpServersSection />, { client });

    await saveWithGeneratedKeyOrphaned(user);
    await screen.findByText(/Saved \(/, undefined, { timeout: 5000 });

    expect(restartBanner('manifest')).toBeVisible();
    expect(restartBanner('env key SECRET_1')).toBeVisible();
  });

  it('heads a save that made one write with that write', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvMarker),
      setMcpConfig: vi.fn().mockResolvedValue(stoppedRoll),
    });
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    await user.click(screen.getByRole('button', { name: /Save config/ }));
    await screen.findByText(/Saved \(/, undefined, { timeout: 5000 });

    expect(screen.getByRole('region', { name: 'Worker recycle — manifest' })).toBeVisible();
  });

  it('heads the roll of a secret paste with that write', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({ setMcpSecretEnv: vi.fn().mockResolvedValue(stoppedRoll) });
    renderWithProviders(<McpServersSection />, { client });

    await pasteSecret(user);

    expect(
      await screen.findByRole('region', { name: 'Worker recycle — manifest and secret' }),
    ).toBeVisible();
  });
});

describe('McpServersSection — a failed write that carries a recycle roll', () => {
  const failedBanner = new RegExp(`^${ROLL_FAILURE_HEADING} —`);

  /** A failed reply whose write ran a roll, the roll stopped. */
  function failureCarryingRoll(): ApiError {
    return new ApiError(ROLL_FAILURE_MESSAGE, 500, undefined, undefined, {
      error: ROLL_FAILURE_MESSAGE,
      error_id: 'err-1',
      recycle: stoppedRoll.recycle,
      awaiting_respawn: [],
      roll_deferred: false,
      roll_deferred_to: null,
    });
  }

  it('shows the roll beside the error of a failed manifest save', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      getManifestPreserved: vi.fn().mockResolvedValue(withEnvMarker),
      setMcpConfig: vi.fn().mockRejectedValue(failureWithRoll()),
    });
    renderWithProviders(<McpServersSection />, { client });

    await screen.findByTestId('mcp-entry-0');
    await user.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    const banner = await screen.findByText(failedBanner);
    expect(banner).toHaveTextContent(`${ROLL_FAILURE_HEADING} — manifest`);
    expect(screen.getByText(ROLL_FAILURE_MESSAGE)).toBeInTheDocument();
  });

  it('names the failed sweep, not the manifest save that landed before it', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      setMcpConfig: vi.fn().mockResolvedValue(stoppedRoll),
      setEnvConfig: vi.fn().mockRejectedValue(failureWithRoll()),
    });
    renderWithProviders(<McpServersSection />, { client });

    await saveWithGeneratedKeyOrphaned(user);

    const banner = await screen.findByText(failedBanner);
    expect(banner).toHaveTextContent(`${ROLL_FAILURE_HEADING} — env key SECRET_1`);
    expect(restartBanner('manifest')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Worker recycle — manifest' })).toBeVisible();
  });

  it('names a retried manifest save that failed after its sweep failed', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      setMcpConfig: vi
        .fn()
        .mockResolvedValueOnce(stoppedRoll)
        .mockRejectedValue(failureCarryingRoll()),
      setEnvConfig: vi.fn().mockRejectedValue(failureCarryingRoll()),
    });
    renderWithProviders(<McpServersSection />, { client });

    await saveWithGeneratedKeyOrphaned(user);
    await screen.findByRole('region', { name: 'Worker recycle — env key SECRET_1' });
    await user.click(screen.getByRole('button', { name: /Save config/ }));

    expect(await screen.findByRole('region', { name: 'Worker recycle — manifest' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Worker recycle — env key SECRET_1' })).toBeNull();
  });

  it('names the did-not-converge panel of the manifest save and of the sweep', async () => {
    const user = userEvent.setup({ delay: null });
    const unconfirmed = {
      status: 'ok',
      env_keys: 0,
      awaiting_respawn: [],
      recycle: null,
      span_release_error: null,
      fanout: {
        mode: 'fleet',
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [
          { name: 'serve-b', outcome: 'timed_out', payload: null, error: null, detail: null },
        ],
        error: null,
      },
    };
    const client = editorClient({
      setMcpConfig: vi.fn().mockResolvedValue(unconfirmed),
      setEnvConfig: vi.fn().mockResolvedValue(unconfirmed),
    });
    renderWithProviders(<McpServersSection />, { client });

    await saveWithGeneratedKeyOrphaned(user);

    const heading = (scope: string) =>
      reportHeading(`Change saved, but 1 worker did not converge — ${scope}`);
    expect(await screen.findByText(heading('env key SECRET_1'))).toBeVisible();
    expect(screen.getByText(heading('manifest'))).toBeVisible();
  });

  it('heads the roll of a failed sweep with the sweep, next to the manifest save’s', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      setMcpConfig: vi.fn().mockResolvedValue(stoppedRoll),
      setEnvConfig: vi.fn().mockRejectedValue(failureCarryingRoll()),
    });
    renderWithProviders(<McpServersSection />, { client });

    await saveWithGeneratedKeyOrphaned(user);

    expect(
      await screen.findByRole('region', { name: 'Worker recycle — env key SECRET_1' }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Worker recycle — manifest' })).toBeVisible();
  });

  it('shows the roll beside the error of a failed secret paste', async () => {
    const user = userEvent.setup({ delay: null });
    const client = editorClient({
      setMcpSecretEnv: vi.fn().mockRejectedValue(failureWithRoll()),
    });
    renderWithProviders(<McpServersSection />, { client });

    await pasteSecret(user);

    const banner = await screen.findByText(failedBanner);
    expect(banner).toHaveTextContent(`${ROLL_FAILURE_HEADING} — manifest and secret`);
    expect(screen.getByText(ROLL_FAILURE_MESSAGE)).toBeInTheDocument();
  });
});
