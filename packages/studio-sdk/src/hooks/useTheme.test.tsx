import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeProvider, useTheme } from './useTheme';

function ThemeConsumer() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={() => {
        toggle();
      }}
    >
      {theme}
    </button>
  );
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('useTheme', () => {
  it('stamps data-theme on the root and flips it light<->dark on toggle', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    const root = document.documentElement;
    // jsdom has no matchMedia, so the system default resolves to light.
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(screen.getByRole('button')).toHaveTextContent('light');

    await user.click(screen.getByRole('button'));
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button')).toHaveTextContent('dark');

    await user.click(screen.getByRole('button'));
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('throws when used outside a ThemeProvider', () => {
    expect(() => render(<ThemeConsumer />)).toThrow(/ThemeProvider/);
  });
});
