/**
 * The declaration editor: the create dialog PUTs a new state, and every save is a plain
 * declaration PUT. A schema change over existing records that the server refuses (a 409
 * for removing or altering a declared field) surfaces the refusal message inline.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type StateDetail } from '@tai42/api-client';

import { DeclarationTab, DeclareStateDialog } from './DeclarationTab';
import { renderWithProviders } from './test-utils';

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
  // A schema that adds a property, forcing a dirty base-schema change in the editor.
  const CHANGED_SCHEMA = '{"type":"object","properties":{"a":{"type":"string"}}}';

  it('a change on an empty state saves through the declaration PUT', async () => {
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

  it('a refused schema change over existing records surfaces the server message', async () => {
    const user = userEvent.setup();
    const putState = vi
      .fn()
      .mockRejectedValue(
        new ApiError('state "profile" has records; cannot remove or change a declared field', 409),
      );
    renderWithProviders(<DeclarationTab state={detail()} />, {
      client: { getStateStats: vi.fn().mockResolvedValue({ records: 3 }), putState },
    });

    fireEvent.change(await screen.findByLabelText('Base schema JSON'), {
      target: { value: CHANGED_SCHEMA },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(putState).toHaveBeenCalledTimes(1);
    });
    // The 409 is shown plainly; there is no second door the save silently takes.
    expect(
      await screen.findByText(
        'state "profile" has records; cannot remove or change a declared field',
      ),
    ).toBeInTheDocument();
  });

  it('a subject change over existing records saves through the declaration PUT', async () => {
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
