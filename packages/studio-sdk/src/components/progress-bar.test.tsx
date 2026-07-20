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
});
