import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Stepper, type StepperStep } from './stepper';

const STEPS: readonly StepperStep[] = [
  { id: 'connect', label: 'Connect', status: 'done' },
  { id: 'pick', label: 'Pick tools', status: 'current' },
  { id: 'done', label: 'Done', status: 'upcoming' },
];

describe('Stepper', () => {
  it('draws a named nav over an ordered list, one item per step', () => {
    render(<Stepper aria-label="Connection steps" steps={STEPS} />);
    const nav = screen.getByRole('navigation', { name: 'Connection steps' });
    const items = screen.getAllByRole('listitem');
    expect(nav).toContainElement(items[0] ?? null);
    expect(items).toHaveLength(3);
  });

  it('marks only the current step with aria-current="step"', () => {
    render(<Stepper aria-label="Connection steps" steps={STEPS} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).not.toHaveAttribute('aria-current');
  });

  it('says each state in text, never by colour alone', () => {
    render(
      <Stepper
        aria-label="Steps"
        steps={[
          { id: 'a', label: 'One', status: 'done' },
          { id: 'b', label: 'Two', status: 'error' },
          { id: 'c', label: 'Three', status: 'current' },
          { id: 'd', label: 'Four', status: 'upcoming' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('completed');
    expect(items[1]).toHaveTextContent('failed');
    expect(items[2]).toHaveTextContent('current step');
    expect(items[3]).toHaveTextContent('not started');
  });

  it('names the current position for the narrow layout', () => {
    render(<Stepper aria-label="Connection steps" steps={STEPS} />);
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Step 2 of 3: Pick tools');
  });

  it('draws no button without onStepSelect', () => {
    render(<Stepper aria-label="Connection steps" steps={STEPS} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('makes only done steps buttons that select their id by click and keyboard', async () => {
    const user = userEvent.setup();
    const onStepSelect = vi.fn();
    render(<Stepper aria-label="Connection steps" steps={STEPS} onStepSelect={onStepSelect} />);
    // `getByRole` throws unless exactly one button renders: only the done step is one.
    const button = screen.getByRole('button');
    await user.click(button);
    expect(onStepSelect).toHaveBeenLastCalledWith('connect');
    button.focus();
    await user.keyboard('{Enter}');
    expect(onStepSelect).toHaveBeenCalledTimes(2);
  });
});
