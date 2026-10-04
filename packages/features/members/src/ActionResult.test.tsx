import type { JsonSchema } from '@tai42/studio-sdk';
import { ThemeProvider } from '@tai42/studio-sdk';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ActionResult } from './ActionResult';

/** ActionResult reads no API; it needs only the theme context the design system uses. */
function renderResult(schema: JsonSchema, value: Record<string, unknown>): void {
  const ui = (
    <ThemeProvider>
      <ActionResult schema={schema} value={value} />
    </ThemeProvider>
  );
  render(ui as ReactElement);
}

/** The `.tai-field` readback block that carries the given label. */
function fieldFor(label: string): HTMLElement {
  const field = screen.getByText(label).closest('.tai-field');
  expect(field).not.toBeNull();
  return field as HTMLElement;
}

describe('ActionResult', () => {
  it('shows a plain completion line when the result schema declares no field', () => {
    renderResult({ type: 'object', properties: {} }, {});
    const result = screen.getByTestId('member-action-result');
    expect(result).toHaveTextContent('The action completed.');
    // No per-field readback is rendered in the no-field case.
    expect(result.querySelector('.tai-field')).toBeNull();
  });

  it('shows the completion line when the schema omits the properties key entirely', () => {
    renderResult({ type: 'object' }, {});
    expect(screen.getByTestId('member-action-result')).toHaveTextContent('The action completed.');
  });

  it('renders an untyped field carrying a string as read-only text, not a copy control', () => {
    // No declared type → not a copy field; the string renders as a plain readback.
    renderResult({ type: 'object', properties: { note: { title: 'Note' } } }, { note: 'plain' });
    expect(screen.queryByTestId('member-action-result-note')).toBeNull();
    expect(within(fieldFor('Note')).getByText('plain')).toBeInTheDocument();
  });

  it('renders a declared string field through a copy control with a shown-once caption', () => {
    renderResult(
      { type: 'object', properties: { token: { type: 'string', title: 'Token' } } },
      { token: 'secret-value-123' },
    );
    expect(screen.getByTestId('member-action-result-token')).toBeInTheDocument();
    expect(screen.getByText('secret-value-123')).toBeInTheDocument();
    expect(
      screen.getByText('Shown once — copy it now; it cannot be retrieved again.'),
    ).toBeInTheDocument();
  });

  it('labels a field by its key when the schema gives no title', () => {
    renderResult({ type: 'object', properties: { count: { type: 'number' } } }, { count: 42 });
    expect(within(fieldFor('count')).getByText('42')).toBeInTheDocument();
  });

  it('renders a number field as its text value under the declared title', () => {
    renderResult(
      { type: 'object', properties: { count: { type: 'number', title: 'Count' } } },
      { count: 7 },
    );
    expect(within(fieldFor('Count')).getByText('7')).toBeInTheDocument();
  });

  it('renders a boolean field as Yes or No', () => {
    renderResult(
      {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', title: 'Enabled' },
          archived: { type: 'boolean', title: 'Archived' },
        },
      },
      { enabled: true, archived: false },
    );
    expect(within(fieldFor('Enabled')).getByText('Yes')).toBeInTheDocument();
    expect(within(fieldFor('Archived')).getByText('No')).toBeInTheDocument();
  });

  it('renders a nested object field as an expandable tree', () => {
    renderResult(
      { type: 'object', properties: { details: { type: 'object', title: 'Details' } } },
      { details: { region: 'eu', shards: 3 } },
    );
    const field = fieldFor('Details');
    expect(within(field).getByText(/region/)).toBeInTheDocument();
    expect(within(field).getByText(/eu/)).toBeInTheDocument();
  });

  it('renders a dash for a declared field whose value is missing', () => {
    // A field declared string but with no value in the payload falls to the
    // read-only readback (not the copy control) and shows the empty marker.
    renderResult({ type: 'object', properties: { token: { type: 'string', title: 'Token' } } }, {});
    expect(screen.queryByTestId('member-action-result-token')).toBeNull();
    expect(within(fieldFor('Token')).getByText('—')).toBeInTheDocument();
  });

  it('renders a dash for a non-string field whose value is null or empty', () => {
    renderResult(
      {
        type: 'object',
        properties: {
          missing: { type: 'number', title: 'Missing' },
          blank: { type: 'number', title: 'Blank' },
        },
      },
      { missing: null, blank: '' },
    );
    expect(within(fieldFor('Missing')).getByText('—')).toBeInTheDocument();
    expect(within(fieldFor('Blank')).getByText('—')).toBeInTheDocument();
  });

  it('renders a value with no primitive text form through the JSON fallback without crashing', () => {
    // A value that is neither a recognised scalar nor an object (here a function)
    // takes the JSON fallback: it renders as the field with no readable text rather
    // than throwing.
    renderResult(
      { type: 'object', properties: { opaque: { title: 'Opaque' } } },
      { opaque: () => undefined },
    );
    expect(fieldFor('Opaque').querySelector('span')).not.toBeNull();
  });

  it('accepts a string type declared as a union and copies the value', () => {
    renderResult(
      { type: 'object', properties: { token: { type: ['string', 'null'], title: 'Token' } } },
      { token: 'union-string' },
    );
    expect(screen.getByTestId('member-action-result-token')).toBeInTheDocument();
    expect(screen.getByText('union-string')).toBeInTheDocument();
  });
});
