import type { ApiClient, SettingsSchema } from '@tai42/api-client';
import { GuardedTabs } from '@tai42/studio-sdk';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentTab } from './EnvironmentTab';
import { renderWithProviders } from './test-utils';

function schemaFixture(): SettingsSchema {
  return {
    groups: [
      {
        name: 'AppSettings',
        module: 'tai42_app.settings',
        qualname: 'tai42_app.settings.AppSettings',
        fields: [
          {
            name: 'port',
            env_var: 'TAI_PORT',
            type: 'integer',
            default: 8000,
            required: false,
            secret: false,
            description: null,
            nested_group: null,
            default_namespace_var: null,
            value: 8000,
          },
        ],
      },
    ],
  };
}

function envFixture(): { env: Record<string, string>; secret_keys: string[] } {
  return {
    env: { OPENAI_API_KEY: 'sk-openai', TAI_PORT: '8000', FOO: 'bar' },
    secret_keys: ['FOO'],
  };
}

interface Stub {
  readonly getEnvConfig: ApiClient['getEnvConfig'];
  readonly getSettingsSchema: ApiClient['getSettingsSchema'];
  readonly setEnvConfig?: ApiClient['setEnvConfig'];
}
function stubClient(methods: Stub): ApiClient {
  return methods as unknown as ApiClient;
}
function saved(): ReturnType<ApiClient['setEnvConfig']> {
  return Promise.resolve({
    span_release_error: null,
    status: 'reloaded',
    env_keys: 1,
    awaiting_respawn: [],
    fanout: { mode: 'local-only', note: 'no worker bus configured; only this worker reloaded' },
    recycle: null,
  });
}

/** A save whose broadcast left a sibling unconverged, so `FleetReport` renders. */
function degradedSave(): ReturnType<ApiClient['setEnvConfig']> {
  return Promise.resolve({
    span_release_error: null,
    status: 'reloaded',
    env_keys: 1,
    awaiting_respawn: [],
    fanout: {
      mode: 'fleet',
      op: 'set_env',
      reachable: true,
      local_only: false,
      results: [{ name: 'worker-2', outcome: 'missing', payload: null, error: null, detail: null }],
      error: null,
    },
    recycle: null,
  });
}

function baseStub(setEnvConfig?: ApiClient['setEnvConfig']): ApiClient {
  return stubClient({
    getEnvConfig: vi.fn(() => Promise.resolve(envFixture())),
    getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
    ...(setEnvConfig === undefined ? {} : { setEnvConfig }),
  });
}

describe('EnvironmentTab unsaved-changes guard', () => {
  it('confirms before a tab switch discards unsaved environment edits', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GuardedTabs
        items={[
          { value: 'env', label: 'Environment', content: <EnvironmentTab readOnly={false} /> },
          { value: 'other', label: 'Other', content: <div>other panel</div> },
        ]}
        defaultValue="env"
      />,
      { client: baseStub() },
    );

    // Dirty the editor by editing a variable's value.
    const value = await screen.findByLabelText('Value of variable OPENAI_API_KEY');
    await user.type(value, 'x');

    // Switching tabs while dirty opens the confirm and HOLDS the switch.
    await user.click(screen.getByRole('tab', { name: 'Other' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(screen.queryByText('other panel')).toBeNull();

    // Confirming the discard completes the switch.
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByText('other panel')).toBeInTheDocument();
  });

  it('does not guard a read-only editor', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GuardedTabs
        items={[
          { value: 'env', label: 'Environment', content: <EnvironmentTab readOnly /> },
          { value: 'other', label: 'Other', content: <div>other panel</div> },
        ]}
        defaultValue="env"
      />,
      { client: baseStub() },
    );

    await screen.findByLabelText('Value of variable OPENAI_API_KEY');
    await user.click(screen.getByRole('tab', { name: 'Other' }));
    expect(await screen.findByText('other panel')).toBeInTheDocument();
    expect(screen.queryByText(/unsaved changes/)).toBeNull();
  });
});

