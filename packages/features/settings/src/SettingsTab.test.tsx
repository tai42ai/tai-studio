import type { ApiClient, SettingsSchema } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
            accepted_env_vars: ['TAI_PORT'],
            key_material: false,
            reload_class: 'hot',
            type: 'integer',
            default: 8000,
            required: false,
            secret: false,
            description: 'The listen port',
            nested_group: null,
            default_namespace_var: null,
            value: 100,
            value_source: 'stored',
          },
          {
            name: 'debug',
            env_var: 'TAI_DEBUG',
            accepted_env_vars: ['TAI_DEBUG'],
            key_material: false,
            reload_class: 'hot',
            type: 'boolean',
            default: false,
            required: false,
            secret: false,
            description: null,
            nested_group: null,
            default_namespace_var: null,
            value: false,
            value_source: 'field_default',
          },
          {
            name: 'api_key',
            env_var: 'TAI_API_KEY',
            accepted_env_vars: ['TAI_API_KEY'],
            key_material: false,
            reload_class: 'hot',
            type: 'string',
            default: null,
            required: true,
            secret: true,
            description: 'The upstream secret',
            nested_group: null,
            default_namespace_var: null,
            value: 'topsecret',
            value_source: 'stored',
          },
          {
            name: 'redis',
            env_var: '',
            accepted_env_vars: [],
            key_material: false,
            reload_class: 'hot',
            type: 'object',
            default: null,
            required: false,
            secret: false,
            description: null,
            nested_group: 'RedisSettings',
            default_namespace_var: null,
            value: null,
            value_source: null,
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
    span_release_error: null,
    status: 'reloaded',
    env_keys: 1,
    awaiting_respawn: [],
    recycle: null,
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
      expect(setEnvConfig).toHaveBeenCalledWith({ env: { TAI_PORT: '123', TAI_DEBUG: 'true' } });
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

  it('shows an em-dash placeholder for a null-default field (never a blank that implies a hidden default)', async () => {
    const schema: SettingsSchema = {
      groups: [
        {
          name: 'AppSettings',
          module: 'tai42_app.settings',
          qualname: 'tai42_app.settings.AppSettings',
          fields: [
            {
              name: 'pg_host',
              env_var: 'TAI_DATABASE_DEFAULT_PG_HOST',
              accepted_env_vars: ['TAI_DATABASE_DEFAULT_PG_HOST'],
              key_material: false,
              reload_class: 'hot',
              type: 'string',
              default: null,
              required: false,
              secret: false,
              description: null,
              nested_group: null,
              default_namespace_var: null,
              value: null,
              value_source: 'field_default',
            },
          ],
        },
      ],
    };
    const client = stubClient({ getSettingsSchema: vi.fn(() => Promise.resolve(schema)) });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    const input = await screen.findByLabelText('pg_host');
    // Unset value, and the placeholder is an honest em-dash — not an empty string that
    // could read as a silent localhost default.
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '—');
  });
});

