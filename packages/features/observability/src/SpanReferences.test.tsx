/**
 * A span value recorded with references to other steps: the toolbar (the reference
 * count and the As recorded | Resolved switch), the resolved read and its loading,
 * missing-reference (502) and other-error states, and the not-recorded note.
 */
import { ApiError, type ResolvedSpanValue, type RunSpan } from '@tai42/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SpanDetail } from './SpanDetail';
import { countReferences, hasUnrecorded, referencePaths, SpanValueSection } from './SpanReferences';
import { renderWithProviders, type StubApiClient } from './test-utils';

const ref = (spanId: string, pointer = '') => ({
  $tai42_ref: { span_id: spanId, field: 'output', pointer },
});

const RECORDED = { question: 'q', context: ref('s1'), history: [ref('s2', '/0'), 'kept'] };

function resolved(value: unknown): ResolvedSpanValue {
  return { traceId: 't1', spanId: 'sp', field: 'input', pointer: '', value };
}

function renderSection(client: StubApiClient, value: unknown = RECORDED) {
  return renderWithProviders(
    <SpanValueSection traceId="t1" spanId="sp" field="input" label="Input" value={value} />,
    { client },
  );
}

describe('countReferences / hasUnrecorded', () => {
  it('counts every reference object in the value, never looking inside one', () => {
    expect(countReferences(RECORDED)).toBe(2);
    expect(countReferences({ a: 1, b: ['x'] })).toBe(0);
    expect(countReferences(ref('s'))).toBe(1);
  });

  it('stops at the depth bound', () => {
    let deep: unknown = ref('s');
    for (let i = 0; i < 70; i += 1) deep = { next: deep };
    expect(countReferences(deep)).toBe(0);
  });

  it('finds the not-recorded marker anywhere in the value', () => {
    expect(hasUnrecorded({ a: [{ $tai42_unrecorded: true }] })).toBe(true);
    expect(hasUnrecorded({ a: 1 })).toBe(false);
  });
});

/**
 * The output an agent turn's model step records: the step's update carries the model
 * message, each of whose fields the writer replaces by a reference to the model call's
 * metadata — the reference body sits six levels below the field's root.
 */
function modelStepOutput(spanId: string): unknown {
  const metadataRef = (pointer: string) => ({
    $tai42_ref: { span_id: spanId, field: 'metadata', pointer },
  });
  return [
    {
      graph: null,
      update: {
        messages: [
          {
            content: 'The answer.',
            additional_kwargs: metadataRef('/tai42.message/additional_kwargs'),
            type: 'ai',
            tool_calls: metadataRef('/tai42.message/tool_calls'),
          },
        ],
      },
      resume: null,
      goto: [],
    },
  ];
}

function chainSpan(id: string, output: unknown): RunSpan {
  return {
    id,
    parentId: null,
    traceId: 't1',
    name: id,
    kind: 'CHAIN',
    level: null,
    statusMessage: null,
    start: null,
    end: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    metadata: null,
    input: { x: 1 },
    output,
  };
}

describe('referencePaths', () => {
  it('names the path to the body of every reference, array indexes included', () => {
    expect(referencePaths(RECORDED)).toEqual([
      ['context', '$tai42_ref'],
      ['history', '0', '$tai42_ref'],
    ]);
    expect(referencePaths({ a: 1 })).toEqual([]);
    expect(referencePaths(ref('s'))).toEqual([['$tai42_ref']]);
  });

  it('stops at the same depth bound as the count', () => {
    let deep: unknown = ref('s');
    for (let i = 0; i < 70; i += 1) deep = { next: deep };
    expect(referencePaths(deep)).toEqual([]);
  });
});

