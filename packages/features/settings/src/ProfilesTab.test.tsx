import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, SettingsSchema } from '@tai42/api-client';
import { GuardedTabs } from '@tai42/studio-sdk';

import { ProfilesTab, assertApplyable } from './ProfilesTab';
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

/** A diff whose apply is allowed (empty `refused_keys`). */
function cleanDiff(): {
  added: string[];
  removed: string[];
  changed: { key: string; old: string; new: string }[];
  recycle_keys: string[];
  refused_keys: string[];
} {
  return {
    added: ['NEW_KEY'],
    removed: ['OLD_KEY'],
    changed: [{ key: 'API_TOKEN', old: 'old-secret', new: 'new-secret' }],
    recycle_keys: ['TAI_DEFAULT_REDIS_URL'],
    refused_keys: [],
  };
}

/** The apply report — a self-deferred applier recycle line, empty refused, a lone-worker fanout. */
function applyReport(): ReturnType<ApiClient['applySettingsProfile']> {
  return Promise.resolve({
    hot: ['APP_TITLE'],
    recycle: [
      { origin: 'worker-a', kind: 'serve', status: 'self-deferred' },
      { origin: 'worker-b', kind: 'serve', status: 'recycled' },
    ],
    refused: [] as { key: string; reason: string }[],
    fanout: {
      mode: 'local-only' as const,
      note: 'no worker bus configured; only this worker reloaded',
    },
  });
}

interface Stub {
  readonly listSettingsProfiles?: ApiClient['listSettingsProfiles'];
  readonly getSettingsSchema?: ApiClient['getSettingsSchema'];
  readonly getSettingsProfile?: ApiClient['getSettingsProfile'];
  readonly putSettingsProfile?: ApiClient['putSettingsProfile'];
  readonly deleteSettingsProfile?: ApiClient['deleteSettingsProfile'];
  readonly diffSettingsProfile?: ApiClient['diffSettingsProfile'];
  readonly applySettingsProfile?: ApiClient['applySettingsProfile'];
  readonly listSettingsProfileVersions?: ApiClient['listSettingsProfileVersions'];
  readonly getSettingsProfileVersion?: ApiClient['getSettingsProfileVersion'];
  readonly rollbackSettingsProfile?: ApiClient['rollbackSettingsProfile'];
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
});

// -- diff --------------------------------------------------------------------

