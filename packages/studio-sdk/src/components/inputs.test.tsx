import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Field } from './field';
import { NumberInput, TextInput, Textarea } from './inputs';

describe('TextInput', () => {
  it('renders a textbox and typing updates its value', async () => {
    const user = userEvent.setup();
    render(<TextInput aria-label="name" />);
    const input = screen.getByRole('textbox', { name: 'name' });
    await user.type(input, 'hello');
    expect(input).toHaveValue('hello');
  });
});

describe('Textarea', () => {
  it('renders a multiline textbox and accepts input', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="notes" />);
    const area = screen.getByRole('textbox', { name: 'notes' });
    await user.type(area, 'line');
    expect(area).toHaveValue('line');
  });
});

describe('NumberInput', () => {
  it('renders a spinbutton and accepts a number', async () => {
    const user = userEvent.setup();
    render(<NumberInput aria-label="count" />);
    const input = screen.getByRole('spinbutton', { name: 'count' });
    await user.type(input, '42');
    expect(input).toHaveValue(42);
  });
});

describe('Field', () => {
  it('associates the label, control, description, and error', () => {
    render(
      <Field label="Email" description="work address" error="required">
        <TextInput />
      </Field>,
    );

    // The label's htmlFor targets the control (accessible name = label).
    const input = screen.getByRole('textbox', { name: 'Email' });

    // aria-invalid is set because an error is present.
    expect(input).toHaveAttribute('aria-invalid', 'true');

    // aria-describedby links BOTH the description and the error text.
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const ids = (describedBy ?? '').split(' ');
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(document.getElementById(id)).not.toBeNull();
    }

    // The error text is exposed as an alert.
    expect(screen.getByRole('alert')).toHaveTextContent('required');
    expect(screen.getByText('work address')).toBeInTheDocument();
  });

  it('omits aria-invalid and error wiring when there is no error', () => {
    render(
      <Field label="Email" description="work address">
        <TextInput />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).not.toHaveAttribute('aria-invalid');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(ids).toHaveLength(1);
  });
});
