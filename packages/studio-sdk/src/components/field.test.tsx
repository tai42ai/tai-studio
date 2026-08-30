import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Field } from './field';
import { TextInput } from './inputs';

describe('Field', () => {
  it('appends a caller className to its own, and keeps the style prop', () => {
    const { container } = render(
      <Field label="Email" className="span-2" style={{ maxWidth: '20rem' }}>
        <TextInput />
      </Field>,
    );

    // Appended, never replacing: a field that lost `tai-field` by being
    // positioned would lose its whole layout with it.
    const field = container.querySelector('.tai-field');
    expect(field).toHaveClass('tai-field', 'span-2');
    expect((field as HTMLElement).style.maxWidth).toBe('20rem');
  });

  it('wears its own class alone when the caller names none', () => {
    const { container } = render(
      <Field label="Email">
        <TextInput />
      </Field>,
    );

    expect(container.querySelector('.tai-field')?.className).toBe('tai-field');
  });

  it('names the control it wraps from the visible label', () => {
    render(
      <Field label="Email">
        <TextInput />
      </Field>,
    );

    expect(screen.getByRole('textbox')).toHaveAccessibleName('Email');
  });

  it('keeps the label as the accessible name but visually hides it when hideLabel is set', () => {
    render(
      <Field label="Argument 2 expression" hideLabel>
        <TextInput />
      </Field>,
    );

    // The name still comes from the label — only its paint is dropped, so the
    // control stays addressable in a dense grid that shows no visible label.
    const control = screen.getByRole('textbox');
    expect(control).toHaveAccessibleName('Argument 2 expression');
    const label = screen.getByText('Argument 2 expression');
    expect(label).toHaveClass('tai-field-label', 'tai-visually-hidden');
    // The `<label for>` wiring is untouched, which is what preserves the name.
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', control.getAttribute('id'));
  });

  it('paints the label by default (hideLabel off)', () => {
    render(
      <Field label="Email">
        <TextInput />
      </Field>,
    );
    expect(screen.getByText('Email')).not.toHaveClass('tai-visually-hidden');
  });
});
