import type { ApiClient, SettingsSchema } from '@tai42/api-client';
import { GuardedTabs } from '@tai42/studio-sdk';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProfilesTab } from './ProfilesTab';
import {
  decorBorderedControls,
  fullProjection,
  renderWithProviders,
  scopedProjection,
} from './test-utils';

// -- fixtures ----------------------------------------------------------------

function schemaFixture(): SettingsSchema {
  return {
    groups: [
      {
        name: 'AppSettings',
        module: 'tai42_app.settings',
        qualname: 'tai42_app.settings.AppSettings',
        fields: [
          {
            name: 'openai_key',
            env_var: 'OWNED_SECRET',
            type: 'string',
            default: null,
            required: false,
            secret: true,
            description: null,
            nested_group: null,
            default_namespace_var: null,
            value: null,
          },
        ],
      },
    ],
  };
}

function profilesFixture(): { name: string; description: string }[] {
  return [
    { name: 'prod', description: 'Production settings' },
    { name: 'dev', description: 'Local dev settings' },
  ];
}

function prodBody(): { description: string; env: Record<string, string>; secret_keys: string[] } {
  return {
    description: 'Production settings',
    env: { API_TOKEN: 'super-secret', PLAIN: 'hello' },
    secret_keys: ['API_TOKEN'],
  };
}

interface Stub {
  readonly listSettingsProfiles?: ApiClient['listSettingsProfiles'];
  readonly getSettingsSchema?: ApiClient['getSettingsSchema'];
  readonly getSettingsProfile?: ApiClient['getSettingsProfile'];
  readonly putSettingsProfile?: ApiClient['putSettingsProfile'];
  readonly deleteSettingsProfile?: ApiClient['deleteSettingsProfile'];
}

function stubClient(methods: Stub): ApiClient {
  return {
    listSettingsProfiles: vi.fn(() => Promise.resolve(profilesFixture())),
    getSettingsSchema: vi.fn(() => Promise.resolve(schemaFixture())),
    ...methods,
  } as unknown as ApiClient;
}

// -- list --------------------------------------------------------------------

describe('ProfilesTab — list', () => {
  it('renders each profile as a name + description row (no last-modified column)', async () => {
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({}),
      projection: fullProjection(),
    });

    expect(await screen.findByText('prod')).toBeInTheDocument();
    expect(screen.getByText('Production settings')).toBeInTheDocument();
    expect(screen.getByText('dev')).toBeInTheDocument();
    // The contract carries identity only — no history column on the list.
    expect(screen.queryByText(/last.?modified/i)).not.toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Name', 'Description', 'Actions']);
  });

  it('shows a list-only editor the profiles WITHOUT any management control', async () => {
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({}),
      // A scoped (non-admin) projection: the secret/fenced controls stay hidden.
      projection: scopedProjection({
        routes: [{ path: '/api/config/profiles', methods: ['GET'] }],
      }),
    });

    expect(await screen.findByText('prod')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply profile prod' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('never renders a reserved “@”-prefixed profile as a manageable row', async () => {
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({
        listSettingsProfiles: vi.fn(() =>
          Promise.resolve([
            { name: 'prod', description: 'Production settings' },
            { name: '@previous', description: 'auto-saved by the last apply' },
          ]),
        ),
      }),
      projection: fullProjection(),
    });

    // The reserved profile is driven only by the Revert button — it is filtered from
    // the list, so it never shows Edit/Apply/Delete/Diff/History controls.
    expect(await screen.findByText('prod')).toBeInTheDocument();
    expect(screen.queryByText('@previous')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-row-@previous')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply profile @previous' }),
    ).not.toBeInTheDocument();
  });
});

// -- create / edit -----------------------------------------------------------

