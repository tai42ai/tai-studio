import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JsonSchema } from '../schema-form/types';
import { ElicitationForm } from './ElicitationForm';

const schema: JsonSchema = {
  type: 'object',
  properties: { city: { type: 'string', title: 'City' } },
  required: ['city'],
};

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

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

  it('lays the widget out on the design-system stack, prose and row classes', () => {
    render(
      <ElicitationForm message="Where to?" schema={schema} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );

    const root = screen.getByTestId('elicitation-form');
    expect(root).toHaveClass('tai-stack');
    expect(screen.getByText('Where to?')).toHaveClass('tai-prose');

    const actions = root.querySelector('.tai-row');
    expect(actions).not.toBeNull();
    expect(within(actions as HTMLElement).getByRole('button', { name: 'Submit' })).toBeVisible();
    expect(within(actions as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  it('disables both actions while an answer is in flight', () => {
    render(
      <ElicitationForm
        message="Where to?"
        schema={schema}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        busy
      />,
    );
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('renders the message, the form and its actions under both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      document.documentElement.setAttribute('data-theme', theme);
      const { unmount } = render(
        <ElicitationForm message="Where to?" schema={schema} onSubmit={vi.fn()} />,
      );

      expect(screen.getByTestId('elicitation-form')).toHaveClass('tai-stack');
      expect(screen.getByText('Where to?')).toBeVisible();
      expect(screen.getByRole('textbox', { name: 'City' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Submit' })).toHaveAccessibleName('Submit');

      unmount();
    }
  });
});
