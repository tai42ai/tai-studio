import { type ApiClient, ApiError, type TokensPayload } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiKeysTab } from './ApiKeysTab';
import {
  clickWhenInteractable,
  decorBorderedControls,
  fullProjection,
  renderWithProviders,
  scopedProjection,
} from './test-utils';

/** The mint route entry a projection carries when the caller can reach it. */
const MINT_ROUTE = { path: '/api/auth/api-keys', methods: ['POST'] };

function tokens(): TokensPayload {
  return [{ user_id: 'alice', description: 'Alice key', scopes: ['admin'], policy_data: {} }];
}
function scopes(): Record<string, string> {
  return {
    'https://a.com': 'admin',
    'https://b.com': 'admin',
    'https://c.com': 'read',
    'https://pub': 'public',
  };
}

type Stub = Partial<Record<keyof ApiClient, unknown>>;
function stubClient(methods: Stub): ApiClient {
  return methods as unknown as ApiClient;
}
function baseStub(overrides: Stub = {}): ApiClient {
  return stubClient({
    listTokensPayload: vi.fn(() => Promise.resolve(tokens())),
    listScopes: vi.fn(() => Promise.resolve(scopes())),
    getAuthCapabilities: vi.fn(() => Promise.resolve({ mintable: true, providers: [] })),
    listTemplates: vi.fn(() => Promise.resolve(['ac_tier', 'ac_rate_limit'])),
    validateCondition: vi.fn(() => Promise.resolve({ ok: true, result: null })),
    // The mapper mounted on this tab reads these; an empty catalog keeps the
    // key-focused assertions here unaffected (the mapper has its own test file).
    listAuthRoutes: vi.fn(() => Promise.resolve([])),
    listPublicRoutes: vi.fn(() => Promise.resolve([])),
    listSubMcp: vi.fn(() => Promise.resolve({})),
    // The admin mint dialog's principal picker reads these; an empty catalog keeps the
    // key-focused assertions here unaffected (the picker has its own coverage).
    listPrincipals: vi.fn(() => Promise.resolve([])),
    listRoles: vi.fn(() => Promise.resolve([])),
    ...overrides,
  });
}

/** Render the tab under an ADMIN projection by default so the write controls (mint,
 * Edit, Revoke, mapper) show — the behavioural tests exercise those. A test that pins a
 * scoped or not-ready projection passes its own `projection`, which overrides. */
function renderTab(
  ui: Parameters<typeof renderWithProviders>[0],
  opts: Parameters<typeof renderWithProviders>[1],
) {
  return renderWithProviders(ui, { projection: fullProjection(), ...opts });
}

