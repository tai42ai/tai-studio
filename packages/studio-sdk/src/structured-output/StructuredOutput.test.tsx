import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { JsonSchema } from '../schema-form/types';
import { flushResizeObservers, setElementOverflow } from '../testing';
import { StructuredOutput } from './StructuredOutput';

/** The JSON pane a value renders into — the element that does the scrolling. */
function pane(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>('.tai-code-block');
  if (found === null) throw new Error('no JSON pane rendered');
  return found;
}

const schema: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', title: 'Report title' },
    score: { type: 'integer', title: 'Score' },
  },
  required: ['title', 'score'],
};

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('StructuredOutput', () => {
  it('renders structured content through the declared output_schema (labels + values)', () => {
    render(<StructuredOutput schema={schema} content={{ title: 'hello', score: 5 }} />);
    expect(screen.getByTestId('structured-output')).toBeInTheDocument();
    // Property titles come from the schema.
    expect(screen.getByText('Report title')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    // Values render through JsonTree.
    expect(screen.getByText('"hello"')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('falls back to a raw JsonTree when no schema is declared', () => {
    render(<StructuredOutput content={{ anything: [1, 2] }} />);
    expect(screen.getByTestId('structured-output-raw')).toBeInTheDocument();
    expect(screen.queryByTestId('structured-output')).not.toBeInTheDocument();
  });

  it('falls back to raw for a non-object schema', () => {
    render(<StructuredOutput schema={{ type: 'string' }} content={'plain'} />);
    expect(screen.getByTestId('structured-output-raw')).toBeInTheDocument();
  });

  it('renders each property as a labelled field on the design-system classes', () => {
    render(<StructuredOutput schema={schema} content={{ title: 'hello', score: 5 }} />);

    expect(screen.getByTestId('structured-output')).toHaveClass('tai-stack', 'tai-stack-2');

    const label = screen.getByText('Report title');
    expect(label).toHaveClass('tai-label');
    expect(label.parentElement).toHaveClass('tai-field');
  });

  it('names a wide value pane and makes it reachable ONLY while it overflows', () => {
    const { container } = render(
      <StructuredOutput schema={schema} content={{ title: 'hello', score: 5 }} />,
    );
    const valuePane = pane(container);
    expect(valuePane).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    setElementOverflow(valuePane, true);
    act(() => {
      flushResizeObservers();
    });

    // Named after its own property, so a reader landing on it knows which value it is.
    expect(screen.getByRole('region', { name: 'Report title' })).toBe(valuePane);
    expect(valuePane).toHaveAttribute('tabindex', '0');
  });

  it('names the schemaless pane after the output itself', () => {
    const { container } = render(<StructuredOutput content={{ anything: [1, 2] }} />);
    const rawPane = pane(container);

    setElementOverflow(rawPane, true);
    act(() => {
      flushResizeObservers();
    });

    expect(screen.getByRole('region', { name: 'Structured output' })).toBe(rawPane);
  });

  it('resolves a $ref property title through the schema root', () => {
    const refSchema: JsonSchema = {
      type: 'object',
      properties: { item: { $ref: '#/$defs/Item' } },
      $defs: { Item: { type: 'string', title: 'The item' } },
    };
    render(<StructuredOutput schema={refSchema} content={{ item: 'x' }} />);
    expect(screen.getByText('The item')).toBeInTheDocument();
  });

  it('falls back to the property key when the schema declares no title', () => {
    const untitled: JsonSchema = { type: 'object', properties: { raw: { type: 'string' } } };
    render(<StructuredOutput schema={untitled} content={{ raw: 'x' }} />);
    expect(screen.getByText('raw')).toHaveClass('tai-label');
  });

  it('renders its labels and values under both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      document.documentElement.setAttribute('data-theme', theme);
      const { unmount } = render(
        <StructuredOutput schema={schema} content={{ title: 'hello', score: 5 }} />,
      );

      expect(screen.getByTestId('structured-output')).toHaveClass('tai-stack');
      expect(screen.getByText('Report title')).toHaveClass('tai-label');
      expect(screen.getByText('"hello"')).toBeVisible();

      unmount();
    }
  });
});
