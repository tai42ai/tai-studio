/**
 * The fill-mode primitive: a page opts in with `useFillViewport`, the shell reads
 * `usePageFillActive`, and the flag is ref-counted so it clears exactly when the
 * last fill page unmounts. Outside a provider the opt-in throws (no silent no-op).
 */
import { describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState, type ReactNode } from 'react';

import { PageFillProvider, useFillViewport, usePageFillActive } from './page-fill';

/** Reports the active flag as text so a test can read it off the DOM. */
function ActiveProbe(): ReactNode {
  return <span data-testid="active">{usePageFillActive() ? 'fill' : 'default'}</span>;
}

/** A page that requests fill mode for as long as it is mounted. */
function FillPage(): ReactNode {
  useFillViewport();
  return <div data-testid="fill-page" />;
}

function activeText(): string | null {
  return screen.getByTestId('active').textContent;
}

describe('page-fill primitive', () => {
  it('is inactive by default and turns active while a fill page is mounted', () => {
    function Harness(): ReactNode {
      const [showFill, setShowFill] = useState(false);
      return (
        <PageFillProvider>
          <ActiveProbe />
          {showFill ? <FillPage /> : null}
          <button
            type="button"
            onClick={() => {
              setShowFill((v) => !v);
            }}
          >
            toggle
          </button>
        </PageFillProvider>
      );
    }
    render(<Harness />);
    expect(activeText()).toBe('default');

    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    expect(activeText()).toBe('fill');

    // Unmounting the page releases its hold; the flag returns to default.
    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    expect(activeText()).toBe('default');
  });

  it('stays active until the LAST fill page unmounts (ref-counted)', () => {
    function Harness(): ReactNode {
      const [pages, setPages] = useState(2);
      return (
        <PageFillProvider>
          <ActiveProbe />
          {Array.from({ length: pages }, (_, i) => (
            <FillPage key={i} />
          ))}
          <button
            type="button"
            onClick={() => {
              setPages((n) => Math.max(0, n - 1));
            }}
          >
            drop
          </button>
        </PageFillProvider>
      );
    }
    render(<Harness />);
    expect(activeText()).toBe('fill');

    // Dropping one of two fill pages leaves the flag on.
    act(() => {
      screen.getByRole('button', { name: 'drop' }).click();
    });
    expect(activeText()).toBe('fill');

    // Dropping the last one clears it.
    act(() => {
      screen.getByRole('button', { name: 'drop' }).click();
    });
    expect(activeText()).toBe('default');
  });

  it('throws when used outside a provider (no silent no-op)', () => {
    expect(() => render(<FillPage />)).toThrow(/PageFillProvider/);
  });
});
