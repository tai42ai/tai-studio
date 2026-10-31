/**
 * The span detail's output section: a span that ended without error and returned an
 * empty value says so in a plain note; an in-flight or failed span shows no note.
 */
import type { RunSpan } from '@tai42/api-client';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SpanDetail } from './SpanDetail';
import { renderWithProviders } from './test-utils';

function span(over: Partial<RunSpan>): RunSpan {
  return {
    id: 's1',
    parentId: null,
    traceId: 't1',
    name: 'lookup',
    kind: 'TOOL',
    level: null,
    statusMessage: null,
    start: '2026-01-01T00:00:00Z',
    end: '2026-01-01T00:00:01Z',
    model: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    metadata: null,
    input: { city: 'Paris' },
    output: null,
    ...over,
  };
}

const detail = () => screen.getByTestId('span-detail');

describe('SpanDetail empty output', () => {
  it.each([null, '', [], {}])('says a tool returned an empty result for %j', (output) => {
    renderWithProviders(<SpanDetail span={span({ output })} traceId="t1" />, { client: {} });
    expect(within(detail()).getByText('Result')).toBeInTheDocument();
    expect(within(detail()).getByText('The tool returned an empty result.')).toBeInTheDocument();
  });

  it('says any other span recorded an empty output', () => {
    renderWithProviders(<SpanDetail span={span({ kind: 'CHAIN', output: {} })} traceId="t1" />, {
      client: {},
    });
    expect(within(detail()).getByText('Output')).toBeInTheDocument();
    expect(within(detail()).getByText('The span recorded an empty output.')).toBeInTheDocument();
  });

  it('shows no note while the span is still running', () => {
    renderWithProviders(<SpanDetail span={span({ end: null })} traceId="t1" />, { client: {} });
    expect(within(detail()).queryByText('The tool returned an empty result.')).toBeNull();
  });

  it('shows no note on a failed span, which shows its error instead', () => {
    renderWithProviders(
      <SpanDetail span={span({ level: 'ERROR', statusMessage: 'lookup refused' })} traceId="t1" />,
      { client: {} },
    );
    expect(within(detail()).getByText('lookup refused')).toBeInTheDocument();
    expect(within(detail()).queryByText('The tool returned an empty result.')).toBeNull();
  });
});
