import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FeatureDisabled, featureDisabledMessage, isFeatureDisabled } from './feature-disabled';

/**
 * An ApiError-shaped value built WITHOUT importing `@tai42/api-client` — the SDK is
 * the leaf package and must not import it at runtime, and the predicate duck-types
 * `status`/`code` for exactly that reason. This mirrors the real ApiError's public
 * fields (`name`/`status`/`code`).
 */
function apiErrorLike(status: number, code?: string): unknown {
  return Object.assign(new Error('api error'), { name: 'ApiError', status, code });
}

describe('isFeatureDisabled', () => {
  it('is true for HTTP 501 (the fallback signal)', () => {
    expect(isFeatureDisabled(apiErrorLike(501))).toBe(true);
  });

  it('is true for a -not-configured code on ANY status (the code is authoritative)', () => {
    expect(isFeatureDisabled(apiErrorLike(400, 'tool-meta-not-configured'))).toBe(true);
  });

  it('is true for a plain object with status 501', () => {
    expect(isFeatureDisabled({ status: 501 })).toBe(true);
  });

  it('is true for a plain object whose code ends -not-configured', () => {
    expect(isFeatureDisabled({ code: 'marketplace-not-configured' })).toBe(true);
  });

  it('is false for a 500 with no matching code (a real failure, not an OFF state)', () => {
    expect(isFeatureDisabled(apiErrorLike(500))).toBe(false);
  });

  it('is false for a 404 named-miss', () => {
    expect(isFeatureDisabled(apiErrorLike(404))).toBe(false);
  });

  it('is false for a code that merely contains, but does not end with, -not-configured', () => {
    expect(isFeatureDisabled({ code: 'not-configured-yet' })).toBe(false);
  });

  it('is false for a plain Error, a string, null and undefined', () => {
    expect(isFeatureDisabled(new Error('x'))).toBe(false);
    expect(isFeatureDisabled('nope')).toBe(false);
    expect(isFeatureDisabled(null)).toBe(false);
    expect(isFeatureDisabled(undefined)).toBe(false);
  });
});

describe('featureDisabledMessage', () => {
  it("returns the server's message verbatim when present", () => {
    const error = apiErrorLike(501, 'interactions-not-configured');
    (error as { message: string }).message =
      'the interactions store is not configured: set INTERACTIONS_REDIS_URL';
    expect(featureDisabledMessage(error)).toBe(
      'the interactions store is not configured: set INTERACTIONS_REDIS_URL',
    );
  });

  it('falls back to the machine code when the refusal carries no message', () => {
    expect(featureDisabledMessage({ status: 501, code: 'marketplace-not-configured' })).toBe(
      'marketplace-not-configured',
    );
  });

  it('raises loudly when the refusal carries neither a message nor a code', () => {
    expect(() => featureDisabledMessage({ status: 501 })).toThrow(/neither a message nor a code/);
  });
});

describe('FeatureDisabled', () => {
  it("names the feature and shows the server's message as a muted status, never an alert", () => {
    render(
      <FeatureDisabled
        feature="Interactions"
        message="the interactions store is not configured: set INTERACTIONS_REDIS_URL"
      />,
    );
    expect(screen.getByTestId('feature-disabled')).toBeInTheDocument();
    expect(screen.getByText('Interactions is not configured')).toBeInTheDocument();
    expect(screen.getByText(/INTERACTIONS_REDIS_URL/)).toBeInTheDocument();
    // The OFF state is a muted EmptyState (role=status), never the loud alert ground.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
