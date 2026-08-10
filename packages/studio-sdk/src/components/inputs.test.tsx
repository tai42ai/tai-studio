import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
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

  it("wears the shared control class and appends the caller's", () => {
    render(<TextInput aria-label="name" className="tai-input-mono" />);
    expect(screen.getByRole('textbox', { name: 'name' })).toHaveAttribute(
      'class',
      'tai-input tai-input-mono',
    );
  });
});

describe('Textarea', () => {
  it('renders a multiline textbox and accepts input', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="notes" />);
    const area = screen.getByRole('textbox', { name: 'notes' });
    await user.type(area, 'line');
    expect(area).toHaveValue('line');
    expect(area).toHaveClass('tai-textarea');
  });

  it('is disabled when it says so', () => {
    render(<Textarea aria-label="notes" disabled />);
    expect(screen.getByRole('textbox', { name: 'notes' })).toBeDisabled();
  });
});

describe('NumberInput', () => {
  it('renders a spinbutton and accepts a number', async () => {
    const user = userEvent.setup();
    render(<NumberInput aria-label="count" />);
    const input = screen.getByRole('spinbutton', { name: 'count' });
    await user.type(input, '42');
    expect(input).toHaveValue(42);
    expect(input).toHaveClass('tai-input');
  });
});

describe('control refs', () => {
  it('forwards a consumer ref to the native control each wrapper renders', () => {
    // A ref a wrapper accepts and drops is worse than one it refuses: React 19
    // warns about neither, so the consumer's focus call silently does nothing.
    const text = createRef<HTMLInputElement>();
    const area = createRef<HTMLTextAreaElement>();
    const number = createRef<HTMLInputElement>();

    render(
      <>
        <TextInput ref={text} aria-label="Name" />
        <Textarea ref={area} aria-label="Notes" />
        <NumberInput ref={number} aria-label="Count" />
      </>,
    );

    expect(text.current).toBe(screen.getByRole('textbox', { name: 'Name' }));
    expect(area.current).toBe(screen.getByRole('textbox', { name: 'Notes' }));
    expect(number.current).toBe(screen.getByRole('spinbutton', { name: 'Count' }));
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

  it("keeps the field's description IDREFs when the caller adds one of its own", () => {
    // The `aria-describedby` IDREF list is shared: a caller's own `aria-describedby`
    // merges with the field's description and error IDREFs rather than replacing
    // them, so neither side's wiring silently vanishes. Both sides keep their entries.
    render(
      <>
        <span id="own-hint">no spaces allowed</span>
        <Field label="Email" description="work address" error="required">
          <TextInput aria-describedby="own-hint" />
        </Field>
      </>,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe('own-hint');
    for (const id of ids) expect(document.getElementById(id)).not.toBeNull();
    expect(input).toHaveAccessibleDescription('no spaces allowed work address required');
  });

  it("lets the caller's own id and aria-invalid win over the field's", () => {
    // `id` and `aria-invalid` are single-valued, so there is nothing to merge and
    // an explicit prop is a decision: a Field hosting more than one control has
    // to be able to give the second one an id of its own, and a control that
    // knows itself invalid must be able to say so under a Field that does not.
    render(
      <Field label="Email" description="work address">
        <TextInput id="my-own-id" aria-invalid="true" />
      </Field>,
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'my-own-id');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // The description IDREF the Field owns is untouched by either.
    expect(input).toHaveAccessibleDescription('work address');
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

  it('carries the design-system classes and pairs the error with an icon', () => {
    const { container } = render(
      <Field label="Email" description="work address" error="required">
        <TextInput />
      </Field>,
    );

    expect(container.querySelector('.tai-field')).not.toBeNull();
    expect(screen.getByText('Email')).toHaveClass('tai-field-label');
    expect(screen.getByText('work address')).toHaveClass('tai-field-hint');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('tai-field-error');
    // The invalid state is an icon plus the message, never the color alone.
    expect(alert.querySelector('svg')).not.toBeNull();
  });
});
