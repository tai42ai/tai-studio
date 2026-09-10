import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ExpressionFieldContext, type ExpressionFieldProps } from '../schema-form';
import { BindingJqField, appendTjq } from './BindingJqField';

describe('appendTjq', () => {
  it('inserts a tjq_<name>({…}) call, space-separated when the field is non-empty', () => {
    expect(appendTjq('', 'current')).toBe('tjq_current({})');
    expect(appendTjq('.a +', 'tally.bump')).toBe('.a + tjq_tally__bump({})');
    expect(appendTjq('  .a  ', 'x')).toBe('.a tjq_x({})');
  });
});

describe('BindingJqField', () => {
  it('falls back to a plain textarea when no expression door is injected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BindingJqField label="Subject" value="" onChange={onChange} />);
    const box = screen.getByLabelText('Subject');
    expect(box.tagName).toBe('TEXTAREA');
    await user.type(box, '.id');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows the field error', () => {
    render(
      <BindingJqField label="Subject" value="" onChange={vi.fn()} error="This is not valid jq." />,
    );
    expect(screen.getByText('This is not valid jq.')).toBeInTheDocument();
  });

  it('renders the injected expression door instead of the textarea', () => {
    function Door(props: ExpressionFieldProps) {
      return <textarea aria-label={`door ${props.label}`} value={props.value} readOnly />;
    }
    render(
      <ExpressionFieldContext.Provider value={Door}>
        <BindingJqField label="Subject" value=".id" onChange={vi.fn()} />
      </ExpressionFieldContext.Provider>,
    );
    expect(screen.getByLabelText('door Subject')).toBeInTheDocument();
  });

  it('offers only input-purpose suggestions as inserts — an update jq is never offered', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BindingJqField
        label="Subject"
        value=".a"
        onChange={onChange}
        suggestions={[
          { ref: 'current', purpose: 'input', description: 'the head' },
          { ref: 'tally.bump', purpose: 'update' },
        ]}
      />,
    );
    // The input jq is offered as a compact chip: an aria-hidden plus icon is
    // decorative, so the chip reads as a control while its accessible name stays the
    // call text.
    const insert = screen.getByRole('button', { name: 'tjq_current({})' });
    expect(insert.querySelector('svg.tai-icon')).not.toBeNull();
    await user.click(insert);
    expect(onChange).toHaveBeenCalledWith('.a tjq_current({})');
    expect(
      screen.getByRole('group', { name: 'Insert template jq into Subject' }),
    ).toBeInTheDocument();
    // The update jq returns an op batch and is NOT callable from an expression.
    expect(screen.queryByRole('button', { name: 'tjq_tally__bump({})' })).not.toBeInTheDocument();
  });

  it('renders no insert group when every suggestion is update-purpose', () => {
    render(
      <BindingJqField
        label="Subject"
        value=""
        onChange={vi.fn()}
        suggestions={[{ ref: 'tally.bump', purpose: 'update' }]}
      />,
    );
    expect(
      screen.queryByRole('group', { name: 'Insert template jq into Subject' }),
    ).not.toBeInTheDocument();
  });
});
