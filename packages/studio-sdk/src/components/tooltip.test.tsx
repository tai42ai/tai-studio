import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Button } from './primitives';
import { Tooltip } from './tooltip';

describe('Tooltip', () => {
  it('shows tooltip content on focus with role=tooltip', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Runs the tool" delayDuration={0}>
        <Button>Run</Button>
      </Tooltip>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.tab(); // move focus to the trigger
    expect(screen.getByRole('button', { name: 'Run' })).toHaveFocus();
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Runs the tool');
  });
});
