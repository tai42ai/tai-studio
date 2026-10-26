/**
 * The read-failure classifiers key on the skeleton's pinned error code: a 400 is
 * shared by unrelated client faults, so the status alone never names a surface.
 */
import { ApiError } from '@tai42/api-client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  isReadNotServed,
  isReadNotSupported,
  isReadTooBroad,
  ReadNotServedNotice,
} from './read-support';

describe('isReadNotServed', () => {
  it('is true for the not-served code', () => {
    expect(
      isReadNotServed(
        new ApiError('Sort by latency is not served.', 400, 'monitoring-read-not-served'),
      ),
    ).toBe(true);
  });

  it('is false for a plain 400, the other read codes and a non-api error', () => {
    expect(isReadNotServed(new ApiError('bad input', 400))).toBe(false);
    expect(isReadNotServed(new ApiError('too broad', 400, 'monitoring-read-too-broad'))).toBe(
      false,
    );
    expect(isReadNotServed(new ApiError('cannot read', 501, 'monitoring-read-not-supported'))).toBe(
      false,
    );
    expect(isReadNotServed(new Error('monitoring-read-not-served'))).toBe(false);
  });

  it('is not mistaken for the other two read failures', () => {
    const notServed = new ApiError('x', 400, 'monitoring-read-not-served');
    expect(isReadNotSupported(notServed)).toBe(false);
    expect(isReadTooBroad(notServed)).toBe(false);
  });
});

describe('ReadNotServedNotice', () => {
  it('announces the heading and the backend message verbatim', () => {
    render(<ReadNotServedNotice message={'Line one.\nLine two.'} />);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveAttribute('data-testid', 'observability-read-not-served');
    expect(notice).toHaveTextContent('This request is not served by the monitoring backend');
    expect(screen.getByText(/Line one\.\s+Line two\./)).toHaveStyle({ whiteSpace: 'pre-wrap' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders an action after the message when one is given', () => {
    render(<ReadNotServedNotice message="m" action={<button type="button">Act</button>} />);
    expect(screen.getByRole('alert')).toContainElement(screen.getByRole('button', { name: 'Act' }));
  });
});
