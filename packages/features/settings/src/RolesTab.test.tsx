/**
 * RolesTab tests: the pure grouping/level helpers, and the rendered surface — the
 * per-feature-GROUP tri-state grant editor (driven by the route catalog's `tags` +
 * `action` join), the admin-only markers a `fenced`/`secret` action produces, the
 * reserved-admin read-only guard, the save-as-grant-map flow, and the read-only
 * effective-access view.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, AuthRoute, RoleBody, RoleGrants } from '@tai42/api-client';

import {
  RolesTab,
  baseTierLabel,
  effectiveLevelsOf,
  featureGroupsOf,
  isGrantableAction,
} from './RolesTab';
import { decorBorderedControls, renderWithProviders } from './test-utils';

// -- fixtures ----------------------------------------------------------------

function route(partial: Pick<AuthRoute, 'path' | 'action'> & Partial<AuthRoute>): AuthRoute {
  return { methods: ['GET'], mapped: null, tags: [], summary: '', ...partial };
}

/**
 * A catalog covering the three group shapes: `tools` (purely grantable), `config`
 * (MIXED — a grantable read/write plus a `fenced` mutation and a `secret` read), and
 * `marketplace` (purely `fenced` — admin-only, non-grantable).
 */
function catalog(): AuthRoute[] {
  return [
    route({ path: '/api/tools', methods: ['GET'], action: 'read', tags: ['tools'] }),
    route({ path: '/api/tools/schedules', methods: ['POST'], action: 'write', tags: ['tools'] }),
    route({ path: '/api/config', methods: ['GET'], action: 'read', tags: ['config'] }),
    route({ path: '/api/config/env', methods: ['POST'], action: 'fenced', tags: ['config'] }),
    route({ path: '/api/config/env', methods: ['GET'], action: 'secret', tags: ['config'] }),
    route({
      path: '/api/marketplace/install',
      methods: ['POST'],
      action: 'fenced',
      tags: ['marketplace'],
    }),
  ];
}

function role(overrides: Partial<RoleBody> = {}): RoleBody {
  return {
    name: 'editor',
    description: '',
    scopes: ['*'],
    condition: '.foo',
    condition_id: null,
    condition_kwargs: null,
    base_tier: 'editor',
    allow_all: false,
    grants: {},
    ...overrides,
  };
}

const adminRole = role({ name: 'admin', base_tier: null, allow_all: true, grants: {} });

type Stub = Partial<Record<keyof ApiClient, unknown>>;
function baseStub(roles: RoleBody[], overrides: Stub = {}): ApiClient {
  return {
    listRoles: vi.fn(() => Promise.resolve(roles)),
    listAuthRoutes: vi.fn(() => Promise.resolve(catalog())),
    ...overrides,
  } as unknown as ApiClient;
}

/** Click the role in the role listbox by its name (the option's leading label). */
async function selectRole(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(await screen.findByRole('option', { name: new RegExp(`^${name}`) }));
}

// -- pure helpers ------------------------------------------------------------

describe('RolesTab helpers', () => {
  it('groups the catalog by tag and marks grantable vs purely-fenced', () => {
    const groups = featureGroupsOf(catalog());
    const byTag = Object.fromEntries(groups.map((g) => [g.tag, g]));
    expect(byTag.tools?.grantable).toBe(true);
    expect(byTag.tools?.hasFenced).toBe(false);
    // config mixes a grantable read/write with a fenced + secret route → still grantable.
    expect(byTag.config?.grantable).toBe(true);
    expect(byTag.config?.hasFenced).toBe(true);
    // marketplace is purely fenced → not grantable.
    expect(byTag.marketplace?.grantable).toBe(false);
    expect(byTag.marketplace?.hasFenced).toBe(true);
  });

  it('classifies only read/write as grantable actions', () => {
    expect(isGrantableAction('read')).toBe(true);
    expect(isGrantableAction('write')).toBe(true);
    expect(isGrantableAction('fenced')).toBe(false);
    expect(isGrantableAction('secret')).toBe(false);
    expect(isGrantableAction(null)).toBe(false);
  });

  it('reads a granted level and fails a missing tag closed to none', () => {
    expect(effectiveLevelsOf({ tools: 'write' }, ['tools', 'config'])).toEqual({
      tools: 'write',
      config: 'none',
    });
  });

  it('labels the read-only base-tier ceiling', () => {
    expect(baseTierLabel({ allow_all: true, base_tier: null })).toBe('admin — full');
    expect(baseTierLabel({ allow_all: false, base_tier: 'editor' })).toBe('editor base');
    expect(baseTierLabel({ allow_all: false, base_tier: 'viewer' })).toBe('viewer base');
  });
});

