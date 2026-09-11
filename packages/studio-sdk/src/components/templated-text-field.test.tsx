import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TemplatedText } from '@tai42/api-client';

import { TemplatedTextField, templatedTextSummary } from './templated-text-field';

function Harness({
  onEmit,
  required = false,
  templates,
  initial = null,
}: {
  readonly onEmit: (value: TemplatedText | null) => void;
  readonly required?: boolean;
  readonly templates?: readonly { id: string; label?: string }[];
  readonly initial?: TemplatedText | null;
}) {
  const [value, setValue] = useState<TemplatedText | null>(initial);
  return (
    <TemplatedTextField
      label="Condition"
      value={value}
      required={required}
      templates={templates}
      onChange={(next) => {
        setValue(next);
        onEmit(next);
      }}
    />
  );
}

describe('TemplatedTextField', () => {
  it('emits inline content and clears an optional field to null', async () => {
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness onEmit={onEmit} initial={{ content: 'a' }} />);
    const editor = screen.getByRole('textbox', { name: 'Condition' });
    await user.clear(editor);
    expect(onEmit).toHaveBeenLastCalledWith(null);
    await user.type(editor, '.x');
    expect(onEmit).toHaveBeenLastCalledWith({ content: '.x' });
  });

  it('keeps a required field non-null, emitting an empty source the schema refuses', async () => {
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness onEmit={onEmit} required initial={{ content: 'a' }} />);
    await user.clear(screen.getByRole('textbox', { name: 'Condition' }));
    expect(onEmit).toHaveBeenLastCalledWith({ content: '' });
  });

  it('authors a stored template id, never both sources at once', async () => {
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness onEmit={onEmit} templates={[{ id: 'tmpl_a' }]} initial={{ content: '.x' }} />);
    await user.click(screen.getByRole('radio', { name: 'Stored template' }));
    await user.click(screen.getByRole('combobox', { name: 'Condition' }));
    await user.click(await screen.findByRole('option', { name: 'tmpl_a' }));
    const last = onEmit.mock.calls.at(-1)?.[0] as TemplatedText;
    expect(last).toEqual({ id: 'tmpl_a' });
    expect(last.content).toBeUndefined();
  });

  it('carries render kwargs alongside the chosen source', async () => {
    const user = userEvent.setup();
    const onEmit = vi.fn();
    render(<Harness onEmit={onEmit} initial={{ content: '.x' }} />);
    await user.click(screen.getByRole('button', { name: 'Add render parameters' }));
    await user.type(screen.getByLabelText('Condition render parameters key 1'), 'tier');
    await user.type(screen.getByLabelText('Condition render parameters value 1'), 'pro');
    expect(onEmit).toHaveBeenLastCalledWith({ content: '.x', kwargs: { tier: 'pro' } });
  });

  it('shows the template list error with a retry, not a broken picker', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <TemplatedTextField
        label="Condition"
        value={{ id: 'tmpl_a' }}
        onChange={vi.fn()}
        templatesError="Could not load templates."
        onTemplatesRetry={onRetry}
      />,
    );
    expect(screen.getByText('Could not load templates.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('surfaces the verbatim server message for a stored id that no longer resolves', () => {
    render(
      <TemplatedTextField
        label="Condition"
        value={{ id: 'ghost' }}
        onChange={vi.fn()}
        templates={[{ id: 'tmpl_a' }]}
        resolveError="template 'ghost' not found"
      />,
    );
    expect(screen.getByText("template 'ghost' not found")).toBeInTheDocument();
  });

  it('summarizes a value for read-only display', () => {
    expect(templatedTextSummary(null)).toBe('(unset)');
    expect(templatedTextSummary({ content: '.x' })).toBe('.x');
    expect(templatedTextSummary({ id: 'tmpl_a' })).toBe('template: tmpl_a');
  });
});
