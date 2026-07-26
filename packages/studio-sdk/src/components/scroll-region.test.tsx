import { act, render, screen, waitFor, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ScrollRegion, useProseTableRegions } from './scroll-region';
import { flushResizeObservers, setElementOverflow } from '../testing';

/** The one `.tai-scroll-region` in the tree, failing loudly when it is missing. */
function scrollRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector<HTMLElement>('.tai-scroll-region');
  if (region === null) throw new Error('no .tai-scroll-region rendered');
  return region;
}

/** Flips the region's measured overflow and lets its observer see the change. */
function setOverflowing(region: HTMLElement, overflowing: boolean): void {
  setElementOverflow(region, overflowing);
  act(() => {
    flushResizeObservers();
  });
}

describe('ScrollRegion', () => {
  it('is neither a tab stop nor a landmark while its content fits', () => {
    const { container } = render(
      <ScrollRegion label="Tool results">
        <table>
          <tbody>
            <tr>
              <td>fits</td>
            </tr>
          </tbody>
        </table>
      </ScrollRegion>,
    );

    const region = scrollRegion(container);
    expect(region).not.toHaveAttribute('tabindex');
    expect(region).not.toHaveAttribute('role');
    expect(region).not.toHaveAttribute('aria-label');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('becomes a named, focusable region once it overflows', () => {
    const { container } = render(
      <ScrollRegion label="Tool results">
        <p>wide</p>
      </ScrollRegion>,
    );

    setOverflowing(scrollRegion(container), true);

    const region = screen.getByRole('region', { name: 'Tool results' });
    expect(region).toHaveClass('tai-scroll-region');
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('re-evaluates when the measurement changes back', () => {
    const { container } = render(
      <ScrollRegion label="Tool results">
        <p>wide</p>
      </ScrollRegion>,
    );
    const region = scrollRegion(container);

    setOverflowing(region, true);
    expect(screen.getByRole('region', { name: 'Tool results' })).toBe(region);

    setOverflowing(region, false);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(region).not.toHaveAttribute('tabindex');
  });

  it('re-measures when the content is replaced', async () => {
    function Host() {
      const [wide, setWide] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setWide(true);
            }}
          >
            widen
          </button>
          <ScrollRegion label="Tool results">
            {wide ? <p data-testid="wide">wide</p> : <p data-testid="narrow">narrow</p>}
          </ScrollRegion>
        </>
      );
    }
    const { container } = render(<Host />);
    const region = scrollRegion(container);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    // The replacement content overflows; swapping it must re-take the
    // measurement rather than keep the mount-time answer.
    setElementOverflow(region, true);
    act(() => {
      screen.getByRole('button', { name: 'widen' }).click();
    });

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Tool results' })).toBe(region);
    });
    expect(screen.getByTestId('wide')).toBeInTheDocument();
  });

  it('merges the caller className and style onto the region', () => {
    const { container } = render(
      <ScrollRegion label="Tool results" className="extra" style={{ maxWidth: '20rem' }}>
        <p>body</p>
      </ScrollRegion>,
    );

    const region = scrollRegion(container);
    expect(region).toHaveClass('tai-scroll-region', 'extra');
    expect(region.style.maxWidth).toBe('20rem');
  });

  it('renders its content and keeps its name under both themes', () => {
    const { container } = render(
      <ScrollRegion label="Tool results">
        <p>body</p>
      </ScrollRegion>,
    );
    setOverflowing(scrollRegion(container), true);

    for (const theme of ['light', 'dark'] as const) {
      document.documentElement.setAttribute('data-theme', theme);
      const region = screen.getByRole('region', { name: 'Tool results' });
      expect(region).toHaveClass('tai-scroll-region');
      expect(within(region).getByText('body')).toBeInTheDocument();
    }
    document.documentElement.removeAttribute('data-theme');
  });
});

function ProseHost({ html, fallbackLabel }: { html: string; fallbackLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useProseTableRegions(ref, fallbackLabel === undefined ? undefined : { fallbackLabel });
  return <div ref={ref} data-testid="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

const TABLE_HTML = '<table><tbody><tr><td>cell</td></tr></tbody></table>';

describe('useProseTableRegions', () => {
  it('wraps each injected table in a scroll region', () => {
    const { container } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);

    const wrappers = container.querySelectorAll('.tai-scroll-region');
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0]?.firstElementChild?.tagName).toBe('TABLE');
  });

  it('names an overflowing table after the nearest preceding heading', () => {
    const { container } = render(
      <ProseHost
        html={`<h2>Installation</h2><p>text</p><h3>Options</h3><p>text</p>${TABLE_HTML}`}
      />,
    );

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Options' })).toBeInTheDocument();
  });

  it('finds a heading that sits above the table in an earlier ancestor branch', () => {
    const { container } = render(
      <ProseHost html={`<section><h2>Reference</h2></section><div>${TABLE_HTML}</div>`} />,
    );

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Reference' })).toBeInTheDocument();
  });

  it('falls back to the README table label with no preceding heading', () => {
    const { container } = render(<ProseHost html={TABLE_HTML} />);

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'README table' })).toBeInTheDocument();
  });

  it('honours a caller-supplied fallback label', () => {
    const { container } = render(<ProseHost html={TABLE_HTML} fallbackLabel="Manifest table" />);

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Manifest table' })).toBeInTheDocument();
  });

  it('leaves a table that fits unnamed and untabbable', () => {
    const { container } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);

    const wrapper = scrollRegion(container);
    expect(wrapper).not.toHaveAttribute('tabindex');
    expect(wrapper).not.toHaveAttribute('role');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('never double-wraps a table across repeated passes', () => {
    const { container } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);
    const wrapper = scrollRegion(container);

    act(() => {
      flushResizeObservers();
      flushResizeObservers();
    });

    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(1);
    expect(scrollRegion(container)).toBe(wrapper);
  });

  it('re-instruments after the injected HTML is replaced', async () => {
    const { container, rerender } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(1);

    rerender(<ProseHost html={`<h2>Limits</h2>${TABLE_HTML}${TABLE_HTML}`} />);

    await waitFor(() => {
      expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(2);
    });
    for (const wrapper of container.querySelectorAll<HTMLElement>('.tai-scroll-region')) {
      setElementOverflow(wrapper, true);
    }
    act(() => {
      flushResizeObservers();
    });
    expect(screen.getAllByRole('region', { name: 'Limits' })).toHaveLength(2);
  });

  it('does nothing when the ref is unattached', () => {
    function Detached() {
      const ref = useRef<HTMLDivElement>(null);
      useProseTableRegions(ref);
      return <div data-testid="empty" />;
    }
    const { container } = render(<Detached />);
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(0);
  });

  it('stops observing once the host unmounts', () => {
    const { container, unmount } = render(<ProseHost html={TABLE_HTML} />);
    const wrapper = scrollRegion(container);
    setElementOverflow(wrapper, true);

    unmount();
    act(() => {
      flushResizeObservers();
    });
    expect(wrapper).not.toHaveAttribute('role');
  });
});
