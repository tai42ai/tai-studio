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
});
