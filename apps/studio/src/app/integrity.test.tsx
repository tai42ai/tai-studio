/**
 * Import-map integrity honesty: the feature-detect predicate and the loud
 * non-blocking banner it drives when the browser does not enforce integrity.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { IntegrityBanner, importMapIntegrityEnforced } from './integrity';

describe('import-map integrity feature-detect', () => {
  it('reports NOT enforced when HTMLScriptElement.supports is absent', () => {
    expect(importMapIntegrityEnforced({})).toBe(false);
  });

  it('reports NOT enforced when supports() returns false for importmap', () => {
    expect(importMapIntegrityEnforced({ supports: () => false })).toBe(false);
  });

  it('reports enforced when supports("importmap") is true', () => {
    expect(importMapIntegrityEnforced({ supports: (type) => type === 'importmap' })).toBe(true);
  });

  it('reports NOT enforced when the probe throws', () => {
    expect(
      importMapIntegrityEnforced({
        supports: () => {
          throw new Error('nope');
        },
      }),
    ).toBe(false);
  });

  it('renders the loud banner when integrity is unsupported', () => {
    render(<IntegrityBanner />);
    expect(screen.getByTestId('integrity-banner')).toHaveTextContent(
      /byte-integrity not enforced by this browser/i,
    );
  });
});
