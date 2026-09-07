/**
 * The declaration editor: the create dialog PUTs a new state; editing a state with no
 * records saves straight through; editing a state WITH records routes through the
 * migration dialog, where a 412 narrowing surfaces the message and a Confirm-drop tick
 * before the migrate re-fires with `confirm_drop`.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type StateDetail } from '@tai42/api-client';

import { DeclarationTab, DeclareStateDialog } from './DeclarationTab';
import { renderWithProviders, type StubApiClient } from './test-utils';

function detail(over: Record<string, unknown> = {}): StateDetail {
  return {
    name: 'profile',
    description: 'A person profile',
    schema: { type: 'object' },
    subject_kinds: ['person'],
    default_subject_kind: 'person',
    retention_days: null,
    effective_schema: { type: 'object' },
    regimes: [],
    mounts: [],
    ...over,
  };
}

describe('DeclareStateDialog', () => {
  it('PUTs a new state and reports the created name', async () => {
    const user = userEvent.setup();
    const putState = vi.fn().mockResolvedValue(detail());
    const onCreated = vi.fn();
    renderWithProviders(<DeclareStateDialog onClose={vi.fn()} onCreated={onCreated} />, {
      client: { putState },
    });

    await user.type(screen.getByLabelText('Name'), 'profile');
    // Add the subject kind; the default kind auto-fills to the first kind.
    await user.type(screen.getByLabelText('Subject kinds'), 'person{Enter}');

    await user.click(screen.getByRole('button', { name: 'Declare' }));
    await waitFor(() => {
      expect(putState).toHaveBeenCalled();
    });
    expect(putState.mock.calls[0]?.[0]).toBe('profile');
    expect(onCreated).toHaveBeenCalledWith('profile');
  });
});

describe('DeclarationTab', () => {
  it('a change on an empty state saves straight through (no migration)', async () => {
    const user = userEvent.setup();
    const putState = vi.fn().mockResolvedValue(detail());
    renderWithProviders(<DeclarationTab state={detail()} />, {
      client: { getStateStats: vi.fn().mockResolvedValue({ records: 0 }), putState },
    });
    await user.type(await screen.findByLabelText('Retention (days)'), '30');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(putState).toHaveBeenCalled();
    });
  });

  // The narrowed schema the migration tests write into the base-schema editor.
  const NARROWED = '{"type":"object","properties":{"a":{"type":"string"}}}';

  it('a schema change on a state WITH records migrates, confirming a 412 narrowing', async () => {
    const user = userEvent.setup();
    const previewStateMigration = vi
      .fn()
      .mockResolvedValue({ records: 3, fits: 3, misfits: 0, misfit_fields: {}, examples: [] });
    const migrateState = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('drops field b from 3 records', 412))
      .mockResolvedValueOnce({ migrated: true, name: 'profile' });
    const client: StubApiClient = {
      getStateStats: vi.fn().mockResolvedValue({ records: 3 }),
      previewStateMigration,
      migrateState,
    };
    renderWithProviders(<DeclarationTab state={detail()} />, { client });

    // A base-schema change makes the declaration dirty over existing records.
    fireEvent.change(await screen.findByLabelText('Base schema JSON'), {
      target: { value: NARROWED },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The migration dialog previews the fit/misfit count.
    expect(
      await screen.findByText(/Previewing against 3 records: 3 fit, 0 need attention/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Migrate' }));

    // The 412 surfaces the narrowing message and the Confirm-drop tick.
    expect(await screen.findByText('drops field b from 3 records')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Confirm drop/));
    await user.click(screen.getByRole('button', { name: 'Migrate' }));

    await waitFor(() => {
      expect(migrateState).toHaveBeenCalledTimes(2);
    });
    expect(migrateState.mock.calls[1]?.[1]).toMatchObject({ confirm_drop: true });
    // The migrate carried the new schema, not a full declaration body.
    expect(migrateState.mock.calls[1]?.[1]).toHaveProperty('new_schema');
  });

  it('a non-narrowing migration applies on the first Migrate', async () => {
    const user = userEvent.setup();
    const migrateState = vi.fn().mockResolvedValue({ migrated: true, name: 'profile' });
    renderWithProviders(<DeclarationTab state={detail()} />, {
      client: {
        getStateStats: vi.fn().mockResolvedValue({ records: 2 }),
        previewStateMigration: vi
          .fn()
          .mockResolvedValue({ records: 2, fits: 2, misfits: 0, misfit_fields: {}, examples: [] }),
        migrateState,
      },
    });
    fireEvent.change(await screen.findByLabelText('Base schema JSON'), {
      target: { value: NARROWED },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Migrate' }));
    await waitFor(() => {
      expect(migrateState).toHaveBeenCalledTimes(1);
    });
    expect(migrateState.mock.calls[0]?.[1]).toMatchObject({ confirm_drop: false });
  });

  it('a subject change on a state WITH records saves through put (no migration dialog)', async () => {
    const user = userEvent.setup();
    const putState = vi.fn().mockResolvedValue(detail());
    renderWithProviders(<DeclarationTab state={detail()} />, {
      client: { getStateStats: vi.fn().mockResolvedValue({ records: 3 }), putState },
    });
    await user.type(await screen.findByLabelText('Subject kinds'), 'thread{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(putState).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: 'Migrate' })).toBeNull();
  });

  it('shows the mounted subtrees read-only and gates on a 501', async () => {
    const withMount = detail({
      mounts: [{ module: 'notes', path: ['notes'], parameters: {}, declarations: {} }],
    });
    renderWithProviders(<DeclarationTab state={withMount} />, {
      client: { getStateStats: vi.fn().mockResolvedValue({ records: 0 }) },
    });
    expect(await screen.findByText('Mounted subtrees')).toBeInTheDocument();
    expect(screen.getAllByText('notes').length).toBeGreaterThan(0);
  });

  it('a 501 on the stats read shows FeatureDisabled', async () => {
    renderWithProviders(<DeclarationTab state={detail()} />, {
      client: { getStateStats: vi.fn().mockRejectedValue(new ApiError('no store', 501)) },
    });
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });
});
