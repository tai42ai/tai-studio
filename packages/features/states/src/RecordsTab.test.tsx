/**
 * The Records tab: the lookup form opens a record by kind + key + target; the subjects
 * browser pages a kind and opens a row; the content search matches records and opens a
 * hit. Every open navigates `?state=&subject=&target=` with the subject/target params
 * encoded on their first colon.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type StateDetail } from '@tai42/api-client';

import { RecordsTab } from './RecordsTab';
import { renderWithProviders, type StubApiClient } from './test-utils';

const state = {
  name: 'profile',
  description: '',
  schema: { type: 'object' },
  subject_kinds: ['person', 'thread'],
  default_subject_kind: 'person',
  retention_days: null,
  mounts: [],
} as unknown as StateDetail;

const subject = { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-1' };
// A paged subject row as `list_subjects` / `search` dump it: the subject plus the
// record's `updated_at` (epoch seconds — 2026-01-01T00:00:00Z).
const subjectRow = { subject, updated_at: 1767225600 };

function client(over: Partial<StubApiClient> = {}): StubApiClient {
  return {
    listConversationRoutes: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listStateSubjects: vi.fn().mockResolvedValue({ subjects: [subjectRow], next_cursor: null }),
    searchStateRecords: vi.fn().mockResolvedValue({ matches: [], next_cursor: null }),
    ...over,
  };
}

describe('RecordsTab', () => {
  it('the lookup form opens a record by kind + key + target', async () => {
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        searchStateRecords: vi.fn().mockResolvedValue({
          matches: [subjectRow],
          next_cursor: null,
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
    const user = userEvent.setup();
    const second = { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-2' };
    const listStateSubjects = vi
      .fn()
      .mockResolvedValueOnce({ subjects: [subjectRow], next_cursor: 'c2' })
      .mockResolvedValueOnce({
        subjects: [{ subject: second, updated_at: 1767312000 }],
        next_cursor: null,
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
    const user = userEvent.setup();
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

  it('a subjects read error surfaces loudly', async () => {
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        listStateSubjects: vi.fn().mockRejectedValue(new Error('subjects down')),
      }),
    });
    expect(await screen.findByText('subjects down')).toBeInTheDocument();
  });

  it('a content search with no hits shows the no-matches state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecordsTab state={state} />, { client: client() });
    await user.type(await screen.findByLabelText('Filters (JSON)'), '{{"x":"nope"}');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  it('a content search error surfaces loudly', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({ searchStateRecords: vi.fn().mockRejectedValue(new Error('search down')) }),
    });
    await user.type(await screen.findByLabelText('Filters (JSON)'), '{{"a":"x"}');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('search down')).toBeInTheDocument();
  });

  it('a search box that is not a JSON object shows the parse error and never queries', async () => {
    const user = userEvent.setup();
    const searchStateRecords = vi.fn().mockResolvedValue({ matches: [], next_cursor: null });
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
    renderWithProviders(<RecordsTab state={state} />, {
      client: client({
        searchStateRecords: vi.fn().mockRejectedValue(new ApiError('no store', 501)),
      }),
    });
    await user.type(await screen.findByLabelText('Filters (JSON)'), '{{"a":"x"}');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });
});
