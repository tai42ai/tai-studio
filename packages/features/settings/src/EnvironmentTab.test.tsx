import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, SettingsSchema } from '@tai42/api-client';

import { EnvironmentTab } from './EnvironmentTab';
import { renderWithProviders } from './test-utils';

function schemaFixture(): SettingsSchema {
  return {
    groups: [
      {
        name: 'AppSettings',
        module: 'tai_app.settings',
        qualname: 'tai_app.settings.AppSettings',
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
    status: 'reloaded',
    env_keys: 1,
    fanout: { mode: 'local-only', note: 'no worker bus configured; only this worker reloaded' },
  });
}

function baseStub(setEnvConfig?: ApiClient['setEnvConfig']): ApiClient {
  return stubClient({
    getEnvConfig: vi.fn(() => Promise.resolve(envFixture())),
    getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
    ...(setEnvConfig === undefined ? {} : { setEnvConfig }),
  });
}

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
        expect.objectContaining({ TAI_ENV_SECRET_KEYS: 'FOO,OPENAI_API_KEY' }),
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
      expect(setEnvConfig).toHaveBeenCalledWith(
        expect.objectContaining({ TAI_ENV_SECRET_KEYS: '' }),
      );
    });
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
      expect(setEnvConfig).toHaveBeenCalledWith(expect.objectContaining({ A: '1', B: '' }));
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
      expect(setEnvConfig).toHaveBeenCalledWith(expect.objectContaining({ A: '', A2: '1' }));
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

  it('disables every control in read-only mode', async () => {
    const setEnvConfig = vi.fn(saved);
    renderWithProviders(<EnvironmentTab readOnly={true} />, { client: baseStub(setEnvConfig) });

    expect(await screen.findByLabelText('Name of variable FOO')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add variable' })).not.toBeInTheDocument();
    expect(setEnvConfig).not.toHaveBeenCalled();
  });
});