describe('references at the depth an agent model step records them', () => {
  it('shows each reference with its span id and pointer As recorded', () => {
    renderWithProviders(
      <SpanDetail span={chainSpan('model', modelStepOutput('gen-777'))} traceId="t1" />,
      {
        client: {},
      },
    );
    const detail = screen.getByTestId('span-detail');
    expect(
      within(detail).getByText('Recorded with 2 references to other steps.'),
    ).toBeInTheDocument();
    expect(within(detail).getAllByText(/\$tai42_ref/).length).toBe(2);
    expect(within(detail).getAllByText(/gen-777/).length).toBe(2);
    expect(within(detail).getByText(/\/tai42\.message\/additional_kwargs/)).toBeInTheDocument();
    expect(within(detail).getByText(/\/tai42\.message\/tool_calls/)).toBeInTheDocument();
  });

  it('shows a reference one level shallower the same way', () => {
    const [step] = modelStepOutput('gen-778') as [{ update: unknown }];
    renderWithProviders(<SpanDetail span={chainSpan('model', [step.update])} traceId="t1" />, {
      client: {},
    });
    const detail = screen.getByTestId('span-detail');
    expect(within(detail).getAllByText(/gen-778/).length).toBe(2);
    expect(within(detail).getByText(/\/tai42\.message\/tool_calls/)).toBeInTheDocument();
  });

  it('keeps the tree default for the branches that lead to no reference', () => {
    const value = { context: ref('s1'), other: { inner: { leaf: 'hidden' } } };
    renderSection({}, value);
    expect(screen.getAllByText(/s1/).length).toBeGreaterThan(0);
    expect(screen.getByText('inner:')).toBeInTheDocument();
    expect(screen.queryByText('leaf:')).not.toBeInTheDocument();
  });
});

describe('SpanValueSection', () => {
  it('shows a plain tree and no toolbar for a value without references', () => {
    renderSection({}, { a: 1 });
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByText(/Recorded with/)).not.toBeInTheDocument();
  });

  it('counts the references and shows the value as recorded by default', () => {
    const getResolvedSpanValue = vi.fn();
    renderSection({ getResolvedSpanValue });

    expect(screen.getByText('Recorded with 2 references to other steps.')).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Input view' });
    expect(within(group).getByRole('radio', { name: 'As recorded' })).toBeChecked();
    // The reference objects stay in the tree as recorded, each with its span id, the
    // one nested in a list included.
    expect(screen.getAllByText(/\$tai42_ref/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/s1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/s2/).length).toBeGreaterThan(0);
    expect(getResolvedSpanValue).not.toHaveBeenCalled();
  });

  it('opens the whole field resolved, showing the loading state first', async () => {
    const user = userEvent.setup();
    let release: (value: ResolvedSpanValue) => void = () => undefined;
    const pending = new Promise<ResolvedSpanValue>((resolve) => {
      release = resolve;
    });
    const getResolvedSpanValue = vi.fn().mockReturnValue(pending);
    renderSection({ getResolvedSpanValue });

    await user.click(screen.getByRole('radio', { name: 'Resolved' }));
    expect(screen.getByText('Opening references…')).toBeInTheDocument();
    expect(getResolvedSpanValue).toHaveBeenCalledWith('t1', 'sp', 'input', {}, expect.anything());

    await act(async () => {
      release(resolved({ question: 'q', context: 'the context', history: ['h0', 'kept'] }));
      await pending;
    });
    expect(await screen.findByText('Full value assembled from 2 references.')).toBeInTheDocument();
    expect(screen.queryAllByText(/\$tai42_ref/)).toHaveLength(0);
    expect(screen.getByText(/the context/)).toBeInTheDocument();
    // Focus moves into the resolved tree.
    expect(document.activeElement).toBe(screen.getByTestId('resolved-tree'));
  });

  it('names a missing referenced value on a 502 and offers the recorded view back', async () => {
    const user = userEvent.setup();
    const getResolvedSpanValue = vi
      .fn()
      .mockRejectedValue(new ApiError('reference s2 not held (not yet available or lost)', 502));
    renderSection({ getResolvedSpanValue });

    await user.click(screen.getByRole('radio', { name: 'Resolved' }));
    const panel = await screen.findByRole('alert');
    expect(panel).toHaveTextContent(
      'A referenced value is missing from the monitoring backend: reference s2 not held (not yet available or lost)',
    );
    await user.click(within(panel).getByRole('button', { name: 'Show as recorded' }));
    expect(screen.getByRole('radio', { name: 'As recorded' })).toBeChecked();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a retry on any other failure', async () => {
    const user = userEvent.setup();
    const getResolvedSpanValue = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('reader exploded', 500))
      .mockResolvedValue(resolved({ question: 'q' }));
    renderSection({ getResolvedSpanValue });

    await user.click(screen.getByRole('radio', { name: 'Resolved' }));
    const panel = await screen.findByRole('alert');
    expect(panel).toHaveTextContent('Could not open the references: reader exploded');
    await user.click(within(panel).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(getResolvedSpanValue).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Full value assembled from 2 references.')).toBeInTheDocument();
  });

  it('says when some values were not recorded', () => {
    renderSection({}, { a: { $tai42_unrecorded: true } });
    expect(
      screen.getByText('Some values were not recorded (monitoring was off when those steps ran).'),
    ).toBeInTheDocument();
  });
});
