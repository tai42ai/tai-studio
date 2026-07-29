import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { flushResizeObservers, setElementOverflow } from '../testing';
import { SchemaEditor, type SchemaEditorChange } from './SchemaEditor';

/** The last change the editor reported, or a valid-empty default. */
function lastChange(onChange: ReturnType<typeof vi.fn>): SchemaEditorChange {
  const calls = onChange.mock.calls;
  return calls.length > 0
    ? (calls[calls.length - 1]?.[0] as SchemaEditorChange)
    : { schema: null, valid: true };
}

function setText(value: string): void {
  fireEvent.change(screen.getByLabelText('Schema JSON'), { target: { value } });
}

describe('SchemaEditor', () => {
  it('seeds the textarea from the value dict', () => {
    render(
      <SchemaEditor
        value={{ type: 'object', title: 'Seed' }}
        onChange={vi.fn()}
        requireTitle={false}
      />,
    );
    expect(screen.getByLabelText('Schema JSON')).toHaveValue(
      JSON.stringify({ type: 'object', title: 'Seed' }, null, 2),
    );
  });

  it('surfaces a parse error inline and reports invalid on malformed JSON', () => {
    const onChange = vi.fn();
    render(<SchemaEditor value={null} onChange={onChange} requireTitle={false} />);
    setText('{ not json');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(lastChange(onChange).valid).toBe(false);
    expect(lastChange(onChange).schema).toBeNull();
  });

  it('honors requireTitle: a schema without a title blocks with a visible message', () => {
    const onChange = vi.fn();
    render(<SchemaEditor value={null} onChange={onChange} requireTitle />);
    setText('{ "type": "object", "properties": {} }');
    expect(screen.getByRole('alert')).toHaveTextContent(/title/i);
    expect(lastChange(onChange).valid).toBe(false);

    // Adding the title clears the block.
    setText('{ "type": "object", "title": "Report", "properties": {} }');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lastChange(onChange).valid).toBe(true);
  });

  it('does not require a title when requireTitle is false', () => {
    const onChange = vi.fn();
    render(<SchemaEditor value={null} onChange={onChange} requireTitle={false} />);
    setText('{ "type": "object", "properties": {} }');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lastChange(onChange)).toEqual({
      schema: { type: 'object', properties: {} },
      valid: true,
    });
  });

  it('previews a simple object schema through SchemaForm (property labels)', () => {
    render(
      <SchemaEditor
        value={{
          type: 'object',
          title: 'Report',
          properties: { headline: { type: 'string', title: 'Headline' } },
        }}
        onChange={vi.fn()}
        requireTitle={false}
      />,
    );
    const preview = screen.getByTestId('schema-editor-preview');
    // The SchemaForm preview renders the declared property label.
    expect(within(preview).getByTestId('schema-preview')).toBeInTheDocument();
    expect(within(preview).getByText('Headline')).toBeInTheDocument();
  });

  it('falls back to a JsonTree preview for a schema SchemaForm cannot render', () => {
    // A `{ type: object }` with no properties is a free-form object the form cannot
    // render — the preview shows the schema dict through JsonTree instead.
    render(<SchemaEditor value={{ type: 'object' }} onChange={vi.fn()} requireTitle={false} />);
    const preview = screen.getByTestId('schema-editor-preview');
    expect(within(preview).queryByTestId('schema-preview')).not.toBeInTheDocument();
    // The JsonTree fallback shows the schema's own keys/values.
    expect(within(preview).getByText(/type:/)).toBeInTheDocument();
  });

  it('degrades to the JsonTree preview when a renderable schema throws on render', () => {
    // The root classifies as a renderable object (so the form preview is attempted),
    // but a child property carries an unresolvable `$ref` that throws deeper in the
    // render. The error boundary must catch it and fall back to the JsonTree of the
    // schema dict instead of crashing the enclosing dialog.
    render(
      <SchemaEditor
        value={{
          type: 'object',
          title: 'Report',
          required: ['bad'],
          properties: { bad: { $ref: '#/$defs/Missing' } },
        }}
        onChange={vi.fn()}
        requireTitle={false}
      />,
    );
    const preview = screen.getByTestId('schema-editor-preview');
    // The SchemaForm did not render (it threw); the JsonTree fallback shows instead.
    expect(within(preview).queryByTestId('schema-preview')).not.toBeInTheDocument();
    expect(within(preview).getByText(/type:/)).toBeInTheDocument();
  });

  it('round-trips a schema carrying $defs/anyOf untouched', () => {
    const onChange = vi.fn();
    render(<SchemaEditor value={null} onChange={onChange} requireTitle={false} />);
    const schema = {
      $defs: { Item: { type: 'string' } },
      type: 'object',
      properties: { any: { anyOf: [{ $ref: '#/$defs/Item' }, { type: 'null' }] } },
    };
    setText(JSON.stringify(schema));
    expect(lastChange(onChange)).toEqual({ schema, valid: true });
  });

  it('writes the schema in the mono textarea and frames the preview as a card', () => {
    render(
      <SchemaEditor
        value={{ type: 'object', title: 'Report', properties: {} }}
        onChange={vi.fn()}
        requireTitle={false}
      />,
    );

    expect(screen.getByTestId('schema-editor')).toHaveClass('tai-stack', 'tai-stack-3');
    expect(screen.getByLabelText('Schema JSON')).toHaveClass('tai-textarea', 'tai-textarea-mono');
    expect(screen.getByText('Preview')).toHaveClass('tai-label');

    // A wide preview scrolls inside its own pane rather than the dialog, and is
    // a keyboard target only while it actually does.
    const preview = screen.getByTestId('schema-editor-preview');
    expect(preview).toHaveClass('tai-card', 'tai-scroll-region');
    expect(preview).not.toHaveAttribute('tabindex');

    setElementOverflow(preview, true);
    act(() => {
      flushResizeObservers();
    });

    expect(screen.getByRole('region', { name: 'Schema preview' })).toBe(preview);
    expect(preview).toHaveAttribute('tabindex', '0');
  });

  it('frames the JsonTree fallback in a plain card and lets the tree name itself', () => {
    // The fallback branch's contract: only the element that ACTUALLY scrolls may
    // carry the region attributes. `JsonTree` is its own scrolling box, so the
    // card around it is a plain frame — a `ScrollRegion` there would announce a
    // name for a box that cannot move.
    render(<SchemaEditor value={{ type: 'object' }} onChange={vi.fn()} requireTitle={false} />);

    const preview = screen.getByTestId('schema-editor-preview');
    expect(preview).toHaveClass('tai-card');
    expect(preview).not.toHaveClass('tai-scroll-region');

    const pane = preview.querySelector<HTMLElement>('.tai-code-block');
    if (pane === null) throw new Error('no JsonTree pane rendered');

    // The frame is not a scroller: nothing measures it, and no region appears.
    setElementOverflow(preview, true);
    act(() => {
      flushResizeObservers();
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(preview).not.toHaveAttribute('tabindex');

    // The pane IS the scroller, and it takes the preview's name, not JsonTree's
    // generic default.
    setElementOverflow(pane, true);
    act(() => {
      flushResizeObservers();
    });
    expect(screen.getByRole('region', { name: 'Schema preview' })).toBe(pane);
    expect(pane).toHaveAttribute('tabindex', '0');
  });

  it('renders no preview block while the text does not parse', () => {
    render(<SchemaEditor value={null} onChange={vi.fn()} requireTitle={false} />);
    setText('{ not json');
    expect(screen.queryByTestId('schema-editor-preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('disables the textarea when disabled', () => {
    render(<SchemaEditor value={null} onChange={vi.fn()} requireTitle={false} disabled />);
    expect(screen.getByLabelText('Schema JSON')).toBeDisabled();
  });

  it('keeps a custom label on both the field and the textarea name', () => {
    render(
      <SchemaEditor
        value={null}
        onChange={vi.fn()}
        requireTitle={false}
        label="Output schema"
        description="What the tool returns."
        idPrefix="output-schema"
      />,
    );
    expect(screen.getByTestId('output-schema')).toBeInTheDocument();
    expect(screen.getByLabelText('Output schema JSON')).toBeInTheDocument();
    expect(screen.getByText('What the tool returns.')).toBeInTheDocument();
  });

  it('renders the mono textarea and previews the schema fields', () => {
    render(
      <SchemaEditor
        value={{
          type: 'object',
          title: 'Report',
          properties: { headline: { type: 'string', title: 'Headline' } },
        }}
        onChange={vi.fn()}
        requireTitle={false}
      />,
    );

    expect(screen.getByLabelText('Schema JSON')).toHaveClass('tai-textarea-mono');
    const preview = screen.getByTestId('schema-editor-preview');
    expect(within(preview).getByText('Headline')).toBeVisible();
  });
});
