/**
 * The Records tab: the lookup form opens a record by kind + key + target; the subjects
 * browser pages a kind and opens a row; the content search matches records and opens a
 * hit. Every open navigates `?state=&subject=&target=` with the subject/target params
 * encoded on their first colon.
 */
import { ApiError, type StateDetail } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PENDING_SAVES_CARD_ID } from './PendingSavesCard';
import { RecordsTab } from './RecordsTab';
import { renderWithProviders, type StubApiClient } from './test-utils';

const state = {
  name: 'profile',
  description: '',
  schema: { type: 'object' },
  subject_kinds: ['person', 'thread'],
  default_subject_kind: 'person',
  retention_days: null,
  attachments: [],
} as unknown as StateDetail;

const subject = { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-1' };
// A paged subject row as `list_subjects` / `search` dump it: the subject plus the
// record's `updated_at` (epoch seconds — 2026-01-01T00:00:00Z).
const subjectRow = { subject, updated_at: 1767225600 };

function client(over: Partial<StubApiClient> = {}): StubApiClient {
  return {
    listConversationRoutes: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listStateSubjects: vi
      .fn()
      .mockResolvedValue({ subjects: [subjectRow], next_cursor: null, held: [] }),
    searchStateRecords: vi.fn().mockResolvedValue({ matches: [], next_cursor: null, held: [] }),
    checkStateRecords: vi
      .fn()
      .mockResolvedValue({ checked: 0, items: [], next_cursor: null, held: [] }),
    ...over,
  };
}

describe('RecordsTab', () => {
  it('the lookup form opens a record by kind + key + target', async () => {
    const user = userEvent.setup({ delay: null });
    const { navigate } = renderWithProviders(<RecordsTab state={state} />, { client: client() });
    await user.type(await screen.findByLabelText('Key'), 'p-1');
    await user.type(screen.getByLabelText('Target name'), 'assistant');
    await user.click(screen.getByRole('button', { name: 'Lookup' }));
    expect(navigate).toHaveBeenCalledWith('states', {
      state: 'profile',
      subject: 'person:p-1',
      target: 'agent:assistant',
    });
  });

  it('the subjects browser lists a kind and opens a row', async () => {
    const user = userEvent.setup({ delay: null });
    const { navigate } = renderWithProviders(<RecordsTab state={state} />, { client: client() });
    // The subjects table row renders its key.
    const subjectsCard = (await screen.findByText('Subjects')).closest('div');
    expect(subjectsCard).not.toBeNull();
    const [firstOpen] = await screen.findAllByRole('button', { name: 'Open' });
    if (firstOpen === undefined) throw new Error('no Open button');
    await user.click(firstOpen);
    expect(navigate).toHaveBeenCalledWith('states', {
      state: 'profile',
      subject: 'person:p-1',
      target: 'agent:assistant',
    });
  });

  it('the subjects browser shows the row Updated timestamp (full ISO on title)', async () => {
    renderWithProviders(<RecordsTab state={state} />, { client: client() });
    // The Updated cell carries the exact instant on `title` — the epoch-seconds
    // `updated_at` rendered as its UTC ISO, deterministic across locales.
    expect(await screen.findByTitle('2026-01-01T00:00:00.000Z')).toBeInTheDocument();
  });

  it('the content search matches records and opens a hit', async () => {
    const user = userEvent.setup({ delay: null });
    const { navigate } = renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        searchStateRecords: vi.fn().mockResolvedValue({
          matches: [subjectRow],
          next_cursor: null,
          held: [],
        }),
      }),
    });
    await user.type(await screen.findByLabelText('Filters (JSON)'), '{{"tone":"warm"}');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const searchCard = (await screen.findByText('Search records')).closest('div') as HTMLElement;
    const openBtn = await within(searchCard).findByRole('button', { name: 'Open' });
    await user.click(openBtn);
    expect(navigate).toHaveBeenCalledWith('states', {
      state: 'profile',
      subject: 'person:p-1',
      target: 'agent:assistant',
    });
  });

  it('the subjects browser pages with Load more', async () => {
    const user = userEvent.setup({ delay: null });
    const second = { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-2' };
    const listStateSubjects = vi
      .fn()
      .mockResolvedValueOnce({ subjects: [subjectRow], next_cursor: 'c2', held: [] })
      .mockResolvedValueOnce({
        subjects: [{ subject: second, updated_at: 1767312000 }],
        next_cursor: null,
        held: [],
      });
    renderWithProviders(<RecordsTab state={state} />, { client: client({ listStateSubjects }) });
    await screen.findByText('Subjects');
    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    await waitFor(() => {
      expect(listStateSubjects).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('p-2')).toBeInTheDocument();
  });

  it('a known target fills the lookup target', async () => {
    const user = userEvent.setup({ delay: null });
    const { navigate } = renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        listConversationRoutes: vi
          .fn()
          .mockResolvedValue({ items: [{ target_kind: 'tool', target_name: 'relay' }], total: 1 }),
      }),
    });
    await user.type(await screen.findByLabelText('Key'), 'p-9');
    await user.click(await screen.findByLabelText('Known targets'));
    await user.click(await screen.findByRole('option', { name: 'tool · relay' }));
    await user.click(screen.getByRole('button', { name: 'Lookup' }));
    expect(navigate).toHaveBeenCalledWith('states', {
      state: 'profile',
      subject: 'person:p-9',
      target: 'tool:relay',
    });
  });

  it('searches the known targets', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        listConversationRoutes: vi.fn().mockResolvedValue({
          items: [
            { target_kind: 'tool', target_name: 'relay' },
            { target_kind: 'agent', target_name: 'assistant' },
          ],
          total: 2,
        }),
      }),
    });
    await user.click(await screen.findByLabelText('Known targets'));
    await user.type(screen.getByRole('combobox', { name: 'Search targets' }), 'ASSIST');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'agent · assistant',
    ]);
  });

  it('a subjects read error surfaces loudly', async () => {
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        listStateSubjects: vi.fn().mockRejectedValue(new Error('subjects down')),
      }),
    });
    expect(await screen.findByText('subjects down')).toBeInTheDocument();
  });

  it('a content search with no hits shows the no-matches state', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RecordsTab state={state} />, { client: client() });
    await user.type(await screen.findByLabelText('Filters (JSON)'), '{{"x":"nope"}');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  it('a content search error surfaces loudly', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({ searchStateRecords: vi.fn().mockRejectedValue(new Error('search down')) }),
    });
    await user.type(await screen.findByLabelText('Filters (JSON)'), '{{"a":"x"}');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('search down')).toBeInTheDocument();
  });

  it('a search box that is not a JSON object shows the parse error and never queries', async () => {
    const user = userEvent.setup({ delay: null });
    const searchStateRecords = vi
      .fn()
      .mockResolvedValue({ matches: [], next_cursor: null, held: [] });
    renderWithProviders(<RecordsTab state={state} />, { client: client({ searchStateRecords }) });
    // A bare scalar is not a containment object.
    await user.type(await screen.findByLabelText('Filters (JSON)'), 'warm');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(
      await screen.findByText('Enter a JSON object to match records by containment.'),
    ).toBeInTheDocument();
    expect(searchStateRecords).not.toHaveBeenCalled();
  });

  it('a failed targets read surfaces inline while the free-entry target stays usable', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        listConversationRoutes: vi.fn().mockRejectedValue(new Error('targets down')),
      }),
    });
    expect(await screen.findByText(/Could not load known targets/)).toBeInTheDocument();
    // The free-entry target field still accepts input.
    const targetName = screen.getByLabelText('Target name');
    await user.type(targetName, 'assistant');
    expect(targetName).toHaveValue('assistant');
    // No swallow to a silent picker: the known-targets Select is absent.
    expect(screen.queryByLabelText('Known targets')).toBeNull();
  });

  it('a 501 from the targets read shows FeatureDisabled', async () => {
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        listConversationRoutes: vi.fn().mockRejectedValue(new ApiError('no store', 501)),
      }),
    });
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });

  it('a 501 from the content search shows FeatureDisabled', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        searchStateRecords: vi.fn().mockRejectedValue(new ApiError('no store', 501)),
      }),
    });
    await user.type(await screen.findByLabelText('Filters (JSON)'), '{{"a":"x"}');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });
  it('names the held subjects once each and scrolls to the pending saves card', async () => {
    const user = userEvent.setup({ delay: null });
    const other = { ...subject, key: 'p-2' };
    const held = [
      { save_id: '7', held_by: '7', subjects: [subject, other] },
      { save_id: '8', held_by: '7', subjects: [subject] },
    ];
    const card = document.createElement('div');
    card.id = PENDING_SAVES_CARD_ID;
    const scrollIntoView = vi.fn();
    card.scrollIntoView = scrollIntoView;
    document.body.appendChild(card);
    try {
      renderWithProviders(<RecordsTab state={state} />, {
        client: client({
          listStateSubjects: vi
            .fn()
            .mockResolvedValue({ subjects: [subjectRow], next_cursor: null, held }),
        }),
      });
      const line = await screen.findByTestId('held-subjects-line');
      expect(line).toHaveTextContent(
        '2 subject(s) on this state are held by a failed pending save and show their last applied data. Retry or discard it under Pending saves.',
      );
      await user.click(within(line).getByRole('button', { name: 'Pending saves' }));
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    } finally {
      card.remove();
    }
  });

  it('shows no held line when no subject is held', async () => {
    renderWithProviders(<RecordsTab state={state} />, { client: client() });
    await screen.findByText('p-1');
    expect(screen.queryByTestId('held-subjects-line')).toBeNull();
  });

  it('the content search names the held subjects among its hits', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        searchStateRecords: vi.fn().mockResolvedValue({
          matches: [subjectRow],
          next_cursor: null,
          held: [{ save_id: '7', held_by: '7', subjects: [subject] }],
        }),
      }),
    });
    await user.type(await screen.findByLabelText('Filters (JSON)'), '{{"a":"x"}');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const searchCard = (await screen.findByText('Search records')).closest('div') as HTMLElement;
    expect(await within(searchCard).findByTestId('held-subjects-line')).toHaveTextContent(
      /^1 subject\(s\) on this state are held/,
    );
  });
});