describe('ApiKeysTab', () => {
  it('lists keys with their scopes', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub() });

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('Alice key')).toBeInTheDocument();
    const row = screen.getByText('alice').closest('tr') as HTMLElement;
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    expect(within(row).getByText('admin')).toBeInTheDocument();
  });

  it('surfaces a 404 on revoke loudly (unknown user_id)', async () => {
    const user = userEvent.setup({ delay: null });
    const revokeApiKey = vi.fn().mockRejectedValue(new ApiError('unknown user_id', 404));
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ revokeApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Revoke key alice' }));
    await clickWhenInteractable(user, screen.getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByText('unknown user_id')).toBeInTheDocument();
  });

  it('wears the ghost style on the per-row Revoke, not filled danger', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({}) });

    await screen.findByText('alice');
    // Revoking a key is a routine row action: low-emphasis in the table; the danger
    // emphasis lives on the confirm dialog's Revoke button.
    const rowRevoke = screen.getByRole('button', { name: 'Revoke key alice' });
    expect(rowRevoke).toHaveClass('tai-btn-ghost');
    expect(rowRevoke).not.toHaveClass('tai-btn-danger');
  });

  it('revokes a key after confirming', async () => {
    const user = userEvent.setup({ delay: null });
    const revokeApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', revoked: true });
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ revokeApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Revoke key alice' }));
    await clickWhenInteractable(user, screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revokeApiKey).toHaveBeenCalledWith('alice');
    });
  });

  it('keeps History reachable in readOnly mode while hiding Edit, Revoke and Create', async () => {
    renderTab(<ApiKeysTab readOnly />, { client: baseStub() });

    await screen.findByText('alice');
    // History is a read surface — still available…
    expect(screen.getByRole('button', { name: 'Policy history for alice' })).toBeInTheDocument();
    // …but every mutation entry point is hidden.
    expect(screen.queryByRole('button', { name: 'Edit key alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke key alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument();
  });

  it('disables Create with a note when the deployment cannot mint keys', async () => {
    const createApiKey = vi.fn();
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        createApiKey,
        getAuthCapabilities: vi.fn(() =>
          Promise.resolve({
            mintable: false,
            providers: [{ name: 'sso-external', mintable: false }],
          }),
        ),
      }),
    });

    await screen.findByText('alice');
    const create = screen.getByRole('button', { name: 'Create key' });
    expect(create).toBeDisabled();
    expect(screen.getByText('Keys are managed at the external issuer')).toBeInTheDocument();
    // The create dialog is unreachable — no mint request is possible.
    expect(screen.queryByLabelText('User ID')).not.toBeInTheDocument();
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('keeps Create enabled and the create flow intact when minting is available', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockResolvedValue('sk-mintable-1');
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        createApiKey,
        getAuthCapabilities: vi.fn(() => Promise.resolve({ mintable: true, providers: [] })),
      }),
    });

    await screen.findByText('alice');
    const create = screen.getByRole('button', { name: 'Create key' });
    expect(create).toBeEnabled();
    expect(screen.queryByText('Keys are managed at the external issuer')).not.toBeInTheDocument();
    await user.click(create);
    expect(screen.getByLabelText('User ID')).toBeInTheDocument();
  });

  it('surfaces a capabilities-fetch failure loudly (never a silent enable/disable guess)', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        getAuthCapabilities: vi.fn(() =>
          Promise.reject(new ApiError('capabilities unavailable', 500)),
        ),
      }),
    });

    expect(await screen.findByText('capabilities unavailable')).toBeInTheDocument();
    // No key table renders behind the loud error state.
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
  });

  it('renders the key list in readOnly mode even when capabilities would fail', async () => {
    const getAuthCapabilities = vi.fn(() =>
      Promise.reject(new ApiError('capabilities unavailable', 500)),
    );
    renderTab(<ApiKeysTab readOnly />, { client: baseStub({ getAuthCapabilities }) });

    // A read-only viewer never consumes mint capabilities, so a failing (or here
    // never-fetched) capabilities endpoint must not gate the list they can view.
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.queryByText('capabilities unavailable')).not.toBeInTheDocument();
    // The mint control is hidden in readOnly regardless, and the query never runs.
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument();
    expect(getAuthCapabilities).not.toHaveBeenCalled();
  });

  it('renders the principal column with a kind badge and display name, dashing a principal-less row', async () => {
    const mixed: TokensPayload = [
      {
        user_id: 'svc',
        description: 'Delegated key',
        scopes: ['read'],
        policy_data: {},
        principal: { user_id: 'usr-owner', kind: 'service', display_name: 'Acme Bot' },
      },
      {
        user_id: 'plain',
        description: 'Restored key',
        scopes: ['read'],
        policy_data: {},
        principal: null,
        orphaned: true,
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ listTokensPayload: vi.fn(() => Promise.resolve(mixed)) }),
    });

    const ownedRow = (await screen.findByText('svc')).closest('tr') as HTMLElement;
    expect(within(ownedRow).getByText('Acme Bot')).toBeInTheDocument();
    expect(within(ownedRow).getByText('service')).toBeInTheDocument();
    // A principal-less row shows a dash and, when flagged, a loud orphaned badge.
    const plainRow = screen.getByText('plain').closest('tr') as HTMLElement;
    expect(within(plainRow).getByText('—')).toBeInTheDocument();
    expect(within(plainRow).getByText('orphaned')).toBeInTheDocument();
  });

  it('hides the mint button for an owned-key caller even with "*" scopes', async () => {
    // The owned-cannot-mint rule is a per-request handler check invisible to the
    // route table, so a "*"-scoped owned key carries the mint route yet 403s on mint.
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({
        owner_user_id: 'alice',
        scopes: ['*'],
        routes: [MINT_ROUTE],
      }),
    });

    await screen.findByText('alice');
    expect(
      await screen.findByText('Your access does not permit minting keys.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument();
  });

  it('hides the mint button for a non-owned caller whose projection lacks the mint route', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({ owner_user_id: null, routes: [] }),
    });

    await screen.findByText('alice');
    expect(
      await screen.findByText('Your access does not permit minting keys.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument();
  });

  it('shows the mint button to a viewer (non-owned, mint route present) with capped scopes', async () => {
    const user = userEvent.setup({ delay: null });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({ owner_user_id: null, routes: [MINT_ROUTE], scopes: ['read'] }),
    });

    await screen.findByText('alice');
    const create = await screen.findByRole('button', { name: 'Create key' });
    await user.click(create);

    // The scope picker offers ONLY the projected scope; the un-projected `admin`
    // scope from the map is dropped once the projection is ready.
    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: 'admin' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('checkbox', { name: 'read' })).toBeInTheDocument();
  });

  it('offers the WHOLE scope map to a "*"-scoped session (wildcard, not a concrete id)', async () => {
    const user = userEvent.setup({ delay: null });
    // A `"*"` in the projection's scopes is the universal wildcard — it must expand
    // to every scope for minting, not intersect the concrete map to nothing.
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({ owner_user_id: null, routes: [MINT_ROUTE], scopes: ['*'] }),
    });

    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: 'Create key' }));

    expect(await screen.findByRole('checkbox', { name: 'admin' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'read' })).toBeInTheDocument();
  });

  it('shows the mint button with the full scope map for a full projection', async () => {
    const user = userEvent.setup({ delay: null });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: fullProjection(),
    });

    await screen.findByText('alice');
    expect(screen.queryByText('Your access does not permit minting keys.')).not.toBeInTheDocument();
    const create = await screen.findByRole('button', { name: 'Create key' });
    await user.click(create);
    // A full session keeps every scope in the map.
    expect(screen.getByRole('checkbox', { name: 'admin' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'read' })).toBeInTheDocument();
  });

  it('shows the mint button for a gate-off synthetic projection (admin, empty routes)', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: fullProjection({ routes: [] }),
    });

    await screen.findByText('alice');
    expect(await screen.findByRole('button', { name: 'Create key' })).toBeInTheDocument();
    expect(screen.queryByText('Your access does not permit minting keys.')).not.toBeInTheDocument();
  });

  it('hides the access-control mapper for an editor/viewer-shaped scoped projection (own-key surface only)', async () => {
    // A seeded editor/viewer reaches the always-shown API keys tab (its fence carves in
    // `/api/auth/api-keys` + `/api/auth/scopes`) but is DENIED `/api/auth/routes` and
    // `/api/auth/public-routes`, the admin reads the mapper mounts. The mapper must be
    // absent — the keys table stays reachable and no ErrorState walls the tab.
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({
        routes: [
          { path: '/api/auth/api-keys', methods: ['GET', 'POST'] },
          { path: '/api/auth/scopes', methods: ['GET'] },
          { path: '/api/auth/tokens-payload', methods: ['GET'] },
          { path: '/api/auth/capabilities', methods: ['GET'] },
        ],
      }),
    });

    // The own-key keys table renders…
    expect(await screen.findByText('alice')).toBeInTheDocument();
    // …but the deployment-wide access-control mapper (and its would-be 403 wall) is gone.
    expect(screen.queryByText('Access control')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the access-control mapper for a full projection', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: fullProjection(),
    });

    expect(await screen.findByText('alice')).toBeInTheDocument();
    // A full (admin / gate-off) projection reaches every mapper read, so it renders
    // (its reads resolve asynchronously, so await the card heading).
    expect(await screen.findByText('Access control')).toBeInTheDocument();
  });

  it('escapes server-supplied user_id and scope strings', async () => {
    const injected: TokensPayload = [
      {
        user_id: '<script>alert(1)</script>',
        description: '<img src=x onerror=alert(2)>',
        scopes: ['<b>scope</b>'],
        policy_data: {},
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ listTokensPayload: vi.fn(() => Promise.resolve(injected)) }),
    });

    expect(await screen.findByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText('<b>scope</b>')).toBeInTheDocument();
    // The injected markup never became live DOM.
    expect(document.querySelector('img[onerror]')).toBeNull();
  });

  it('draws the info trigger with the contrast-safe control border, never the decorative one', async () => {
    // `tokens.css`: the decorative border sits below 3:1 and may never be a
    // control's only boundary. Derived over the whole rendered tab, so a control
    // added later is judged by the same rule rather than by this list.
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub() });

    await screen.findByRole('button', { name: 'About claim links' });
    expect(decorBorderedControls(document.body)).toEqual([]);
  });
});
