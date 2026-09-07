/**
 * The states master table: every column renders, `person` shows a primary badge, the
 * Consumers column loads lazily per row (and degrades to `—` on failure), selecting a
 * row navigates `?state=`, the four render states hold, and the Upload door routes a
 * document by its `kind` (a missing kind is a loud alert; a name clash prompts Replace).
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { StatesList } from './StatesList';
import { fileInput, renderWithProviders, type StubApiClient } from './test-utils';

function stateRow(over: Record<string, unknown> = {}) {
  return {
    name: 'profile',
    description: 'A person profile',
    subject_kinds: ['person', 'thread'],
    default_subject_kind: 'person',
    retention_days: null,
    records: 4,
    updated_at: '2026-01-02T00:00:00Z',
    ...over,
  };
}

function listClient(rows: readonly unknown[], over: Partial<StubApiClient> = {}): StubApiClient {
  return {
    listStates: vi.fn().mockResolvedValue(rows),
    getStateStats: vi.fn().mockResolvedValue({ records: 4 }),
    stateConsumers: vi
      .fn()
      .mockResolvedValue([
        { kind: 'hook', name: 'h1', detail: null, link: null, unavailable: null },
      ]),
    ...over,
  };
}

describe('StatesList', () => {
  it('renders every column, with person as a primary badge and the lazy consumers count', async () => {
    renderWithProviders(<StatesList selected={undefined} />, { client: listClient([stateRow()]) });

    const row = await screen.findByTestId('state-row-profile');
    expect(within(row).getByText('person')).toBeInTheDocument();
    expect(within(row).getByText('thread')).toBeInTheDocument();
    // The lazy records cell resolves to its stats count (4).
    expect(await within(row).findByText('4')).toBeInTheDocument();
    // The lazy consumers cell resolves to its bound count (1).
    expect(await within(row).findByText('1')).toBeInTheDocument();
  });

  it('a failing consumers read degrades that cell to — with the error on title', async () => {
    renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()], {
        stateConsumers: vi.fn().mockRejectedValue(new Error('consumers down')),
      }),
    });
    const row = await screen.findByTestId('state-row-profile');
    const dash = await within(row).findByTitle('consumers down');
    expect(dash).toHaveTextContent('—');
  });

  it('selecting a row navigates to ?state=', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()]),
    });
    await user.click(await screen.findByRole('link', { name: 'Open state profile' }));
    expect(navigate).toHaveBeenCalledWith('states', { state: 'profile' });
  });

  it('the empty state offers Declare state', async () => {
    renderWithProviders(<StatesList selected={undefined} />, { client: listClient([]) });
    expect(await screen.findByText('No states declared')).toBeInTheDocument();
  });

  it('a list error renders loudly and retries', async () => {
    const listStates = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([stateRow()]);
    const user = userEvent.setup();
    renderWithProviders(<StatesList selected={undefined} />, {
      client: {
        listStates,
        getStateStats: vi.fn().mockResolvedValue({ records: 4 }),
        stateConsumers: vi.fn().mockResolvedValue([]),
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('state-row-profile')).toBeInTheDocument();
  });

  it('Upload rejects a document with no kind (loud alert)', async () => {
    const user = userEvent.setup();
    const putState = vi.fn();
    const { container } = renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()], { putState }),
    });
    await screen.findByTestId('state-row-profile');
    const input = fileInput(container);
    const file = new File([JSON.stringify({ name: 'x', schema: {} })], 'x.json', {
      type: 'application/json',
    });
    await user.upload(input, file);
    expect(
      await screen.findByText('This file has no `kind` — expected state or state-module.'),
    ).toBeInTheDocument();
    expect(putState).not.toHaveBeenCalled();
  });

  it('a state upload that conflicts surfaces the error (no replace door for a declaration)', async () => {
    const user = userEvent.setup();
    const putState = vi
      .fn()
      .mockRejectedValue(new ApiError('state has records; cannot change a declared field', 409));
    const { container } = renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()], { putState }),
    });
    await screen.findByTestId('state-row-profile');
    const input = fileInput(container);
    const doc = {
      kind: 'state',
      name: 'profile',
      schema: { type: 'object' },
      subject_kinds: ['person'],
      default_subject_kind: 'person',
    };
    const file = new File([JSON.stringify(doc)], 'profile.json', { type: 'application/json' });
    await user.upload(input, file);

    // No Replace prompt: the declaration PUT has no replace flag, so the 409 is loud.
    expect(
      await screen.findByText('state has records; cannot change a declared field'),
    ).toBeInTheDocument();
    expect(putState).toHaveBeenCalledTimes(1);
  });

  it('a state-module upload prompts Replace on a 409 and retries with replace=true', async () => {
    const user = userEvent.setup();
    const putStateModule = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('module_exists', 409))
      .mockResolvedValueOnce({ kind: 'state-module', name: 'notes' });
    const { container } = renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()], { putStateModule }),
    });
    await screen.findByTestId('state-row-profile');
    const input = fileInput(container);
    const file = new File(
      [JSON.stringify({ kind: 'state-module', name: 'notes', schema: {} })],
      'notes.json',
      { type: 'application/json' },
    );
    await user.upload(input, file);

    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    await waitFor(() => {
      expect(putStateModule).toHaveBeenCalledTimes(2);
    });
    // The second call carried the replace flag.
    expect(putStateModule.mock.calls[1]?.[2]).toBe(true);
  });

  it('Upload routes a state-module document to putStateModule', async () => {
    const user = userEvent.setup();
    const putStateModule = vi.fn().mockResolvedValue({ kind: 'state-module', name: 'notes' });
    const { container } = renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()], { putStateModule }),
    });
    await screen.findByTestId('state-row-profile');
    const input = fileInput(container);
    const file = new File(
      [JSON.stringify({ kind: 'state-module', name: 'notes', schema: {} })],
      'notes.json',
      {
        type: 'application/json',
      },
    );
    await user.upload(input, file);
    await waitFor(() => {
      expect(putStateModule).toHaveBeenCalled();
    });
    expect(putStateModule.mock.calls[0]?.[0]).toBe('notes');
  });

  it("the consumers count excludes families that can't be listed", async () => {
    renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()], {
        stateConsumers: vi.fn().mockResolvedValue([
          {
            kind: 'schedule',
            name: null,
            detail: null,
            link: null,
            unavailable: 'no scheduling backend',
          },
        ]),
      }),
    });
    const row = await screen.findByTestId('state-row-profile');
    expect(await within(row).findByText('0')).toBeInTheDocument();
  });

  it('the master pane is compact when a state is open (numeric/time columns dropped)', async () => {
    renderWithProviders(<StatesList selected="profile" />, { client: listClient([stateRow()]) });
    const row = await screen.findByTestId('state-row-profile');
    expect(within(row).getByText('person')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Updated' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Records' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Consumers' })).toBeNull();
  });

  it('a failing records read degrades that cell to — with the error on title', async () => {
    renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()], {
        getStateStats: vi.fn().mockRejectedValue(new Error('stats down')),
      }),
    });
    const row = await screen.findByTestId('state-row-profile');
    expect(await within(row).findByTitle('stats down')).toHaveTextContent('—');
  });

  it('formats the Updated cell, falling back for a null or unparseable value', async () => {
    renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([
        stateRow({ name: 'never', updated_at: null }),
        stateRow({ name: 'bad', updated_at: 'not-a-date' }),
      ]),
    });
    const never = await screen.findByTestId('state-row-never');
    expect(within(never).getByText('—')).toBeInTheDocument();
    const bad = await screen.findByTestId('state-row-bad');
    expect(within(bad).getByText('not-a-date')).toBeInTheDocument();
  });

  it('Declare state opens the create dialog and navigates on success', async () => {
    const user = userEvent.setup();
    const putState = vi.fn().mockResolvedValue({ name: 'newone', mounts: [] });
    const { navigate } = renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()], { putState }),
    });
    await screen.findByTestId('state-row-profile');
    await user.click(screen.getByRole('button', { name: 'Declare state' }));
    await user.type(await screen.findByLabelText('Name'), 'newone');
    await user.type(screen.getByLabelText('Subject kinds'), 'person{Enter}');
    await user.click(screen.getByRole('button', { name: 'Declare' }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('states', { state: 'newone' });
    });
  });

  it('the empty state opens the create dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatesList selected={undefined} />, { client: listClient([]) });
    await user.click(await screen.findByText('No states declared'));
    // The empty-state action button is present and opens the dialog.
    const [firstBtn] = screen.getAllByRole('button', { name: 'Declare state' });
    if (firstBtn === undefined) throw new Error('no Declare state button');
    await user.click(firstBtn);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('Upload rejects a file that is not JSON', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()]),
    });
    await screen.findByTestId('state-row-profile');
    const input = fileInput(container);
    await user.upload(input, new File(['not json'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByText(/not valid JSON/)).toBeInTheDocument();
  });

  it('a failed module Replace renders its error in the dialog', async () => {
    const user = userEvent.setup();
    const putStateModule = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('module_exists', 409))
      .mockRejectedValueOnce(new Error('replace denied'));
    const { container } = renderWithProviders(<StatesList selected={undefined} />, {
      client: listClient([stateRow()], { putStateModule }),
    });
    await screen.findByTestId('state-row-profile');
    const input = fileInput(container);
    const doc = { kind: 'state-module', name: 'notes', schema: {} };
    await user.upload(
      input,
      new File([JSON.stringify(doc)], 'notes.json', { type: 'application/json' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(await screen.findByText('replace denied')).toBeInTheDocument();
  });
});