describe('ProfilesTab — create & edit', () => {
  it('creates a profile: PUTs the assembled document', async () => {
    const user = userEvent.setup();
    const putSettingsProfile = vi.fn(() => Promise.resolve({ ok: true as const, version: 1 }));
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({ putSettingsProfile }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'New profile' }));
    await user.type(await screen.findByLabelText('Profile name'), 'staging');
    await user.type(screen.getByLabelText('Profile description'), 'Staging env');
    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    // Fill the value before the name — typing the key renames the value input's label.
    await user.type(screen.getByLabelText('Value of new variable 1'), 'on');
    await user.type(screen.getByLabelText('Name of new variable 1'), 'FEATURE_FLAG');
    await user.click(screen.getByRole('button', { name: 'Create profile' }));

    await waitFor(() => {
      expect(putSettingsProfile).toHaveBeenCalledWith('staging', {
        description: 'Staging env',
        env: { FEATURE_FLAG: 'on' },
        secret_keys: [],
      });
    });
  });

  it('creates a profile with TWO variables — each row keeps its own name/value (unique ids)', async () => {
    // Regression: the editor's row-id counter must persist across renders (a
    // ref-backed monotonic id). A render-recreated counter hands every added row the
    // SAME id, and the id-keyed setKey/setValue then mutate all rows sharing it — so a
    // 2nd variable overwrites the 1st, tripping the duplicate/blank guard and disabling
    // Create. Adding two distinct vars must leave both intact with Create enabled.
    const user = userEvent.setup();
    const putSettingsProfile = vi.fn(() => Promise.resolve({ ok: true as const, version: 1 }));
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({ putSettingsProfile }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'New profile' }));
    await user.type(await screen.findByLabelText('Profile name'), 'multi');

    // First variable. Value before name — typing the key renames the value input's label.
    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    await user.type(screen.getByLabelText('Value of new variable 1'), 'v-alpha');
    await user.type(screen.getByLabelText('Name of new variable 1'), 'ALPHA');

    // Second variable — with the bug this shares the first row's id and cross-mutates it.
    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    await user.type(screen.getByLabelText('Value of new variable 2'), 'v-beta');
    await user.type(screen.getByLabelText('Name of new variable 2'), 'BETA');

    // Both rows retained their OWN name/value — no cross-mutation.
    expect(screen.getByLabelText('Name of variable ALPHA')).toHaveValue('ALPHA');
    expect(screen.getByLabelText('Value of variable ALPHA')).toHaveValue('v-alpha');
    expect(screen.getByLabelText('Name of variable BETA')).toHaveValue('BETA');
    expect(screen.getByLabelText('Value of variable BETA')).toHaveValue('v-beta');

    // No false "names must be unique" — Create is enabled and PUTs both variables.
    expect(screen.queryByText(/must be unique and non-empty/i)).not.toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Create profile' });
    expect(create).toBeEnabled();

    await user.click(create);
    await waitFor(() => {
      expect(putSettingsProfile).toHaveBeenCalledWith('multi', {
        description: '',
        env: { ALPHA: 'v-alpha', BETA: 'v-beta' },
        secret_keys: [],
      });
    });
  });

  it('rejects a reserved “@”-prefixed profile name', async () => {
    const user = userEvent.setup();
    const putSettingsProfile = vi.fn(() => Promise.resolve({ ok: true as const, version: 1 }));
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({ putSettingsProfile }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'New profile' }));
    await user.type(await screen.findByLabelText('Profile name'), '@previous');

    expect(screen.getByText(/reserved and cannot be used/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create profile' })).toBeDisabled();
    expect(putSettingsProfile).not.toHaveBeenCalled();
  });

  it('edits a profile: seeds from the saved body and PUTs the change', async () => {
    const user = userEvent.setup();
    const getSettingsProfile = vi.fn(() => Promise.resolve(prodBody()));
    const putSettingsProfile = vi.fn(() => Promise.resolve({ ok: true as const, version: 2 }));
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({ getSettingsProfile, putSettingsProfile }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit profile prod' }));
    const plain = await screen.findByLabelText('Value of variable PLAIN');
    await user.clear(plain);
    await user.type(plain, 'world');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      expect(putSettingsProfile).toHaveBeenCalledWith('prod', {
        description: 'Production settings',
        env: { API_TOKEN: 'super-secret', PLAIN: 'world' },
        secret_keys: ['API_TOKEN'],
      });
    });
  });

  it('masks a secret-marked value in the editor and reveals it on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({ getSettingsProfile: vi.fn(() => Promise.resolve(prodBody())) }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit profile prod' }));
    const container = await screen.findByTestId('profile-secret-API_TOKEN');
    const input = container.querySelector('input');
    expect(input).toHaveAttribute('type', 'password');
    // The real value lives in the masked input, never as visible text.
    expect(screen.queryByText('super-secret')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('profile-secret-API_TOKEN-toggle'));
    expect(container.querySelector('input')).toHaveAttribute('type', 'text');
  });

  it('masks an owned key the class marks non-secret but the profile marks secret (true union)', async () => {
    const user = userEvent.setup();
    const schema: SettingsSchema = {
      groups: [
        {
          name: 'AppSettings',
          module: 'tai42_app.settings',
          qualname: 'tai42_app.settings.AppSettings',
          fields: [
            {
              name: 'plain_owned',
              env_var: 'OWNED_PLAIN',
              type: 'string',
              default: null,
              required: false,
              secret: false,
              description: null,
              nested_group: null,
              default_namespace_var: null,
              value: null,
            },
          ],
        },
      ],
    };
    const body = {
      description: 'Production settings',
      env: { OWNED_PLAIN: 'sensitive-value' },
      secret_keys: ['OWNED_PLAIN'],
    };
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({
        getSettingsSchema: vi.fn(() => Promise.resolve(schema)),
        getSettingsProfile: vi.fn(() => Promise.resolve(body)),
      }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit profile prod' }));
    // The class marks OWNED_PLAIN non-secret, but the profile marks it secret: the
    // true union masks it (either source is enough), never rendering the plaintext.
    const container = await screen.findByTestId('profile-secret-OWNED_PLAIN');
    expect(container.querySelector('input')).toHaveAttribute('type', 'password');
    expect(screen.queryByText('sensitive-value')).not.toBeInTheDocument();
  });

  it('deletes a profile behind a confirm', async () => {
    const user = userEvent.setup();
    const deleteSettingsProfile = vi.fn(() => Promise.resolve({ ok: true as const }));
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({ deleteSettingsProfile }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Delete profile prod' }));
    await user.click(screen.getByRole('button', { name: 'Delete profile' }));

    await waitFor(() => {
      expect(deleteSettingsProfile).toHaveBeenCalledWith('prod');
    });
  });

  it('wears the ghost style on the per-row Delete profile, not filled danger', async () => {
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({}),
      projection: fullProjection(),
    });

    // Deleting a profile is a routine row action: low-emphasis in the table; the danger
    // emphasis lives on the confirm dialog's Delete button.
    const rowDelete = await screen.findByRole('button', { name: 'Delete profile prod' });
    expect(rowDelete).toHaveClass('tai-btn-ghost');
    expect(rowDelete).not.toHaveClass('tai-btn-danger');
  });

  it('wears the ghost style on an env-var row Remove in the editor, not filled danger', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({}),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'New profile' }));
    await user.click(await screen.findByRole('button', { name: 'Add variable' }));

    // The per-row Remove in the env-map editor is a routine list-item control; it stays
    // low-emphasis, distinct from the form's own emphasized submit.
    const rowRemove = screen.getByRole('button', { name: 'Remove new variable 1' });
    expect(rowRemove).toHaveClass('tai-btn-ghost');
    expect(rowRemove).not.toHaveClass('tai-btn-danger');
  });
});