/** The card under the subjects table, where a kind's records are checked against the schema. */
function misfit(
  key: string,
  reasons = [{ path: '$.age', message: "'age' is a required property" }],
) {
  return { subject: { ...subject, key }, updated_at: 1767225600, reasons };
}

describe('RecordsTab — check records against the schema', () => {
  it('walks every page following next_cursor and sums checked + misfits', async () => {
    const user = userEvent.setup({ delay: null });
    const checkStateRecords = vi
      .fn()
      .mockResolvedValueOnce({ checked: 50, items: [misfit('p-7')], next_cursor: 'c2', held: [] })
      .mockResolvedValueOnce({ checked: 30, items: [], next_cursor: null, held: [] });
    renderWithProviders(<RecordsTab state={state} />, { client: client({ checkStateRecords }) });
    await user.click(await screen.findByRole('button', { name: 'Check records' }));
    await waitFor(() => {
      expect(checkStateRecords).toHaveBeenCalledTimes(2);
    });
    // The default kind drives the walk; the second page reads from the first's cursor.
    expect(checkStateRecords.mock.calls[0]?.[1]).toEqual({
      kind: 'person',
      limit: 500,
      cursor: undefined,
    });
    expect(checkStateRecords.mock.calls[1]?.[1]).toEqual({
      kind: 'person',
      limit: 500,
      cursor: 'c2',
    });
    expect(await screen.findByTestId('check-summary')).toHaveTextContent(
      '80 checked — 1 do not fit',
    );
  });

  it('picks the kind to check from the select', async () => {
    const user = userEvent.setup({ delay: null });
    const checkStateRecords = vi
      .fn()
      .mockResolvedValue({ checked: 1, items: [], next_cursor: null, held: [] });
    renderWithProviders(<RecordsTab state={state} />, { client: client({ checkStateRecords }) });
    // The card's own kind select (scoped past the lookup/browse ones), then the Check button.
    const checkCard = (await screen.findByText('Check records against the schema')).closest(
      'div',
    ) as HTMLElement;
    await user.click(within(checkCard).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'thread' }));
    await user.click(within(checkCard).getByRole('button', { name: 'Check records' }));
    await waitFor(() => {
      expect(checkStateRecords).toHaveBeenCalled();
    });
    expect(checkStateRecords.mock.calls[0]?.[1]).toEqual({
      kind: 'thread',
      limit: 500,
      cursor: undefined,
    });
  });

  it('lists each misfit with its reasons and opens the record on a row link', async () => {
    const user = userEvent.setup({ delay: null });
    const checkStateRecords = vi.fn().mockResolvedValue({
      checked: 10,
      items: [misfit('p-7', [{ path: '$.age', message: "'age' is a required property" }])],
      next_cursor: null,
      held: [],
    });
    const { navigate } = renderWithProviders(<RecordsTab state={state} />, {
      client: client({ checkStateRecords }),
    });
    await user.click(await screen.findByRole('button', { name: 'Check records' }));
    // The reason renders `path — message`.
    expect(
      await screen.findByText("'age' is a required property", { exact: false }),
    ).toHaveTextContent("$.age — 'age' is a required property");
    await user.click(await screen.findByRole('button', { name: 'p-7' }));
    expect(navigate).toHaveBeenCalledWith('states', {
      state: 'profile',
      subject: 'person:p-7',
      target: 'agent:assistant',
    });
  });

  it('shows the all-fit empty state when a full walk finds no misfits', async () => {
    const user = userEvent.setup({ delay: null });
    const checkStateRecords = vi
      .fn()
      .mockResolvedValue({ checked: 5, items: [], next_cursor: null, held: [] });
    renderWithProviders(<RecordsTab state={state} />, { client: client({ checkStateRecords }) });
    await user.click(await screen.findByRole('button', { name: 'Check records' }));
    expect(await screen.findByText('All records fit')).toBeInTheDocument();
    expect(screen.getByTestId('check-summary')).toHaveTextContent('5 checked — 0 do not fit');
  });

  it('names the held subjects the walk skipped', async () => {
    const user = userEvent.setup({ delay: null });
    const checkStateRecords = vi.fn().mockResolvedValue({
      checked: 4,
      items: [],
      next_cursor: null,
      held: [{ save_id: '7', held_by: '7', subjects: [subject] }],
    });
    renderWithProviders(<RecordsTab state={state} />, { client: client({ checkStateRecords }) });
    await user.click(await screen.findByRole('button', { name: 'Check records' }));
    const line = await screen.findByTestId('held-subjects-line');
    expect(line).toHaveTextContent(/^1 subject\(s\) on this state are held/);
  });

  it('reads a 501 as a muted not-enabled note, never an alert', async () => {
    const user = userEvent.setup({ delay: null });
    const checkStateRecords = vi.fn().mockRejectedValue(new ApiError('no store', 501));
    renderWithProviders(<RecordsTab state={state} />, { client: client({ checkStateRecords }) });
    await user.click(await screen.findByRole('button', { name: 'Check records' }));
    expect(await screen.findByTestId('check-disabled')).toHaveTextContent(
      /Checking records is not enabled on this deployment/,
    );
    // Muted, not a loud error surface.
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('stops loudly on a mid-walk page error and resumes from the last good cursor on Retry', async () => {
    const user = userEvent.setup({ delay: null });
    const checkStateRecords = vi
      .fn()
      .mockResolvedValueOnce({ checked: 50, items: [misfit('p-7')], next_cursor: 'c2', held: [] })
      .mockRejectedValueOnce(new Error('page 2 down'))
      .mockResolvedValueOnce({ checked: 30, items: [misfit('p-9')], next_cursor: null, held: [] });
    renderWithProviders(<RecordsTab state={state} />, { client: client({ checkStateRecords }) });
    await user.click(await screen.findByRole('button', { name: 'Check records' }));
    // The failure is loud, and the partial aggregate stays on screen (never a silent truncation).
    expect(await screen.findByText('page 2 down')).toBeInTheDocument();
    expect(screen.getByTestId('check-summary')).toHaveTextContent('50 checked — 1 do not fit');
    expect(screen.getByRole('button', { name: 'p-7' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(checkStateRecords).toHaveBeenCalledTimes(3);
    });
    // The retry resumes from the failed page's cursor rather than restarting the walk.
    expect(checkStateRecords.mock.calls[1]?.[1]).toEqual({
      kind: 'person',
      limit: 500,
      cursor: 'c2',
    });
    expect(checkStateRecords.mock.calls[2]?.[1]).toEqual({
      kind: 'person',
      limit: 500,
      cursor: 'c2',
    });
    expect(await screen.findByTestId('check-summary')).toHaveTextContent(
      '80 checked — 2 do not fit',
    );
    expect(screen.getByRole('button', { name: 'p-9' })).toBeInTheDocument();
  });
});
