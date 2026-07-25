import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { JsonSchema } from '../schema-form/types';
import { ElicitationForm } from './ElicitationForm';

const schema: JsonSchema = {
  type: 'object',
  properties: { city: { type: 'string', title: 'City' } },
  required: ['city'],
};

describe('ElicitationForm', () => {
  it('renders the message and returns the typed answer on submit (round-trip)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ElicitationForm message="Where to?" schema={schema} onSubmit={onSubmit} />);

    expect(screen.getByText('Where to?')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'City' }), 'London');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledWith({ city: 'London' });
  });

  it('blocks submit and surfaces errors when the answer is invalid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ElicitationForm message="Where to?" schema={schema} onSubmit={onSubmit} />);

    // Required `city` left empty -> submit is blocked and nothing is emitted.
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a cancel affordance only when onCancel is provided', () => {
    const { rerender } = render(<ElicitationForm message="m" schema={schema} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    rerender(<ElicitationForm message="m" schema={schema} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
