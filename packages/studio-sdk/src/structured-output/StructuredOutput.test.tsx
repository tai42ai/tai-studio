import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
});
