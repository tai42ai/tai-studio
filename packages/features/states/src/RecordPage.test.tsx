/**
 * The record page: a malformed link prompts a repair; a missing document offers Create
 * through the schema form (never a blind PUT {}); an existing document edits and saves;
 * Erase is the delete door behind a danger confirm; Fold merges into another subject; the
 * Writes card pages the audit trail. Also the subject-param codec (split on the first
 * colon, URL-decoded).
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type StateDetail } from '@tai42/api-client';

import { RecordPage, parseSubjectRef, formatSubjectParam } from './RecordPage';
import { renderWithProviders, type StubApiClient } from './test-utils';

const subject = { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-1' };

function detail(): StateDetail {
  return {
    name: 'profile',
    description: '',
    schema: {},
    subject_kinds: ['person', 'thread'],
    default_subject_kind: 'person',
    retention_days: null,
    // An empty schema is not representable, so the editor uses the JSON textarea.
    effective_schema: {},
    regimes: [],
    mounts: [],
  };
}

function record(data: Record<string, unknown>) {
  return { state: 'profile', subject, data, seq: 2, canonical_subject: subject, folded_from: [] };
}

function client(over: Partial<StubApiClient> = {}): StubApiClient {
  return {
    getState: vi.fn().mockResolvedValue(detail()),
    getStateRecord: vi.fn().mockResolvedValue(record({ tone: 'warm' })),
    listStateWrites: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    ...over,
  };
}

describe('subject-param codec', () => {
  it('splits on the first colon and URL-decodes the tail', () => {
    const ref = parseSubjectRef('person:a%3Ab', 'agent:my%2Fbot');
    expect(ref).toEqual({
      target_kind: 'agent',
      target_name: 'my/bot',
      kind: 'person',
      key: 'a:b',
    });
  });

  it('round-trips a key with a colon', () => {
    expect(formatSubjectParam('person', 'a:b')).toBe('person:a%3Ab');
  });

  it('rejects a missing param', () => {
    expect(parseSubjectRef(undefined, 'agent:x')).toBeNull();
  });
});

describe('RecordPage', () => {
  it('a malformed link prompts a repair', async () => {
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam={undefined} targetParam={undefined} />,
      { client: client() },
    );
    expect(await screen.findByText('This record link is incomplete')).toBeInTheDocument();
  });

  it('a missing document creates one through the form (no blind PUT {})', async () => {
    const user = userEvent.setup();
    const putStateRecord = vi.fn().mockResolvedValue(record({ tone: 'calm' }));
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      {
        client: client({
          // No document yet reads as null (a 200 `{data: null}`), not a 404.
          getStateRecord: vi.fn().mockResolvedValue(null),
          putStateRecord,
        }),
      },
    );
    await user.click(await screen.findByRole('button', { name: 'Create' }));
    const textarea = await screen.findByLabelText('Document (JSON)');
    await user.clear(textarea);
    await user.type(textarea, '{{"tone":"calm"}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(putStateRecord).toHaveBeenCalledWith('profile', subject, { tone: 'calm' });
    });
  });

  it('an existing document edits and saves', async () => {
    const user = userEvent.setup();
    const putStateRecord = vi.fn().mockResolvedValue(record({ tone: 'cool' }));
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ putStateRecord }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const textarea = await screen.findByLabelText('Document (JSON)');
    await user.clear(textarea);
    await user.type(textarea, '{{"tone":"cool"}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(putStateRecord).toHaveBeenCalledWith('profile', subject, { tone: 'cool' });
    });
  });

  it('Erase deletes the record behind a danger confirm', async () => {
    const user = userEvent.setup();
    const deleteStateRecord = vi.fn().mockResolvedValue({ erased: true });
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ deleteStateRecord }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Erase' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Erase' }));
    await waitFor(() => {
      expect(deleteStateRecord).toHaveBeenCalledWith('profile', subject);
    });
  });

  it('Fold merges this subject into another', async () => {
    const user = userEvent.setup();
    const foldStateRecord = vi.fn().mockResolvedValue(record({ tone: 'warm' }));
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ foldStateRecord }) },
    );
    await screen.findByText('Fold into');
    await user.type(screen.getByLabelText('Key'), 'p-2');
    await user.click(screen.getByRole('button', { name: 'Fold' }));
    await waitFor(() => {
      expect(foldStateRecord).toHaveBeenCalledWith(
        'profile',
        subject,
        {
          target_kind: 'agent',
          target_name: 'assistant',
          kind: 'person',
          key: 'p-2',
        },
        'merge',
      );
    });
  });

  it('the Writes card renders the audit trail', async () => {
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      {
        client: client({
          listStateWrites: vi.fn().mockResolvedValue({
            items: [
              {
                seq: 1,
                at: '2026-01-01T00:00:00Z',
                origin: {
                  door: 'api',
                  consumer: 'cli',
                  meta: { step: 'greet' },
                  run_id: 'r-1',
                  actor: 'u-1',
                  turn_id: null,
                  inbound_id: null,
                  op_id: null,
                },
                paths: [['tone']],
              },
            ],
            next_cursor: null,
          }),
        }),
      },
    );
    expect(await screen.findByText('api')).toBeInTheDocument();
    expect(screen.getByText('u-1')).toBeInTheDocument();
    // The opaque provenance meta renders as compact single-line JSON.
    const meta = screen.getByText('{"step":"greet"}');
    expect(meta).toBeInTheDocument();
    expect(meta).toHaveAttribute('title', '{"step":"greet"}');
  });

  it('a 501 shows FeatureDisabled', async () => {
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      {
        client: client({
          getStateRecord: vi.fn().mockRejectedValue(new ApiError('no store', 501)),
        }),
      },
    );
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });

  it('a failed declaration read renders ErrorState, never the raw JSON editor', async () => {
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ getState: vi.fn().mockRejectedValue(new Error('state read failed')) }) },
    );
    expect(await screen.findByText('state read failed')).toBeInTheDocument();
    // No silent fall to the JSON editor / an empty fold.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByLabelText('Document (JSON)')).toBeNull();
  });

  it('a 501 on the declaration read shows FeatureDisabled', async () => {
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ getState: vi.fn().mockRejectedValue(new ApiError('no store', 501)) }) },
    );
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });

  it('a representable schema edits through the SchemaForm and saves the value', async () => {
    const user = userEvent.setup();
    const putStateRecord = vi.fn().mockResolvedValue(record({ tone: 'warm' }));
    const representable = {
      ...detail(),
      effective_schema: { type: 'object', properties: { tone: { type: 'string' } } },
    } as unknown as StateDetail;
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ getState: vi.fn().mockResolvedValue(representable), putStateRecord }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    // The schema-driven field renders (not the JSON textarea).
    expect(await screen.findByText('tone')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(putStateRecord).toHaveBeenCalledWith('profile', subject, { tone: 'warm' });
    });
  });

  it('a malformed JSON document blocks the save with a loud inline error', async () => {
    const user = userEvent.setup();
    const putStateRecord = vi.fn();
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ putStateRecord }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const textarea = await screen.findByLabelText('Document (JSON)');
    await user.clear(textarea);
    await user.type(textarea, 'not json');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(putStateRecord).not.toHaveBeenCalled();
  });

  it('a refused fold renders inline', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      {
        client: client({
          foldStateRecord: vi.fn().mockRejectedValue(new Error('cannot fold onto self')),
        }),
      },
    );
    await screen.findByText('Fold into');
    await user.type(screen.getByLabelText('Key'), 'p-2');
    await user.click(screen.getByRole('button', { name: 'Fold' }));
    expect(await screen.findByText('cannot fold onto self')).toBeInTheDocument();
  });

  it('notes when a document was folded from other subjects', async () => {
    const folded = {
      state: 'profile',
      subject,
      data: { tone: 'warm' },
      seq: 3,
      canonical_subject: subject,
      folded_from: [{ target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-0' }],
    };
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ getStateRecord: vi.fn().mockResolvedValue(folded) }) },
    );
    expect(await screen.findByText(/Folded from 1 other/)).toBeInTheDocument();
  });

  it('a writes read error surfaces loudly', async () => {
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ listStateWrites: vi.fn().mockRejectedValue(new Error('writes down')) }) },
    );
    expect(await screen.findByText('writes down')).toBeInTheDocument();
  });

  it('the Writes card pages with Load more', async () => {
    const user = userEvent.setup();
    const entry = (seq: number) => ({
      seq,
      at: '2026-01-01T00:00:00Z',
      origin: {
        door: 'api',
        consumer: null,
        meta: null,
        run_id: null,
        actor: null,
        turn_id: null,
        inbound_id: null,
        op_id: null,
      },
      paths: [],
    });
    const listStateWrites = vi
      .fn()
      .mockResolvedValueOnce({ items: [entry(1)], next_cursor: 'c2' })
      .mockResolvedValueOnce({ items: [entry(2)], next_cursor: null });
    renderWithProviders(
      <RecordPage stateName="profile" subjectParam="person:p-1" targetParam="agent:assistant" />,
      { client: client({ listStateWrites }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    await waitFor(() => {
      expect(listStateWrites).toHaveBeenCalledTimes(2);
    });
  });
});
