/**
 * RolesTab tests: the pure grouping/level helpers, and the rendered surface — the
 * per-feature-GROUP tri-state grant editor (driven by the route catalog's `tags` +
 * `role_reach` join), the groups no level governs listed read-only with each route's
 * reach badge (admin-only, self-service, public — a public route badged inside a
 * mixed group too), the reserved-admin read-only guard, the save-as-grant-map flow,
 * and the read-only effective-access view.
 */
import type { ApiClient, AuthRoute, RoleBody, RoleGrants } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { baseTierLabel, effectiveLevelsOf, featureGroupsOf } from './role-grants';
import { RolesTab } from './RolesTab';
import { decorBorderedControls, renderWithProviders } from './test-utils';

// -- fixtures ----------------------------------------------------------------

function route(
  partial: Pick<AuthRoute, 'path' | 'action' | 'role_reach'> & Partial<AuthRoute>,
): AuthRoute {
  return {
    methods: ['GET'],
    mapped: null,
    tags: [],
    summary: '',
    declared_public: false,
    ...partial,
  };
}

/**
 * A catalog covering every group shape: `tools` (only `level` routes), `config`
 * (MIXED — `level` routes plus admin-only fenced and secret ones), `hooks` (MIXED —
 * a `level` read plus a public trigger), and the groups no level governs:
 * `marketplace` (admin-only), `access-control` (self-service plus admin-only),
 * `users` (self-service only) and `health` (public only).
 */
function catalog(): AuthRoute[] {
  return [
    route({
      path: '/api/tools',
      methods: ['GET'],
      action: 'read',
      role_reach: 'level',
      tags: ['tools'],
    }),
    route({
      path: '/api/tools/schedules',
      methods: ['POST'],
      action: 'write',
      role_reach: 'level',
      tags: ['tools'],
    }),
    route({
      path: '/api/config',
      methods: ['GET'],
      action: 'read',
      role_reach: 'level',
      tags: ['config'],
    }),
    route({
      path: '/api/config/env',
      methods: ['POST'],
      action: 'fenced',
      role_reach: 'admin_only',
      tags: ['config'],
    }),
    route({
      path: '/api/config/env',
      methods: ['GET'],
      action: 'secret',
      role_reach: 'admin_only',
      tags: ['config'],
    }),
    route({
      path: '/api/marketplace/install',
      methods: ['POST'],
      action: 'fenced',
      role_reach: 'admin_only',
      tags: ['marketplace'],
    }),
    route({
      path: '/api/auth/api-keys',
      methods: ['POST'],
      action: 'write',
      role_reach: 'self_service',
      tags: ['access-control'],
    }),
    route({
      path: '/api/auth/scopes',
      methods: ['POST'],
      action: 'write',
      role_reach: 'admin_only',
      tags: ['access-control'],
    }),
    route({
      path: '/api/auth/users/me/password',
      methods: ['PUT'],
      action: 'write',
      role_reach: 'self_service',
      tags: ['users'],
    }),
    route({
      path: '/health',
      methods: ['GET'],
      action: 'read',
      role_reach: 'public',
      declared_public: true,
      tags: ['health'],
    }),
    route({
      path: '/api/hooks',
      methods: ['GET'],
      action: 'read',
      role_reach: 'level',
      tags: ['hooks'],
    }),
    route({
      path: '/trigger/{token}',
      methods: ['POST'],
      action: 'write',
      role_reach: 'public',
      declared_public: true,
      tags: ['hooks'],
    }),
  ];
}

/** The `li` of the read-only route detail that lists `METHOD path`. */
function routeRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: '.tai-mono' }).closest('li');
  if (row === null) throw new Error(`no route row for ${label}`);
  return row;
}

const LEVEL_FREE_HEADING = 'Feature groups no per-role level governs';

function role(overrides: Partial<RoleBody> = {}): RoleBody {
  return {
    name: 'editor',
    description: '',
    scopes: ['*'],
    condition: { content: '.foo' },
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
  it('groups the catalog by tag and marks a group grantable only when a level opens a route', () => {
    const groups = featureGroupsOf(catalog());
    const byTag = Object.fromEntries(groups.map((g) => [g.tag, g]));
    // A group with at least one `level` route is grantable, mixed groups included.
    expect(byTag.tools?.grantable).toBe(true);
    expect(byTag.config?.grantable).toBe(true);
    expect(byTag.hooks?.grantable).toBe(true);
    // A group whose routes are all admin-only, self-service or public is not.
    expect(byTag.marketplace?.grantable).toBe(false);
    expect(byTag['access-control']?.grantable).toBe(false);
    expect(byTag.users?.grantable).toBe(false);
    expect(byTag.health?.grantable).toBe(false);
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
  it('renders one tri-state selector per grantable group, none for a group no level governs', async () => {
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
    // A group no level governs has NO grant control...
    for (const tag of ['marketplace', 'access-control', 'users', 'health']) {
      expect(screen.queryByRole('group', { name: tag })).not.toBeInTheDocument();
    }
    // ...and is listed under its own heading, each route badged by its reach.
    expect(screen.getByRole('heading', { name: LEVEL_FREE_HEADING })).toBeInTheDocument();
    expect(
      within(routeRow('POST /api/auth/api-keys')).getByText('self-service'),
    ).toBeInTheDocument();
    expect(
      within(routeRow('PUT /api/auth/users/me/password')).getByText('self-service'),
    ).toBeInTheDocument();
    expect(within(routeRow('POST /api/auth/scopes')).getByText('admin-only')).toBeInTheDocument();
    expect(
      within(routeRow('POST /api/marketplace/install')).getByText('admin-only'),
    ).toBeInTheDocument();
  });

  it('lists a public-only group without a level and badges public routes in a mixed group', async () => {
    const user = userEvent.setup();
    const updateRole = vi.fn(() => Promise.resolve(role({ grants: { tools: 'read' } })));
    renderWithProviders(<RolesTab readOnly={false} />, {
      client: baseStub([role({ grants: { tools: 'write' } })], { updateRole }),
    });
    await selectRole(user, 'editor');

    // `health` has no radio group; it is listed below the heading, its route badged public.
    expect(screen.queryByRole('group', { name: 'health' })).not.toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: LEVEL_FREE_HEADING });
    const healthRow = routeRow('GET /health');
    expect(
      heading.compareDocumentPosition(healthRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(healthRow).getByText('public')).toBeInTheDocument();

    // The mixed `hooks` group keeps its radio group; its public trigger is badged public.
    expect(
      within(screen.getByRole('group', { name: 'hooks' })).getByRole('radiogroup'),
    ).toBeInTheDocument();
    const triggerRow = routeRow('POST /trigger/{token}');
    expect(within(triggerRow).getByText('public')).toBeInTheDocument();
    expect(
      heading.compareDocumentPosition(triggerRow) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();

    // The save carries the level-governed groups only: no `health` key, no public key.
    const tools = within(screen.getByRole('group', { name: 'tools' })).getByRole('radiogroup');
    await user.click(within(tools).getByRole('radio', { name: 'read' }));
    await user.click(screen.getByRole('button', { name: 'Save grants' }));
    expect(updateRole).toHaveBeenCalledWith('editor', {
      grants: { tools: 'read', config: 'none', hooks: 'none' },
    });
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
      grants: { tools: 'read', config: 'none', hooks: 'none' },
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
