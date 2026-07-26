import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProgressBar } from './progress-bar';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

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

describe.each(['light', 'dark'] as const)('ProgressBar under the %s theme', (theme) => {
  it('renders its track, fill and label unchanged', () => {
    document.documentElement.setAttribute('data-theme', theme);
    render(<ProgressBar value={5} total={10} message="Uploading" />);

    const bar = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(bar).toHaveClass('tai-progress-track');
    expect(bar.firstElementChild).toHaveClass('tai-progress-fill');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});
