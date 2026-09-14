import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, SettingsSchema } from '@tai42/api-client';

import { ProfilesTab } from './ProfilesTab';
import { fullProjection, renderWithProviders } from './test-utils';

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

/** The apply report — a recycled target with a joined fresh life on its slot name, a
 * self-deferred applier line, empty refused, a lone-worker fanout. */
function applyReport(): ReturnType<ApiClient['applySettingsProfile']> {
  return Promise.resolve({
    hot: ['APP_TITLE'],
    recycle: [
      { name: 'serve-1', kind: 'serve', status: 'recycled', generation_before: 4 },
      { name: 'serve-2', kind: 'serve', status: 'self-deferred', generation_before: 2 },
    ],
    fresh: [{ name: 'serve-1', kind: 'serve', generation: 5 }],
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
  it('applies after review and renders the report (recycle lives + self-deferred line)', async () => {
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
    const recycle = within(report).getByTestId('apply-recycle');
    expect(recycle).toHaveTextContent('self-deferred');
    expect(recycle).toHaveTextContent('serve-1');
    // The recycled target's generation_before renders; a fresh life sharing its NAME is
    // joined for display only as `life N to M` (never a successor claim).
    expect(recycle).toHaveTextContent('life 4 to 5');
    // serve-2 (the self-deferred applier) has no joined fresh life — its own life shows.
    // Scope to serve-2's OWN row so the assertion can't pass on another row's text.
    const serve2Row = within(recycle).getByText('serve-2').closest('li') as HTMLElement;
    expect(within(serve2Row).getByText('life 2')).toBeInTheDocument();
  });

  it('renders a fresh life on a DIFFERENT name un-joined, on its own row (no successor claim)', async () => {
    const user = userEvent.setup();
    const applySettingsProfile = vi.fn(() =>
      Promise.resolve({
        hot: [],
        recycle: [{ name: 'serve-1', kind: 'serve', status: 'recycled', generation_before: 3 }],
        // The fresh life carries a DIFFERENT name than the recycled target: it is not
        // joined onto that row, it renders on its own under Fresh lives.
        fresh: [{ name: 'serve-9', kind: 'serve', generation: 1 }],
        refused: [] as { key: string; reason: string }[],
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
    const apply = await screen.findByRole('button', { name: 'Apply profile' });
    await waitFor(() => {
      expect(apply).toBeEnabled();
    });
    await user.click(apply);

    const report = await screen.findByTestId('apply-report');
    // The recycled target shows its own life, NOT joined to the differently-named fresh life.
    const recycle = within(report).getByTestId('apply-recycle');
    expect(recycle).toHaveTextContent('life 3');
    expect(recycle).not.toHaveTextContent('life 3 to');
    // The fresh life renders on its own row under Fresh lives.
    const fresh = within(report).getByTestId('apply-fresh');
    expect(fresh).toHaveTextContent('serve-9');
    expect(fresh).toHaveTextContent('life 1');
  });

  it('renders a populated refused section when the apply refuses', async () => {
    const user = userEvent.setup();
    const applySettingsProfile = vi.fn(() =>
      Promise.resolve({
        hot: [],
        recycle: [],
        fresh: [],
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
