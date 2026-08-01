import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, SettingsSchema } from '@tai42/api-client';

import { SettingsTab } from './SettingsTab';
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
            description: 'The listen port',
            nested_group: null,
            default_namespace_var: null,
            value: 100,
          },
          {
            name: 'debug',
            env_var: 'TAI_DEBUG',
            type: 'boolean',
            default: false,
            required: false,
            secret: false,
            description: null,
            nested_group: null,
            default_namespace_var: null,
            value: false,
          },
          {
            name: 'api_key',
            env_var: 'TAI_API_KEY',
            type: 'string',
            default: null,
            required: true,
            secret: true,
            description: 'The upstream secret',
            nested_group: null,
            default_namespace_var: null,
            value: 'topsecret',
          },
          {
            name: 'redis',
            env_var: '',
            type: 'object',
            default: null,
            required: false,
            secret: false,
            description: null,
            nested_group: 'RedisSettings',
            default_namespace_var: null,
            value: null,
          },
        ],
      },
    ],
  };
}

interface Stub {
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

describe('SettingsTab', () => {
  it('renders one card per group with a typed input per field and a required marker', async () => {
    const client = stubClient({ getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())) });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    expect(await screen.findByRole('heading', { name: 'AppSettings' })).toBeInTheDocument();
    expect(screen.getByText('tai42_app.settings')).toBeInTheDocument();
    expect(screen.getByLabelText('port')).toHaveValue(100);
    expect(screen.getByRole('checkbox', { name: 'debug' })).toBeInTheDocument();
    // The required secret field carries a marker.
    expect(screen.getByText('api_key *')).toBeInTheDocument();
  });

  it('masks a secret field and reveals it on toggle', async () => {
    const user = userEvent.setup();
    const client = stubClient({ getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())) });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    const secret = await screen.findByLabelText('api_key *');
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toHaveValue('topsecret');

    await user.click(screen.getByTestId('settings-secret-TAI_API_KEY-toggle'));
    expect(screen.getByLabelText('api_key *')).toHaveAttribute('type', 'text');
  });

  it('renders a nested-group field as a non-editable reference', async () => {
    const client = stubClient({ getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())) });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    const ref = await screen.findByTestId('settings-nested-redis');
    expect(ref).toHaveTextContent('RedisSettings');
    // A nested-group field offers no editable control.
    expect(screen.queryByLabelText('redis')).not.toBeInTheDocument();
  });

  it('saves edited number and boolean fields as round-tripping strings', async () => {
    const user = userEvent.setup();
    const setEnvConfig = vi.fn(saved);
    const client = stubClient({
      getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
      setEnvConfig,
    });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    const port = await screen.findByLabelText('port');
    await user.clear(port);
    await user.type(port, '123');
    await user.click(screen.getByRole('checkbox', { name: 'debug' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith({ TAI_PORT: '123', TAI_DEBUG: 'true' });
    });
  });

  it('disables every input and offers no Save in read-only mode', async () => {
    const setEnvConfig = vi.fn(saved);
    const client = stubClient({
      getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
      setEnvConfig,
    });
    renderWithProviders(<SettingsTab readOnly={true} />, { client });

    expect(await screen.findByLabelText('port')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'debug' })).toBeDisabled();
    // The secret field is read-only (not editable) but stays revealable — masking
    // is display-only, so a read-only deployment must still be able to reveal it.
    const secret = screen.getByLabelText('api_key *');
    expect(secret).toHaveAttribute('readonly');
    expect(screen.getByTestId('settings-secret-TAI_API_KEY-toggle')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(setEnvConfig).not.toHaveBeenCalled();
  });

  it('renders an empty state when the schema has no groups', async () => {
    const client = stubClient({
      getSettingsSchema: vi.fn(() => Promise.resolve({ groups: [] })),
    });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    expect(await screen.findByText('No settings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('surfaces a loud error state when the schema read rejects', async () => {
    const client = stubClient({
      getSettingsSchema: vi.fn().mockRejectedValue(new Error('schema unavailable')),
    });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('schema unavailable');
  });
});
