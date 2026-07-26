import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { JsonSchema } from '../schema-form/types';
import { StructuredOutput } from './StructuredOutput';

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

  it('lets a wide value scroll inside its own region rather than the page', () => {
    const { rerender } = render(
      <StructuredOutput schema={schema} content={{ title: 'hello', score: 5 }} />,
    );
    expect(screen.getByText('Report title').parentElement).toHaveClass('tai-scroll-region');

    rerender(<StructuredOutput content={{ anything: [1, 2] }} />);
    expect(screen.getByTestId('structured-output-raw')).toHaveClass('tai-scroll-region');
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
