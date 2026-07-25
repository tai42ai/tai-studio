import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Field } from './field';
import { RadioGroup } from './radio-group';

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
];

describe('RadioGroup', () => {
  it('renders a radiogroup with a radio per option', () => {
    render(<RadioGroup options={OPTIONS} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Apple' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Banana' })).toBeInTheDocument();
  });

  it('selecting a radio fires onValueChange with its value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<RadioGroup options={OPTIONS} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('radio', { name: 'Banana' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('radio', { name: 'Banana' })).toBeChecked();
  });

  it('takes the enclosing Field label as its accessible group name', () => {
    render(
      <Field label="Fruit">
        <RadioGroup options={OPTIONS} />
      </Field>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Fruit' })).toBeInTheDocument();
  });
});