// -- a11y & dirty guard ------------------------------------------------------

describe('ProfilesTab — a11y & dirty guard', () => {
  it('draws no control on the decorative border token', async () => {
    const { container } = renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({}),
      projection: fullProjection(),
    });
    await screen.findByText('prod');
    expect(decorBorderedControls(container)).toEqual([]);
  });

  it('confirms before a tab switch discards an unsaved profile edit', async () => {
    // The modal traps pointer events on the backdrop; bypass the check so the guarded
    // tab switch behind it can be exercised.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithProviders(
      <GuardedTabs
        items={[
          { value: 'profiles', label: 'Profiles', content: <ProfilesTab readOnly={false} /> },
          { value: 'other', label: 'Other', content: <div>other panel</div> },
        ]}
        defaultValue="profiles"
      />,
      { client: stubClient({}), projection: fullProjection() },
    );

    await user.click(await screen.findByRole('button', { name: 'New profile' }));
    await user.type(await screen.findByLabelText('Profile name'), 'staging');

    // Switching tabs while the draft is dirty holds the switch behind the discard confirm.
    // The open dialog marks the tab list aria-hidden, so the tab is reached with
    // `hidden` and the pointer-events check is bypassed.
    await user.click(screen.getByRole('tab', { name: 'Other', hidden: true }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(screen.queryByText('other panel')).not.toBeInTheDocument();
  });
});
