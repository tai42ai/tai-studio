/**
 * The from-scratch inline-SVG chart primitives. These pin the accessible summary,
 * the empty-series degradation, the single-point geometry, and the proportional
 * bar widths — the parts a charting dependency would otherwise hide.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { AreaChart, BarList, type AreaPoint, type BarItem } from './charts';

/** The proportional fill span within a bar row, as its inline-width string. */
function fillWidth(row: Element | undefined): string {
  const fill = row?.querySelector('span[style*="width"]');
  if (!(fill instanceof HTMLElement)) throw new Error('bar fill not found');
  return fill.style.width;
}

describe('AreaChart', () => {
  it('renders nothing for an empty series (the caller shows the empty note)', () => {
    const { container } = render(
      <AreaChart points={[]} ariaLabel="Runs over time" formatValue={String} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes an accessible summary carrying the latest formatted value', () => {
    const points: AreaPoint[] = [
      { label: 'Mon', value: 3 },
      { label: 'Tue', value: 7 },
    ];
    render(
      <AreaChart
        points={points}
        ariaLabel="Runs over time"
        formatValue={(v) => `${String(v)} runs`}
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('aria-label', 'Runs over time. Latest 7 runs.');
  });

  it('plots one point per datum with a per-point title', () => {
    const points: AreaPoint[] = [
      { label: 'Mon', value: 3 },
      { label: 'Tue', value: 7 },
    ];
    render(<AreaChart points={points} ariaLabel="Runs" formatValue={String} />);

    expect(within(screen.getByRole('img')).getByText('Mon: 3')).toBeInTheDocument();
    expect(within(screen.getByRole('img')).getByText('Tue: 7')).toBeInTheDocument();
  });

  it('degrades a single point to a centered, flat-baseline polyline', () => {
    render(
      <AreaChart points={[{ label: 'Mon', value: 5 }]} ariaLabel="Runs" formatValue={String} />,
    );
    // A single datum sits at the horizontal center (viewBox width 600 → x=300) and,
    // as the series max, on the top inner edge (y = PAD = 4).
    const polyline = screen.getByRole('img').querySelector('polyline');
    expect(polyline).toHaveAttribute('points', '300,4');
  });
});

describe('BarList', () => {
  it('renders a labelled row per item with its caption', () => {
    const items: BarItem[] = [
      { key: 'gpt-4o', label: 'gpt-4o', value: 10, caption: '$1.00' },
      { key: 'haiku', label: 'haiku', value: 5, caption: '$0.50' },
    ];
    render(<BarList items={items} ariaLabel="Cost by model" />);

    const list = screen.getByRole('list', { name: 'Cost by model' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('gpt-4o')).toBeInTheDocument();
    expect(within(list).getByText('$1.00')).toBeInTheDocument();
    expect(within(list).getByText('haiku')).toBeInTheDocument();
    expect(within(list).getByText('$0.50')).toBeInTheDocument();
  });

  it('sizes each bar as a percentage of the largest value', () => {
    const items: BarItem[] = [
      { key: 'gpt-4o', label: 'gpt-4o', value: 10, caption: 'a' },
      { key: 'haiku', label: 'haiku', value: 5, caption: 'b' },
    ];
    render(<BarList items={items} ariaLabel="Cost by model" />);

    const rows = screen.getAllByRole('listitem');
    expect(fillWidth(rows[0])).toBe('100%');
    expect(fillWidth(rows[1])).toBe('50%');
  });

  it('avoids a divide-by-zero when every value is zero', () => {
    const items: BarItem[] = [{ key: 'z', label: 'z', value: 0, caption: 'zero' }];
    render(<BarList items={items} ariaLabel="Cost by model" />);

    expect(fillWidth(screen.getByRole('listitem'))).toBe('0%');
  });
});
