/**
 * Capability gating for the trigger-links section on the hooks page:
 *  - admin projection ⇒ section present with the create + revoke controls;
 *  - a hooks-WRITE non-admin ⇒ section present with create + revoke;
 *  - a hooks-READ non-admin ⇒ section present, list visible, NO create/revoke
 *    controls (the method-aware gate — no button that 403s on submit);
 *  - an ungranted non-admin ⇒ section ABSENT.
 *
 * Create gates on `POST /api/hooks/trigger-links` and revoke on
 * `DELETE /api/hooks/trigger-links/{name}`, each read from the projection on its own.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HooksPage } from './HooksPage';
import {
  fullProjection,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
  triggerLink,
} from './test-utils';

function client(): StubApiClient {
  return {
    listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listHookVerifiers: vi.fn().mockResolvedValue([]),
    listTokensPayload: vi.fn().mockResolvedValue([]),
    listTriggerLinks: vi.fn().mockResolvedValue({ items: [triggerLink()], total: 1 }),
  };
}

const CREATE_ROUTE = { path: '/api/hooks/trigger-links', methods: ['GET', 'POST'] };
const REVOKE_ROUTE = { path: '/api/hooks/trigger-links/{name}', methods: ['DELETE'] };
const WRITE_ROUTES = [CREATE_ROUTE, REVOKE_ROUTE];
const READ_ROUTES = [{ path: '/api/hooks/trigger-links', methods: ['GET'] }];

describe('HooksPage — trigger-links gating', () => {
  it('admin projection: section present with create and revoke', async () => {
    renderWithProviders(<HooksPage search={{}} />, {
      client: client(),
      projection: fullProjection(),
    });

    expect(await screen.findByText('Trigger links')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create trigger link' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Revoke trigger link wall-poster' }),
    ).toBeInTheDocument();
  });

  it('hooks-WRITE non-admin: section present with create and revoke', async () => {
    renderWithProviders(<HooksPage search={{}} />, {
      client: client(),
      projection: scopedProjection({ routes: WRITE_ROUTES }),
    });

    expect(await screen.findByText('Trigger links')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create trigger link' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Revoke trigger link wall-poster' }),
    ).toBeInTheDocument();
  });

  it('hooks-READ non-admin: section + list visible, NO create/revoke controls', async () => {
    renderWithProviders(<HooksPage search={{}} />, {
      client: client(),
      projection: scopedProjection({ routes: READ_ROUTES }),
    });

    expect(await screen.findByText('Trigger links')).toBeInTheDocument();
    // The list is visible (the row renders)...
    expect(await screen.findByText('wall-poster')).toBeInTheDocument();
    // ...but no write controls that would 403 on submit.
    expect(screen.queryByRole('button', { name: 'Create trigger link' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke trigger link wall-poster' }),
    ).not.toBeInTheDocument();
  });

  it('create without revoke: the create button and no row revoke', async () => {
    renderWithProviders(<HooksPage search={{}} />, {
      client: client(),
      projection: scopedProjection({ routes: [CREATE_ROUTE] }),
    });

    expect(await screen.findByText('wall-poster')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create trigger link' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke trigger link wall-poster' }),
    ).not.toBeInTheDocument();
  });

  it('revoke without create: the row revoke and no create button', async () => {
    renderWithProviders(<HooksPage search={{}} />, {
      client: client(),
      projection: scopedProjection({ routes: [...READ_ROUTES, REVOKE_ROUTE] }),
    });

    expect(
      await screen.findByRole('button', { name: 'Revoke trigger link wall-poster' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create trigger link' })).not.toBeInTheDocument();
  });

  it('ungranted non-admin: section ABSENT', async () => {
    const stub = client();
    renderWithProviders(<HooksPage search={{}} />, {
      client: stub,
      projection: scopedProjection({}),
    });

    // The page renders (the hooks list settles) but the gated section never appears.
    expect(await screen.findByText('No hooks registered')).toBeInTheDocument();
    expect(screen.queryByText('Trigger links')).not.toBeInTheDocument();
    expect(stub.listTriggerLinks).not.toHaveBeenCalled();
  });
});