describe('EnvironmentTab', () => {
  it('offers a secret toggle for an unowned key and saves the updated marks', async () => {
    const user = userEvent.setup();
    const setEnvConfig = vi.fn(saved);
    renderWithProviders(<EnvironmentTab readOnly={false} />, { client: baseStub(setEnvConfig) });

    const row = (await screen.findByLabelText('Name of variable OPENAI_API_KEY')).closest('li');
    expect(row).not.toBeNull();
    const toggle = within(row as HTMLElement).getByRole('checkbox', { name: 'Secret' });
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith(
        expect.objectContaining({ secret_keys: ['FOO', 'OPENAI_API_KEY'] }),
      );
    });
  });

  it('prunes removed and owned keys from the saved secret marks', async () => {
    const user = userEvent.setup();
    const setEnvConfig = vi.fn(saved);
    const client = stubClient({
      getEnvConfig: vi.fn(() =>
        Promise.resolve({
          env: { OPENAI_API_KEY: 'sk-openai', TAI_PORT: '8000', FOO: 'bar' },
          // The server sends an owned key (TAI_PORT) inside the secret set; the tab
          // must never write it back into the marks var (owned secret state is
          // class-derived), and a removed unowned key must be pruned.
          secret_keys: ['FOO', 'TAI_PORT'],
        }),
      ),
      getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
      setEnvConfig,
    });
    renderWithProviders(<EnvironmentTab readOnly={false} />, { client });

    const row = (await screen.findByLabelText('Name of variable FOO')).closest('li');
    expect(row).not.toBeNull();
    await user.click(
      within(row as HTMLElement).getByRole('button', { name: 'Remove variable FOO' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith(expect.objectContaining({ secret_keys: [] }));
    });
  });

  it('wears the ghost style on an env-var row Remove, not filled danger', async () => {
    const client = stubClient({
      getEnvConfig: vi.fn(() => Promise.resolve({ env: { FOO: 'bar' }, secret_keys: [] })),
      getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
    });
    renderWithProviders(<EnvironmentTab readOnly={false} />, { client });

    const row = (await screen.findByLabelText('Name of variable FOO')).closest('li');
    // The per-row Remove in the env-map editor is a routine list-item control; it stays
    // low-emphasis rather than filled danger.
    const rowRemove = within(row as HTMLElement).getByRole('button', {
      name: 'Remove variable FOO',
    });
    expect(rowRemove).toHaveClass('tai-btn-ghost');
    expect(rowRemove).not.toHaveClass('tai-btn-danger');
  });

  it('posts a removed key with an empty value so the merge door deletes it', async () => {
    const user = userEvent.setup();
    const setEnvConfig = vi.fn(saved);
    const client = stubClient({
      getEnvConfig: vi.fn(() => Promise.resolve({ env: { A: '1', B: '2' }, secret_keys: [] })),
      getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
      setEnvConfig,
    });
    renderWithProviders(<EnvironmentTab readOnly={false} />, { client });

    const row = (await screen.findByLabelText('Name of variable B')).closest('li');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Remove variable B' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith({ env: { A: '1', B: '' }, secret_keys: [] });
    });
  });

  it('renames a key by deleting the old name and adding the new one', async () => {
    const user = userEvent.setup();
    const setEnvConfig = vi.fn(saved);
    const client = stubClient({
      getEnvConfig: vi.fn(() => Promise.resolve({ env: { A: '1' }, secret_keys: [] })),
      getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
      setEnvConfig,
    });
    renderWithProviders(<EnvironmentTab readOnly={false} />, { client });

    const keyInput = await screen.findByLabelText('Name of variable A');
    await user.clear(keyInput);
    await user.type(keyInput, 'A2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith({ env: { A: '', A2: '1' }, secret_keys: [] });
    });
  });

  it('does not offer a secret toggle for a settings-owned key', async () => {
    renderWithProviders(<EnvironmentTab readOnly={false} />, { client: baseStub() });

    const row = (await screen.findByLabelText('Name of variable TAI_PORT')).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('owned')).toBeInTheDocument();
  });

  it('masks a secret-marked row and reveals it on toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EnvironmentTab readOnly={false} />, { client: baseStub() });

    await screen.findByLabelText('Name of variable FOO');
    const container = screen.getByTestId('env-secret-FOO');
    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('bar');

    await user.click(screen.getByTestId('env-secret-FOO-toggle'));
    expect(container.querySelector('input')).toHaveAttribute('type', 'text');
  });

  it('re-seeds from the save-triggered refetch without detaching the operator', async () => {
    // The refetch that follows a save returns the SERVER's shape of what was just
    // written (here, a trimmed value), so the state the editor is seeded from
    // moves under it. The re-seed has to land WITHOUT tearing the editor down: the
    // operator is standing on the Save button, and the save's own fleet report is
    // rendered by this component's mutation state.
    const user = userEvent.setup();
    const getEnvConfig = vi
      .fn()
      .mockResolvedValueOnce({ env: { A: '1' }, secret_keys: [] })
      .mockResolvedValue({ env: { A: 'trimmed' }, secret_keys: [] });
    const client = stubClient({
      getEnvConfig: getEnvConfig as ApiClient['getEnvConfig'],
      getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
      setEnvConfig: vi.fn(degradedSave),
    });
    renderWithProviders(<EnvironmentTab readOnly={false} />, { client });

    const valueInput = await screen.findByLabelText('Value of variable A');
    await user.clear(valueInput);
    await user.type(valueInput, ' 1 ');
    const save = screen.getByRole('button', { name: 'Save' });
    await user.click(save);

    // The refetch landed and the rows carry the server's value, not the draft.
    await waitFor(() => {
      expect(screen.getByLabelText('Value of variable A')).toHaveValue('trimmed');
    });
    // The keyboard caret is still on Save, not on the body.
    expect(save).toHaveFocus();
    // The save's own report survived the re-seed.
    expect(screen.getByRole('alert')).toHaveTextContent('did not converge');
  });

  it('disables every control in read-only mode', async () => {
    const setEnvConfig = vi.fn(saved);
    renderWithProviders(<EnvironmentTab readOnly={true} />, { client: baseStub(setEnvConfig) });

    expect(await screen.findByLabelText('Name of variable FOO')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add variable' })).not.toBeInTheDocument();
    expect(setEnvConfig).not.toHaveBeenCalled();
  });
});

