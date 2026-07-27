import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RevealInput } from './reveal-input';

describe('RevealInput', () => {
  it('masks the value by default (type=password) and exposes a "Show value" toggle', () => {
    render(<RevealInput label="Secret" value="s3cr3t" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show value' })).toBeInTheDocument();
  });

  it('reveals the value on toggle (type=text) and flips the button accessible name', async () => {
    const user = userEvent.setup();
    render(<RevealInput label="Secret" value="s3cr3t" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Show value' }));

    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide value' })).toBeInTheDocument();
  });

  it('fires onChange while editable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RevealInput label="Secret" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText('Secret'), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('is read-only when onChange is omitted but still revealable', async () => {
    const user = userEvent.setup();
    render(<RevealInput label="Secret" value="s3cr3t" />);
    const input = screen.getByLabelText('Secret');
    expect(input).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: 'Show value' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('renders a value containing <script> as the input value, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(<RevealInput label="Secret" value={payload} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Secret')).toHaveValue(payload);
    expect(container.querySelector('script')).toBeNull();
  });

  it('labels the inner input via an aria-label passthrough when no visual label is given', () => {
    render(<RevealInput aria-label="OPENAI_API_KEY value" value="s3cr3t" onChange={vi.fn()} />);
    expect(screen.getByLabelText('OPENAI_API_KEY value')).toHaveAttribute('type', 'password');
  });

  it('stays revealable when readOnly is set and disabled is absent', async () => {
    const user = userEvent.setup();
    render(<RevealInput label="Secret" value="s3cr3t" onChange={vi.fn()} readOnly />);
    const input = screen.getByLabelText('Secret');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('type', 'password');

    const toggle = screen.getByRole('button', { name: 'Show value' });
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
  });

  it('does not fire onChange when readOnly, even with a handler', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RevealInput label="Secret" value="s3cr3t" onChange={onChange} readOnly />);

    await user.type(screen.getByLabelText('Secret'), 'x');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts the field on tai-input and the toggle on tai-icon-btn', () => {
    render(<RevealInput label="Secret" value="s3cr3t" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Secret')).toHaveClass('tai-input');
    expect(screen.getByRole('button', { name: 'Show value' })).toHaveClass('tai-icon-btn');
  });

  it('draws the reveal mark as an icon whose only name is the button label', async () => {
    const user = userEvent.setup();
    render(<RevealInput label="Secret" value="s3cr3t" onChange={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: 'Show value' });
    expect(toggle.querySelector('svg')).toHaveClass('tai-icon');
    expect(toggle.textContent).toBe('');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide value' }).querySelector('svg')).toHaveClass(
      'tai-icon',
    );
  });
});

it('renders the field and toggle and keeps their accessible names', () => {
  render(<RevealInput label="Secret" value="s3cr3t" onChange={vi.fn()} />);

  expect(screen.getByLabelText('Secret')).toHaveClass('tai-input');
  expect(screen.getByRole('button', { name: 'Show value' })).toHaveClass('tai-icon-btn');
});