describe('SettingsTab — fields the deployment sets', () => {
  function lockedFixture(): SettingsSchema {
    const base = {
      required: false,
      description: null,
      nested_group: null,
      default_namespace_var: null,
      value_source: 'deployment' as const,
    };
    return {
      groups: [
        {
          name: 'AppSettings',
          module: 'tai42_app.settings',
          qualname: 'tai42_app.settings.AppSettings',
          fields: [
            {
              ...base,
              name: 'host',
              env_var: 'TAI_HOST',
              accepted_env_vars: ['TAI_HOST'],
              key_material: false,
              reload_class: 'hot',
              type: 'string',
              default: null,
              secret: false,
              value: '10.0.0.5',
            },
            {
              ...base,
              name: 'workers',
              env_var: 'TAI_WORKERS',
              accepted_env_vars: ['TAI_WORKERS'],
              key_material: false,
              reload_class: 'hot',
              type: 'integer',
              default: 1,
              secret: false,
              value: 4,
            },
            {
              ...base,
              name: 'verbose',
              env_var: 'TAI_VERBOSE',
              accepted_env_vars: ['TAI_VERBOSE'],
              key_material: false,
              reload_class: 'hot',
              type: 'boolean',
              default: false,
              secret: false,
              value: true,
            },
            {
              ...base,
              name: 'token',
              env_var: 'TAI_TOKEN',
              accepted_env_vars: ['TAI_TOKEN'],
              key_material: false,
              reload_class: 'hot',
              type: 'string',
              default: null,
              secret: true,
              value: 'deploy-secret',
            },
            {
              ...base,
              name: 'port',
              env_var: 'TAI_PORT',
              accepted_env_vars: ['TAI_PORT'],
              key_material: false,
              reload_class: 'hot',
              type: 'integer',
              default: 8000,
              secret: false,
              value: 8000,
              value_source: 'stored',
            },
          ],
        },
      ],
    };
  }

  it('shows each deployment-set field read-only with its value and the lock text', async () => {
    const client = stubClient({ getSettingsSchema: vi.fn(() => Promise.resolve(lockedFixture())) });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    const host = await screen.findByLabelText('host');
    expect(host).toBeDisabled();
    expect(host).toHaveValue('10.0.0.5');
    expect(screen.getByLabelText('workers')).toBeDisabled();
    expect(screen.getByLabelText('workers')).toHaveValue(4);
    const verbose = screen.getByRole('checkbox', { name: 'verbose' });
    expect(verbose).toBeDisabled();
    expect(verbose).toBeChecked();
    // The secret stays revealable; it is read-only, never editable.
    const token = screen.getByLabelText('token');
    expect(token).toHaveAttribute('readonly');
    expect(token).toHaveValue('deploy-secret');
    expect(screen.getAllByText('Set by the deployment')).toHaveLength(4);
    // A field the deployment does not set stays editable, without the lock text.
    expect(screen.getByLabelText('port')).toBeEnabled();
  });

  it('describes each locked control by its lock text, beside its own description', async () => {
    const schema = lockedFixture();
    const [group] = schema.groups;
    if (group === undefined) throw new Error('fixture has no group');
    const described: SettingsSchema = {
      groups: [
        {
          ...group,
          fields: group.fields.map((field) =>
            field.name === 'host' ? { ...field, description: 'The bind address.' } : field,
          ),
        },
      ],
    };
    const client = stubClient({ getSettingsSchema: vi.fn(() => Promise.resolve(described)) });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    expect(await screen.findByLabelText('host')).toHaveAccessibleDescription(
      'Set by the deployment The bind address.',
    );
    expect(screen.getByLabelText('workers')).toHaveAccessibleDescription('Set by the deployment');
    expect(screen.getByRole('checkbox', { name: 'verbose' })).toHaveAccessibleDescription(
      'Set by the deployment',
    );
    expect(screen.getByLabelText('token')).toHaveAccessibleDescription('Set by the deployment');
    expect(screen.getByLabelText('port')).toHaveAccessibleDescription('');
  });

  it('never puts a deployment-set field in the save payload', async () => {
    const user = userEvent.setup();
    const setEnvConfig = vi.fn(saved);
    const client = stubClient({
      getSettingsSchema: vi.fn(() => Promise.resolve(lockedFixture())),
      setEnvConfig,
    });
    renderWithProviders(<SettingsTab readOnly={false} />, { client });

    const host = await screen.findByLabelText('host');
    await user.type(host, 'x');
    await user.type(screen.getByLabelText('token'), 'x');
    await user.click(screen.getByRole('checkbox', { name: 'verbose' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    const port = screen.getByLabelText('port');
    await user.clear(port);
    await user.type(port, '9000');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setEnvConfig).toHaveBeenCalledWith({ env: { TAI_PORT: '9000' } });
    });
  });
});