// -- rendered surface --------------------------------------------------------

describe('RolesTab', () => {
  it('renders one tri-state selector per grantable group, none for a purely-fenced group', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RolesTab readOnly={false} />, {
      client: baseStub([role({ grants: { tools: 'write' } })]),
    });
    await selectRole(user, 'editor');

    // Grantable groups get a group named by the tag, holding the level selector.
    // The NAME is on the container the `Field` renders, not on the radiogroup:
    // a group Field names its group by construction rather than publishing a
    // label id for the control inside it to remember to read.
    expect(
      within(screen.getByRole('group', { name: 'tools' })).getByRole('radiogroup'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'config' })).getByRole('radiogroup'),
    ).toBeInTheDocument();
    // The purely-fenced group has NO grant control.
    expect(screen.queryByRole('group', { name: 'marketplace' })).not.toBeInTheDocument();
    // ...and is surfaced under the admin-only section instead.
    expect(screen.getByText('Admin-only feature groups')).toBeInTheDocument();
  });

  it('seeds the selector from the role grant map', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RolesTab readOnly={false} />, {
      client: baseStub([role({ grants: { tools: 'write' } })]),
    });
    await selectRole(user, 'editor');

    const tools = within(screen.getByRole('group', { name: 'tools' })).getByRole('radiogroup');
    expect(within(tools).getByRole('radio', { name: 'write' })).toBeChecked();
    const config = within(screen.getByRole('group', { name: 'config' })).getByRole('radiogroup');
    expect(within(config).getByRole('radio', { name: 'none' })).toBeChecked();
  });

  it('setting a group to a level and saving PUTs the whole grant map', async () => {
    const user = userEvent.setup();
    const updateRole = vi.fn(() => Promise.resolve(role({ grants: { tools: 'read' } })));
    renderWithProviders(<RolesTab readOnly={false} />, {
      client: baseStub([role({ grants: { tools: 'write' } })], { updateRole }),
    });
    await selectRole(user, 'editor');

    const tools = within(screen.getByRole('group', { name: 'tools' })).getByRole('radiogroup');
    await user.click(within(tools).getByRole('radio', { name: 'read' }));
    await user.click(screen.getByRole('button', { name: 'Save grants' }));

    expect(updateRole).toHaveBeenCalledWith('editor', {
      grants: { tools: 'read', config: 'none' },
    });
  });

  it('disables the grant editor for the reserved admin role and hides its delete', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RolesTab readOnly={false} />, {
      client: baseStub([adminRole, role({ grants: { tools: 'write' } })]),
    });
    await selectRole(user, 'admin');

    const tools = within(screen.getByRole('group', { name: 'tools' })).getByRole('radiogroup');
    expect(within(tools).getByRole('radio', { name: 'write' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save grants' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete role/ })).not.toBeInTheDocument();
  });

  it('shows the effective-access level per group plus the read-only base-tier ceiling badge', async () => {
    const user = userEvent.setup();
    // A `write` grant under a `viewer` base: the per-tag level is shown as-is and the
    // ceiling that caps it is surfaced as the role's tier badge (no client re-compute).
    renderWithProviders(<RolesTab readOnly={false} />, {
      client: baseStub([
        role({ name: 'reporter', base_tier: 'viewer', grants: { tools: 'write' } }),
      ]),
    });
    await selectRole(user, 'reporter');

    const effective = screen.getByText('Effective access').closest('div');
    expect(effective).not.toBeNull();
    const scope = within(effective as HTMLElement);
    expect(scope.getByText('tools')).toBeInTheDocument();
    expect(scope.getByText('write')).toBeInTheDocument();
    // Two viewer-base badges: the header ceiling note + the role tier badge.
    expect(scope.getAllByText('viewer base').length).toBeGreaterThan(0);
  });

  it('renders the reserved admin with an un-lockable full-access note in the effective view', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RolesTab readOnly={false} />, { client: baseStub([adminRole]) });
    await selectRole(user, 'admin');
    expect(
      screen.getByText(/reaches every feature group — full access, un-lockable/),
    ).toBeInTheDocument();
  });

  it('re-seeds the grant editor after an external rollback (never re-PUTs the stale map)', async () => {
    const user = userEvent.setup();
    // The persisted grants the roles list returns; the rollback flips them under the
    // SAME role name, exactly as an out-of-band re-point would once the list refetches.
    let grants: RoleGrants = { tools: 'write' };
    const listRoles = vi.fn(() => Promise.resolve([role({ grants })]));
    const listRoleVersions = vi.fn(() =>
      Promise.resolve({
        versions: [
          {
            version: 2,
            body: role({ grants: { tools: 'write' } }),
            tags: [],
            created_at: '2026-07-21T00:00:02Z',
            is_current: true,
          },
          {
            version: 1,
            body: role({ grants: { tools: 'read' } }),
            tags: [],
            created_at: '2026-07-21T00:00:01Z',
            is_current: false,
          },
        ],
        audit: [],
      }),
    );
    const rollbackRole = vi.fn(() => {
      grants = { tools: 'read' };
      return Promise.resolve(role({ grants }));
    });
    renderWithProviders(<RolesTab readOnly={false} />, {
      client: baseStub([], { listRoles, listRoleVersions, rollbackRole }),
    });
    await selectRole(user, 'editor');
    expect(
      within(
        within(screen.getByRole('group', { name: 'tools' })).getByRole('radiogroup'),
      ).getByRole('radio', {
        name: 'write',
      }),
    ).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Version history for editor' }));
    await user.click(await screen.findByRole('button', { name: 'Roll back to version 1' }));
    await user.click(screen.getByRole('button', { name: /^Roll back$/ }));
    await waitFor(() => {
      expect(rollbackRole).toHaveBeenCalledWith('editor', 1);
    });

    // Dismiss the confirm sub-dialog then the history dialog so the underlying editor is
    // no longer aria-hidden (the rollback has already fired and invalidated the list).
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));

    // The editor now reflects the rolled-back grants — NOT the pre-rollback draft.
    await waitFor(() => {
      const tools = within(screen.getByRole('group', { name: 'tools' })).getByRole('radiogroup');
      expect(within(tools).getByRole('radio', { name: 'read' })).toBeChecked();
    });
    // ...and it is not dirty (the baseline moved with it), so Save is disabled — the
    // stale pre-rollback map can never be re-PUT over the restored one.
    expect(screen.getByRole('button', { name: 'Save grants' })).toBeDisabled();
  });

  it('re-seeds from its OWN save without detaching the operator from Save grants', async () => {
    // A save invalidates the roles list, and the refetch returns the grants just
    // written — so the baseline the editor was seeded from moves under it. The
    // re-seed has to land without tearing the editor down: the operator is standing
    // on the Save button they pressed.
    const user = userEvent.setup();
    let grants: RoleGrants = { tools: 'write', config: 'none' };
    const listRoles = vi.fn(() => Promise.resolve([role({ grants })]));
    const updateRole = vi.fn((_name: string, body: { grants: RoleGrants }) => {
      grants = body.grants;
      return Promise.resolve(role({ grants }));
    });
    renderWithProviders(<RolesTab readOnly={false} />, {
      client: baseStub([], { listRoles, updateRole }),
    });
    await selectRole(user, 'editor');

    const tools = within(screen.getByRole('group', { name: 'tools' })).getByRole('radiogroup');
    await user.click(within(tools).getByRole('radio', { name: 'read' }));
    const save = screen.getByRole('button', { name: 'Save grants' });
    await user.click(save);

    // The refetched baseline moved with the save, so the editor reads clean again.
    await waitFor(() => {
      expect(listRoles).toHaveBeenCalledTimes(2);
    });
    expect(
      within(
        within(screen.getByRole('group', { name: 'tools' })).getByRole('radiogroup'),
      ).getByRole('radio', { name: 'read' }),
    ).toBeChecked();
    // The very button the operator pressed is still the one on screen, still focused.
    expect(screen.getByRole('button', { name: 'Save grants' })).toBe(save);
    expect(save).toHaveFocus();
  });

  it('draws every role control with the contrast-safe border, never the decorative one', async () => {
    // `tokens.css`: the decorative border sits below 3:1 and may never be a
    // control's only boundary. Derived over the whole rendered tab.
    renderWithProviders(<RolesTab readOnly={false} />, {
      client: baseStub([role({ grants: { tools: 'write' } })]),
    });

    await screen.findByRole('option', { name: /^editor/ });
    expect(decorBorderedControls(document.body)).toEqual([]);
  });
});
