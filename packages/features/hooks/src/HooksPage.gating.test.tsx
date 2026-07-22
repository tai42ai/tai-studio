/**
 * Capability gating for the trigger-links section on the hooks page:
 *  - admin projection ⇒ section present with the create + revoke controls;
 *  - a hooks-WRITE non-admin ⇒ section present with create + revoke;
 *  - a hooks-READ non-admin ⇒ section present, list visible, NO create/revoke
 *    controls (the method-aware gate — no button that 403s on submit);
 *  - an ungranted non-admin ⇒ section ABSENT.
 *
 * The collection `POST /api/hooks/trigger-links` capability is the write witness for
 * BOTH mutations (the DELETE route is templated, so the projection carries it only
 * method-lessly); a hooks-READ grantee carries only GET on that path.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import type { TriggerLinkRecord } from '@tai42/api-client';

import { HooksPage } from './HooksPage';
import {
  fullProjection,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
} from './test-utils';

const LINK: TriggerLinkRecord = {
  name: 'wall-poster',
  topic: 'orders.created',
  tool_kwargs: null,
  created_by: null,
  created_at: '2026-07-22T09:00:00Z',
  expires_at: null,
  token_hash_prefix: 'abc123def456',
};

function client(): StubApiClient {
  return {
    listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listHookVerifiers: vi.fn().mockResolvedValue([]),
    listTriggerLinks: vi.fn().mockResolvedValue({ items: [LINK], total: 1 }),
  };
}

const WRITE_ROUTES = [{ path: '/api/hooks/trigger-links', methods: ['GET', 'POST'] }];
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