describe('ProfilesTab — diff preview', () => {
  it('masks changed values and calls out recycle keys', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({ diffSettingsProfile: vi.fn(() => Promise.resolve(cleanDiff())) }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Diff profile prod' }));

    // The real changed values never reach the DOM — only the masked stand-ins.
    await waitFor(() => {
      expect(screen.getByTestId('diff-row-API_TOKEN')).toBeInTheDocument();
    });
    expect(screen.queryByText(/old-secret/)).not.toBeInTheDocument();
    expect(screen.queryByText(/new-secret/)).not.toBeInTheDocument();
    // The recycle-class key is called out; there is no refusal on a clean diff.
    expect(screen.getByTestId('diff-recycle')).toHaveTextContent('TAI_DEFAULT_REDIS_URL');
    expect(screen.queryByTestId('diff-refused')).not.toBeInTheDocument();
  });

  it('calls out refused keys prominently', async () => {
    const user = userEvent.setup();
    const diff = { ...cleanDiff(), refused_keys: ['TAI_K8S_NAMESPACE'] };
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({ diffSettingsProfile: vi.fn(() => Promise.resolve(diff)) }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Diff profile prod' }));
    expect(await screen.findByTestId('diff-refused')).toHaveTextContent('TAI_K8S_NAMESPACE');
  });
});

// -- apply -------------------------------------------------------------------

describe('ProfilesTab — apply', () => {
  it('applies after review and renders the report (self-deferred recycle line)', async () => {
    const user = userEvent.setup();
    const applySettingsProfile = vi.fn(() => applyReport());
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({
        diffSettingsProfile: vi.fn(() => Promise.resolve(cleanDiff())),
        applySettingsProfile,
      }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Apply profile prod' }));
    // The review shows the diff callouts; apply is enabled (no refusal).
    const apply = await screen.findByRole('button', { name: 'Apply profile' });
    await waitFor(() => {
      expect(apply).toBeEnabled();
    });
    await user.click(apply);

    const report = await screen.findByTestId('apply-report');
    expect(applySettingsProfile).toHaveBeenCalledWith('prod');
    // Hot-swapped keys, and the applier's OWN self-deferred recycle line.
    expect(within(report).getByText('APP_TITLE')).toBeInTheDocument();
    expect(within(report).getByTestId('apply-recycle')).toHaveTextContent('self-deferred');
    expect(within(report).getByTestId('apply-recycle')).toHaveTextContent('worker-a');
  });

  it('renders a populated refused section when the apply refuses', async () => {
    const user = userEvent.setup();
    const applySettingsProfile = vi.fn(() =>
      Promise.resolve({
        hot: [],
        recycle: [],
        refused: [{ key: 'TAI_APP_PROVIDERS', reason: 'boundary-refused: no recycle path' }],
        fanout: { mode: 'local-only' as const, note: 'only this worker reloaded' },
      }),
    );
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({
        diffSettingsProfile: vi.fn(() => Promise.resolve(cleanDiff())),
        applySettingsProfile,
      }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Apply profile prod' }));
    await user.click(await screen.findByRole('button', { name: 'Apply profile' }));

    const refused = await screen.findByTestId('apply-refused');
    expect(refused).toHaveTextContent('TAI_APP_PROVIDERS');
    expect(refused).toHaveTextContent('boundary-refused: no recycle path');
  });

  it('ABORTS apply when the diff carries refused keys — the button is blocked', async () => {
    const user = userEvent.setup();
    const applySettingsProfile = vi.fn(() => applyReport());
    const diff = { ...cleanDiff(), refused_keys: ['TAI_K8S_NAMESPACE'] };
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({
        diffSettingsProfile: vi.fn(() => Promise.resolve(diff)),
        applySettingsProfile,
      }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Apply profile prod' }));
    expect(await screen.findByTestId('diff-refused')).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Apply profile' });
    expect(apply).toBeDisabled();
    await user.click(apply);
    expect(applySettingsProfile).not.toHaveBeenCalled();
  });

  it('reverts the last apply by applying the reserved @previous profile', async () => {
    const user = userEvent.setup();
    const applySettingsProfile = vi.fn(() => applyReport());
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({
        diffSettingsProfile: vi.fn(() => Promise.resolve(cleanDiff())),
        applySettingsProfile,
      }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Revert last apply' }));
    const apply = await screen.findByRole('button', { name: 'Apply profile' });
    await waitFor(() => {
      expect(apply).toBeEnabled();
    });
    await user.click(apply);

    await waitFor(() => {
      expect(applySettingsProfile).toHaveBeenCalledWith('@previous');
    });
  });

  it('invalidates the live env-config cache on apply', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({
        diffSettingsProfile: vi.fn(() => Promise.resolve(cleanDiff())),
        applySettingsProfile: vi.fn(() => applyReport()),
      }),
      projection: fullProjection(),
      queryClient,
    });

    await user.click(await screen.findByRole('button', { name: 'Apply profile prod' }));
    const apply = await screen.findByRole('button', { name: 'Apply profile' });
    await waitFor(() => {
      expect(apply).toBeEnabled();
    });
    await user.click(apply);

    await screen.findByTestId('apply-report');
    // A full-replace apply moves the live deployment env — its cache must be invalidated.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['env-config'] });
  });
});

describe('ProfilesTab — apply refusal guard', () => {
  it('the mutationFn guard throws when handed refused keys (defense in depth)', () => {
    expect(() => {
      assertApplyable(['TAI_K8S_NAMESPACE']);
    }).toThrow(/refus/i);
  });

  it('the guard permits an empty refused list', () => {
    expect(() => {
      assertApplyable([]);
    }).not.toThrow();
  });
});

// -- version history ---------------------------------------------------------

describe('ProfilesTab — version history', () => {
  function versionsMeta(): {
    version: number;
    tags: string[];
    created_at: string;
    is_current: boolean;
  }[] {
    return [
      { version: 2, tags: [], created_at: '2026-08-07T00:00:00Z', is_current: true },
      { version: 1, tags: ['seed'], created_at: '2026-08-06T00:00:00Z', is_current: false },
    ];
  }
  function versionBody(version: number): {
    version: number;
    tags: string[];
    created_at: string;
    is_current: boolean;
    body: { description: string; env: Record<string, string>; secret_keys: string[] };
  } {
    return {
      version,
      tags: version === 1 ? ['seed'] : [],
      created_at: version === 2 ? '2026-08-07T00:00:00Z' : '2026-08-06T00:00:00Z',
      is_current: version === 2,
      body: {
        description: 'Production settings',
        env: { API_TOKEN: 'historic-secret', PLAIN: 'kept' },
        secret_keys: ['API_TOKEN'],
      },
    };
  }

  it('lists versions with masked bodies and rolls back', async () => {
    const user = userEvent.setup();
    const rollbackSettingsProfile = vi.fn(() => Promise.resolve({ ok: true as const, version: 1 }));
    renderWithProviders(<ProfilesTab readOnly={false} />, {
      client: stubClient({
        listSettingsProfileVersions: vi.fn(() => Promise.resolve(versionsMeta())),
        getSettingsProfileVersion: vi.fn((_name: string, version: number) =>
          Promise.resolve(versionBody(version)),
        ),
        rollbackSettingsProfile,
      }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Version history for prod' }));

    expect(await screen.findByTestId('version-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('version-row-1')).toBeInTheDocument();
    // The secret env value is masked in the history body — never rendered in clear.
    await waitFor(() => {
      expect(screen.queryByText('historic-secret')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Roll back to version 1' }));
    await user.click(screen.getByRole('button', { name: 'Roll back' }));
    await waitFor(() => {
      expect(rollbackSettingsProfile).toHaveBeenCalledWith('prod', 1);
    });
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
