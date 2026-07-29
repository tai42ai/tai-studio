import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('is determinate and advances when a positive total is known', () => {
    const { rerender } = render(<ProgressBar value={2} total={10} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
    expect(screen.getByText('20%')).toBeInTheDocument();

    rerender(<ProgressBar value={7} total={10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '7');
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('clamps an over-total value to 100%', () => {
    render(<ProgressBar value={99} total={10} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('is indeterminate with no positive total (no aria-valuenow)', () => {
    render(<ProgressBar />);
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('renders the status message', () => {
    render(<ProgressBar value={1} total={4} message="Uploading" />);
    expect(screen.getByText('Uploading')).toBeInTheDocument();
  });

  it('says it is working even with no message, so a still bar is not read as done', () => {
    // Under `prefers-reduced-motion` the indeterminate fill is a full, static
    // track — visually a finished bar. This line is the only thing separating
    // the two for a sighted reader, so it renders whether or not a caller
    // supplied a message.
    render(<ProgressBar />);
    expect(screen.getByText('Working…')).toBeInTheDocument();
  });

  it('is a track plus a fill whose width is the only per-instance value', () => {
    render(<ProgressBar value={3} total={10} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveClass('tai-progress-track');

    const fill = bar.firstElementChild;
    expect(fill).toHaveClass('tai-progress-fill');
    expect(fill).not.toHaveClass('tai-progress-fill-indeterminate');
    expect(fill).toHaveStyle({ width: '30%' });
  });

  it('sweeps on the indeterminate fill class when no total is known', () => {
    render(<ProgressBar />);

    const fill = screen.getByRole('progressbar').firstElementChild;
    expect(fill).toHaveClass('tai-progress-fill', 'tai-progress-fill-indeterminate');
    expect(fill).not.toHaveAttribute('style');
  });

  it('keeps the aria-value fields and the label on the track', () => {
    render(<ProgressBar value={2} total={8} message="Uploading" />);

    const bar = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '8');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
  });
});

describe('the announced value', () => {
  // `aria-valuenow` is derived from `value` directly. Computing it as
  // `fraction * total` does not round-trip in binary floating point, so these
  // pairs announced things like `7.000000000000001` to a screen reader.
  it.each([
    [7, 25],
    [15, 22],
    [1, 3],
    [29, 60],
  ])('announces %i/%i as an exact integer', (value, total) => {
    render(<ProgressBar value={value} total={total} />);

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(String(value));
  });

  it('clamps an out-of-range value into [0, total] rather than announcing it raw', () => {
    render(<ProgressBar value={99} total={10} />);

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('10');
  });

  it('announces the floor for a negative or NaN value', () => {
    const { rerender } = render(<ProgressBar value={-4} total={10} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');

    rerender(<ProgressBar value={Number.NaN} total={10} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });

  it('treats an unbounded total as indeterminate rather than announcing against it', () => {
    render(<ProgressBar value={5} total={Number.POSITIVE_INFINITY} />);

    // `aria-valuemax="Infinity"` is not a bound any assistive technology can
    // place a value against, and the fill would draw 0 % while announcing 5.
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuemax');
    expect(bar.querySelector('.tai-progress-fill-indeterminate')).not.toBeNull();
  });

  it('announces nothing rather than NaN when the total is NaN', () => {
    render(<ProgressBar value={5} total={Number.NaN} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuemax');
  });

  it('renders the track, the fill and the percentage label', () => {
    render(<ProgressBar value={5} total={10} message="Uploading" />);

    const bar = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(bar).toHaveClass('tai-progress-track');
    expect(bar.firstElementChild).toHaveClass('tai-progress-fill');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});
