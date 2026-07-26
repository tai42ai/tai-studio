import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './primitives';
import { Tooltip } from './tooltip';

/** Narrow the viewport to the smallest supported width for a layout sanity render. */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  setViewportWidth(1024);
});

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

  it('dresses the bubble in the design-system tooltip surface and keeps the aria wiring', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Runs the tool" delayDuration={0}>
        <Button>Run</Button>
      </Tooltip>,
    );
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    // Radix names the trigger's description; the class dresses the visible bubble.
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-describedby', tip.id);
    const bubble = document.querySelector('.tai-tooltip');
    expect(bubble).not.toBeNull();
    expect(bubble).toHaveTextContent('Runs the tool');
  });

  it('honours the provider delay before opening', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Runs the tool" delayDuration={10_000}>
        <Button>Run</Button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'Run' }));
    // Still closed: the Provider's delay has not elapsed.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders at a 320 px viewport', async () => {
    setViewportWidth(320);
    const user = userEvent.setup();
    render(
      <Tooltip content="Runs the tool" delayDuration={0}>
        <Button>Run</Button>
      </Tooltip>,
    );
    await user.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Runs the tool');
    expect(document.querySelector('.tai-tooltip')).not.toBeNull();
  });

  describe.each(['light', 'dark'] as const)('under the %s theme', (theme) => {
    it('renders its content and keeps the trigger accessible name', async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const user = userEvent.setup();
      render(
        <Tooltip content="Runs the tool" delayDuration={0}>
          <Button>Run</Button>
        </Tooltip>,
      );
      await user.tab();
      expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
      const tip = await screen.findByRole('tooltip');
      expect(tip).toHaveTextContent('Runs the tool');
      expect(document.querySelector('.tai-tooltip')).toHaveTextContent('Runs the tool');
    });
  });
});