/** A save that rolled a worker recycle; every worker's reload row states the fact that its env moved. */
function rolledSave(stopped: boolean): ReturnType<ApiClient['setEnvConfig']> {
  const awaiting = { status: 'ok', env_keys: 1, awaiting_respawn: ['BACKEND_MANIFEST_KEY'] };
  return Promise.resolve({
    span_release_error: null,
    status: 'ok',
    env_keys: 1,
    // The operation's verdict: a converged roll leaves nobody waiting; a stopped one leaves
    // the workers it did not recycle (here every worker, the writer included).
    awaiting_respawn: stopped
      ? [
          { name: 'backend-1', keys: ['BACKEND_MANIFEST_KEY'] },
          { name: 'backend-2', keys: ['BACKEND_MANIFEST_KEY'] },
          { name: 'serve-1', keys: ['BACKEND_MANIFEST_KEY'] },
        ]
      : [],
    fanout: {
      mode: 'fleet',
      op: 'reload_config',
      reachable: true,
      local_only: false,
      results: [
        { name: 'serve-1', outcome: 'applied', payload: awaiting, error: null, detail: null },
        { name: 'backend-1', outcome: 'applied', payload: awaiting, error: null, detail: null },
        { name: 'backend-2', outcome: 'applied', payload: awaiting, error: null, detail: null },
      ],
      error: null,
    },
    recycle: stopped
      ? {
          recycle: [
            {
              name: 'backend-1',
              kind: 'backend',
              status: 'timed-out',
              generation_before: 3,
              detail: 'its old life was still present after 90s',
            },
          ],
          fresh: [],
          recycle_stopped: {
            kind: 'backend',
            name: 'backend-1',
            detail: 'its old life was still present after 90s',
          },
        }
      : {
          recycle: [
            {
              name: 'backend-1',
              kind: 'backend',
              status: 'recycled',
              generation_before: 3,
              detail: null,
            },
            {
              name: 'backend-2',
              kind: 'backend',
              status: 'recycled',
              generation_before: 1,
              detail: null,
            },
            {
              name: 'serve-1',
              kind: 'serve',
              status: 'self-deferred',
              generation_before: 2,
              detail: null,
            },
          ],
          fresh: [
            { name: 'backend-1', kind: 'backend', generation: 4 },
            { name: 'backend-2', kind: 'backend', generation: 2 },
          ],
          recycle_stopped: null,
        },
  });
}

describe('EnvironmentTab — a save that rolls a worker recycle', () => {
  it('shows every recycled worker and the writer recycling itself, and no restart list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EnvironmentTab readOnly={false} />, {
      client: baseStub(vi.fn(() => rolledSave(false))),
    });
    await screen.findByLabelText('Name of variable OPENAI_API_KEY');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const section = await screen.findByRole('region', { name: 'Worker recycle' });
    expect(section).toHaveTextContent(
      'Some changed settings take effect only in a fresh worker process, so the fleet recycled its workers one at a time.',
    );
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('backend-1');
    expect(rows[0]).toHaveTextContent('recycled');
    expect(rows[0]).toHaveTextContent('life 3 to 4');
    expect(rows[2]).toHaveTextContent('self-deferred');
    expect(rows[2]).toHaveTextContent('this worker recycles itself after replying');
    // The server's verdict is empty for a converged roll: no restart panel, whatever the rows say.
    expect(screen.queryByText(/need a restart/)).toBeNull();
  });

  it('says where a stopped recycle stopped and lists the workers still waiting for a restart', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EnvironmentTab readOnly={false} />, {
      client: baseStub(vi.fn(() => rolledSave(true))),
    });
    await screen.findByLabelText('Name of variable OPENAI_API_KEY');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const stopped = await screen.findByTestId('recycle-stopped');
    expect(stopped).toHaveTextContent('The recycle stopped at backend-1 (backend workers)');
    expect(stopped).toHaveTextContent('its old life was still present after 90s');
    const restart = screen.getByText(/workers need a restart/).closest('[role="status"]');
    expect(restart).not.toBeNull();
    expect(restart).toHaveTextContent('serve-1');
    expect(restart).toHaveTextContent('backend-1');
    expect(restart).toHaveTextContent('backend-2');
  });

  it('shows no recycle section for a save that carried no recycle-class key', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EnvironmentTab readOnly={false} />, { client: baseStub(vi.fn(saved)) });
    await screen.findByLabelText('Name of variable OPENAI_API_KEY');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
    expect(screen.queryByRole('region', { name: 'Worker recycle' })).toBeNull();
  });
});
